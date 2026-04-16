import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";

const KEYWORDS_KEY = "news_keywords";
const SEEN_NEWS_KEY = "seen_news";
export const SERVER_URL_KEY = "pc_server_url";

const { NewsPrefs } = NativeModules;

// ── 키워드 변경 작업 직렬화 (race 방지) ──
let keywordMutex: Promise<unknown> = Promise.resolve();
function withKeywordLock<T>(fn: () => Promise<T>): Promise<T> {
  const p = keywordMutex.then(() => fn(), () => fn());
  keywordMutex = p.catch(() => undefined);
  return p;
}

// ── PC 서버 URL ──────────────────────────────────────────────
export async function getServerUrl(): Promise<string> {
  return (await AsyncStorage.getItem(SERVER_URL_KEY)) || "";
}

export async function setServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(SERVER_URL_KEY, url.trim().replace(/\/$/, ""));
}

// PC 서버에 키워드 동기화 (실패해도 무시 — 서버 꺼져있을 수 있음)
async function syncToServer(keywords: string[]): Promise<void> {
  const url = await getServerUrl();
  if (!url) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch(`${url}/update-keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {}
}

// ── Android 네이티브 동기화 (백그라운드 체크용) ──────────────
async function syncToNative(keywords: string[]) {
  if (Platform.OS === "android" && NewsPrefs) {
    try {
      await NewsPrefs.syncKeywords(JSON.stringify(keywords));
    } catch {}
  }
}

// 앱 시작 시 호출 — AsyncStorage → SharedPreferences 초기 동기화
export async function syncKeywordsToNative(): Promise<void> {
  const keywords = await getKeywords();
  await syncToNative(keywords);
}

// ── 키워드 CRUD ──────────────────────────────────────────────
export async function getKeywords(): Promise<string[]> {
  const data = await AsyncStorage.getItem(KEYWORDS_KEY);
  return data ? JSON.parse(data) : [];
}

export async function addKeyword(keyword: string): Promise<string[]> {
  return withKeywordLock(async () => {
    const keywords = await getKeywords();
    const trimmed = keyword.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      keywords.push(trimmed);
      await AsyncStorage.setItem(KEYWORDS_KEY, JSON.stringify(keywords));
      await syncToNative(keywords);
      await syncToServer(keywords);
      // 새 키워드 현재 기사를 "본 것"으로 기록 → 추가 즉시 대량 알림 방지
      try {
        const { searchNews } = await import("./newsService");
        const items = await searchNews(trimmed, 20);
        if (items.length > 0) {
          await markNewsAsSeen(items.map((it) => it.link));
        }
      } catch {}
    }
    return keywords;
  });
}

export async function removeKeyword(keyword: string): Promise<string[]> {
  return withKeywordLock(async () => {
    let keywords = await getKeywords();
    keywords = keywords.filter((k) => k !== keyword);
    await AsyncStorage.setItem(KEYWORDS_KEY, JSON.stringify(keywords));
    await syncToNative(keywords);
    await syncToServer(keywords);
    return keywords;
  });
}

export async function getSeenNewsIds(): Promise<Set<string>> {
  const data = await AsyncStorage.getItem(SEEN_NEWS_KEY);
  return new Set(data ? JSON.parse(data) : []);
}

export async function markNewsAsSeen(links: string[]): Promise<void> {
  const seen = await getSeenNewsIds();
  links.forEach((link) => seen.add(link));
  const arr = Array.from(seen).slice(-500);
  await AsyncStorage.setItem(SEEN_NEWS_KEY, JSON.stringify(arr));
}

// ── 첫 실행 시 기존 뉴스를 모두 "본 것"으로 기록 (알림 홍수 방지) ──
const FIRST_RUN_KEY = "first_run_primed";
export async function primeSeenOnFirstRun(): Promise<void> {
  if ((await AsyncStorage.getItem(FIRST_RUN_KEY)) === "true") return;
  try {
    const { searchNews } = await import("./newsService");
    const keywords = await getKeywords();
    const allLinks: string[] = [];
    for (const kw of keywords) {
      try {
        const items = await searchNews(kw, 20);
        items.forEach((it) => allLinks.push(it.link));
      } catch {}
    }
    if (allLinks.length > 0) {
      await markNewsAsSeen(allLinks);
    }
  } finally {
    await AsyncStorage.setItem(FIRST_RUN_KEY, "true");
  }
}
