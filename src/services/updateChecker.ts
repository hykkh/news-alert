// In-app update checker — wine-cellar 와 동일 패턴 (메모리 룰: 모든 H-Programs default)
import { Linking } from "react-native";
import pkg from "../../package.json";

const RELEASES_API = "https://api.github.com/repos/hykkh/h-programs/releases/latest";
const APK_URL = "https://github.com/hykkh/h-programs/releases/latest/download/news-alert.apk";

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseNotes?: string;
  apkUrl: string;
}

function isNewer(latest: string, current: string): boolean {
  const a = latest.split(".").map((n) => parseInt(n, 10) || 0);
  const b = current.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const r = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  const j = await r.json();
  const latest = String(j.tag_name ?? "").replace(/^v/, "");
  const current = pkg.version;
  return {
    currentVersion: current,
    latestVersion: latest,
    hasUpdate: isNewer(latest, current),
    releaseNotes: j.body ?? "",
    apkUrl: APK_URL,
  };
}

export async function openUpdateDownload(): Promise<void> {
  await Linking.openURL(APK_URL);
}
