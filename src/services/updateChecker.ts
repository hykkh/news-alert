// In-app update checker
// 주의: h-programs 릴리스는 여러 앱이 한 저장소에 섞여 있어 `releases/latest` 를 쓰면
// 다른 앱 릴리스(예: video-downloader)를 가리켜 버전 비교가 틀리고 APK URL 이 404 가 된다.
// → 고정 태그(v0.4.9) 의 APK + 공개 raw 버전 파일(docs/version-news-alert.txt) 로 비교한다.
import { Linking } from "react-native";
import pkg from "../../package.json";

const FIXED_TAG = "v0.4.9";
const APK_URL = `https://github.com/hykkh/h-programs/releases/download/${FIXED_TAG}/news-alert.apk`;
const VERSION_URL = "https://raw.githubusercontent.com/hykkh/h-programs/main/docs/version-news-alert.txt";

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
  // 캐시 회피용 쿼리스트링(raw CDN 캐시로 배포 직후 반영 지연 완화)
  const r = await fetch(`${VERSION_URL}?t=${Date.now()}`);
  if (!r.ok) throw new Error(`버전 확인 실패 (${r.status})`);
  const latest = (await r.text()).trim().replace(/^v/, "");
  const current = pkg.version;
  return {
    currentVersion: current,
    latestVersion: latest,
    hasUpdate: isNewer(latest, current),
    apkUrl: APK_URL,
  };
}

export async function openUpdateDownload(): Promise<void> {
  await Linking.openURL(APK_URL);
}
