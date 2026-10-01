// One-time approval (server: C:\H-Programs\h-license, lic.hyt.kr). Port of Hoffice License.kt.
//
// The owner approves a device once; the server signs "app|device|name|date"
// with its private key. The app checks that signature against PUBLIC_KEY
// itself, so after approval it works offline. Every CHECK_EVERY_MS it asks
// the server when it can, and a device the owner revoked loses its licence.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes as utf8Encode } from "@noble/hashes/utils";
import pkg from "../../package.json";

export const APP = "newsalert";
export const APP_NAME = "뉴스 알림";
const SERVER = "https://lic.hyt.kr";
const PUBLIC_KEY =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEahQLjd3xELDZwC3HbDCS3iuwW2kVGAfe6V5GwBIK3P1yAqFj0ei1dtquNaENbuFf/Y3R37cMzksaC+E0CPgGoA==";
const CHECK_EVERY_MS = 7 * 24 * 3600 * 1000;
const K_KEY = "license.key";
const K_CHECKED = "license.checked";
const K_REQUESTED = "license.requested";
const K_NAME = "license.name";

// ---- small byte helpers (no Buffer / TextDecoder needed under Hermes) ----
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function b64decode(s: string): Uint8Array {
  const clean = s.replace(/-/g, "+").replace(/_/g, "/").replace(/[=\s]/g, "");
  if (clean.length % 4 === 1) throw new Error("bad base64");
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error("bad base64");
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function utf8Decode(b: Uint8Array): string {
  // percent-encode every byte and let decodeURIComponent do UTF-8 (throws on invalid UTF-8)
  let s = "";
  for (let i = 0; i < b.length; i++) s += "%" + b[i].toString(16).padStart(2, "0");
  return decodeURIComponent(s);
}

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// raw public point = last 65 bytes of the SubjectPublicKeyInfo DER
const PUB_RAW = (() => {
  const der = b64decode(PUBLIC_KEY);
  return der.slice(der.length - 65);
})();

/** Pure check (no storage): returns the holder's name when [lic] is genuine for (app, device). */
export function verifyLicense(lic: string, app: string, device: string): string | null {
  try {
    const parts = lic.trim().split(".");
    if (parts.length !== 2) return null;
    const payload = b64decode(parts[0]);
    const sig = b64decode(parts[1]);
    const ok = p256.verify(sig, sha256(payload), PUB_RAW, { format: "der", lowS: false, prehash: false });
    if (!ok) return null;
    const f = utf8Decode(payload).split("|");
    if (f.length < 3 || f[0] !== app || f[1] !== device) return null;
    return f[2];
  } catch {
    return null;
  }
}

// ---- device ----
let deviceCache: string | null = null;

/** 16 hex digits, stable for this app on this phone (until a factory reset). */
export function deviceId(): string {
  if (deviceCache) return deviceCache;
  let androidId = "none";
  try {
    androidId = Application.getAndroidId() || "none";
  } catch {}
  deviceCache = hex(sha256(utf8Encode(`${APP}:${androidId}`)).slice(0, 8));
  return deviceCache;
}

export const deviceLabel = () => deviceId().match(/.{1,4}/g)!.join("-");

export const model = () => `${Device.manufacturer ?? ""} ${Device.modelName ?? ""}`.trim();

export const version = (): string => pkg.version;

// ---- stored licence ----
export async function valid(): Promise<boolean> {
  return (await holder()) != null;
}

/** The approved name, or null. */
export async function holder(): Promise<string | null> {
  const lic = await AsyncStorage.getItem(K_KEY);
  return lic ? verifyLicense(lic, APP, deviceId()) : null;
}

/** Stores [lic] if it is genuine and for this phone. */
export async function save(lic: string): Promise<boolean> {
  if (verifyLicense(lic, APP, deviceId()) == null) return false;
  await AsyncStorage.multiSet([
    [K_KEY, lic.trim()],
    [K_CHECKED, String(Date.now())],
  ]);
  return true;
}

export async function clear(): Promise<void> {
  await AsyncStorage.removeItem(K_KEY);
}

export async function wasRequested(): Promise<boolean> {
  return (await AsyncStorage.getItem(K_REQUESTED)) === "1";
}

export async function lastName(): Promise<string> {
  return (await AsyncStorage.getItem(K_NAME)) ?? "";
}

// ---- server ----
/** Server answer: state (pending / approved / rejected / revoked / closed / unknown) and, when approved, the licence. */
export interface Answer {
  state: string;
  license: string | null;
}

export async function request(name: string): Promise<Answer> {
  await AsyncStorage.multiSet([
    [K_REQUESTED, "1"],
    [K_NAME, name],
  ]);
  const body = JSON.stringify({ app: APP, device: deviceId(), name, model: model(), ver: version() });
  return call(`${SERVER}/api/request`, body);
}

export function status(): Promise<Answer> {
  return call(`${SERVER}/api/status?app=${APP}&device=${deviceId()}&ver=${encodeURIComponent(version())}`, null);
}

async function call(url: string, post: string | null): Promise<Answer> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, {
      method: post != null ? "POST" : "GET",
      headers: post != null ? { "Content-Type": "application/json; charset=utf-8" } : undefined,
      body: post ?? undefined,
      signal: ctl.signal,
    });
    if (r.status < 200 || r.status > 299) throw new Error(`서버 응답 ${r.status}`);
    const j = await r.json();
    return { state: String(j?.state ?? ""), license: j?.license ? String(j.license) : null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The periodic check: when due and the server answers, a revoked device
 * loses its licence (returns true). No network = nothing changes.
 */
export async function recheckIfDue(): Promise<boolean> {
  try {
    if (!(await valid())) return false;
    const last = parseInt((await AsyncStorage.getItem(K_CHECKED)) ?? "0", 10) || 0;
    if (Date.now() - last < CHECK_EVERY_MS) return false;
    let a: Answer;
    try {
      a = await status();
    } catch {
      return false;
    }
    await AsyncStorage.setItem(K_CHECKED, String(Date.now()));
    if (a.state === "revoked") {
      await clear();
      return true;
    }
  } catch {}
  return false;
}
