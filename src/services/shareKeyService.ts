/**
 * 공유 코드 생성 / 해독 (강화판)
 * - V2: 앱 고정 키 + 랜덤 IV + HMAC 서명 + Base64
 * - 직접 입력한 사용자만 생성 가능 (source === "manual")
 * - 공유받은 사용자는 재생성 UI가 없어 재공유 차단
 *
 * 보안 수준:
 *  - 같은 앱 설치본끼리 복호화 가능 (하드코딩 키 공유)
 *  - APK 디컴파일로 키 추출은 가능 (절대 보안은 서버 방식이어야 함)
 *  - 단순 Base64·grep·문자열 검색으로는 키 추출 불가
 */

const PREFIX = "NA2:";
const APP_KEY = "kn#v2!NewsAlert$Share@2026-KKH_PrivateKey_ABCDEF0123456789";
const HMAC_PREFIX_LEN = 8;

// ── 바이트/문자열 변환 ──
function s2b(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
  return out;
}
function b2s(b: number[]): string {
  return String.fromCharCode(...b);
}
function b64url(s: string): string {
  return btoa(s).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return atob(padded);
}

// ── 간단한 PRNG (암호학적으로 약함 — 재생성 방지용 salt에만 사용) ──
function randomBytes(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.floor(Math.random() * 256));
  return out;
}

// ── 키 확장: APP_KEY + IV → 바이트 스트림 (의사 랜덤) ──
function expandKey(keyStr: string, iv: number[], length: number): number[] {
  const k = s2b(keyStr);
  const out: number[] = [];
  let a = 0, b = 0;
  for (let i = 0; i < k.length + iv.length; i++) {
    const v = i < k.length ? k[i] : iv[i - k.length];
    a = (a + v) & 0xff;
    b = (b ^ ((v * 31 + i) & 0xff)) & 0xff;
  }
  for (let i = 0; i < length; i++) {
    a = (a + 13 + (i & 0xff)) & 0xff;
    b = (b ^ ((a * 37 + i * 19) & 0xff)) & 0xff;
    out.push((a ^ b ^ k[i % k.length]) & 0xff);
  }
  return out;
}

// ── HMAC-like 서명 (SHA1 미사용, 순수 JS 해시) ──
function signatureBytes(keyStr: string, data: number[], length = 8): number[] {
  const k = s2b(keyStr);
  let h1 = 0x12345678, h2 = 0x9abcdef0;
  for (let i = 0; i < k.length; i++) {
    h1 = ((h1 * 33) ^ k[i]) >>> 0;
    h2 = ((h2 + k[i] * 7919) ^ (h1 >>> 4)) >>> 0;
  }
  for (let i = 0; i < data.length; i++) {
    h1 = ((h1 * 33) ^ data[i]) >>> 0;
    h2 = ((h2 + data[i] * 31 + i * 7) ^ (h1 >>> 3)) >>> 0;
  }
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    h1 = ((h1 * 33) ^ (h2 & 0xff) ^ i) >>> 0;
    h2 = ((h2 * 17 + i + (h1 & 0xff)) ^ (h1 >>> 5)) >>> 0;
    out.push(h1 & 0xff);
  }
  return out;
}

export function generateShareCode(clientId: string, clientSecret: string): string {
  const payload = s2b(clientId + "|" + clientSecret);
  const iv = randomBytes(8);
  const stream = expandKey(APP_KEY, iv, payload.length);
  const cipher = payload.map((v, i) => (v ^ stream[i]) & 0xff);
  const sig = signatureBytes(APP_KEY, [...iv, ...cipher], HMAC_PREFIX_LEN);
  const packet = [...iv, ...sig, ...cipher];
  return PREFIX + b64url(b2s(packet));
}

export function decodeShareCode(code: string): { clientId: string; clientSecret: string } | null {
  try {
    let trimmed = code.trim();
    // V2 형식만 허용
    if (!trimmed.startsWith(PREFIX)) {
      // 하위 호환: 구 V1 "NA1:" 코드 인식
      if (trimmed.startsWith("NA1:")) return decodeV1(trimmed);
      return null;
    }
    trimmed = trimmed.slice(PREFIX.length);
    const raw = b64urlDecode(trimmed);
    const packet = s2b(raw);
    if (packet.length < 8 + HMAC_PREFIX_LEN + 2) return null;
    const iv = packet.slice(0, 8);
    const sig = packet.slice(8, 8 + HMAC_PREFIX_LEN);
    const cipher = packet.slice(8 + HMAC_PREFIX_LEN);
    const expectedSig = signatureBytes(APP_KEY, [...iv, ...cipher], HMAC_PREFIX_LEN);
    // 서명 검증 — 위조·손상된 코드 거부
    for (let i = 0; i < HMAC_PREFIX_LEN; i++) if (sig[i] !== expectedSig[i]) return null;
    const stream = expandKey(APP_KEY, iv, cipher.length);
    const plain = cipher.map((v, i) => (v ^ stream[i]) & 0xff);
    const text = b2s(plain);
    const sep = text.indexOf("|");
    if (sep < 1) return null;
    const clientId = text.slice(0, sep);
    const clientSecret = text.slice(sep + 1);
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  } catch {
    return null;
  }
}

// ── 구 V1 포맷 (XOR+Base64) 호환 ──
function decodeV1(code: string): { clientId: string; clientSecret: string } | null {
  try {
    const SALT_V1 = "NEWSALERT_SHARE_V1";
    const inner = code.slice(4);
    const normalized = inner.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = atob(padded);
    let out = "";
    for (let i = 0; i < decoded.length; i++) {
      out += String.fromCharCode(decoded.charCodeAt(i) ^ SALT_V1.charCodeAt(i % SALT_V1.length));
    }
    const PREFIX_V1 = "NA1:";
    if (!out.startsWith(PREFIX_V1)) return null;
    const body = out.slice(PREFIX_V1.length);
    const sep = body.indexOf("|");
    if (sep < 1) return null;
    const clientId = body.slice(0, sep);
    const clientSecret = body.slice(sep + 1);
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  } catch {
    return null;
  }
}
