import AsyncStorage from "@react-native-async-storage/async-storage";

const BLOCKED_SOURCES_KEY = "blocked_sources";

// 도메인 → 신문사 이름 매핑
export const NEWS_SOURCES: Record<string, string> = {
  "chosun.com": "조선일보",
  "donga.com": "동아일보",
  "joongang.co.kr": "중앙일보",
  "hani.co.kr": "한겨레",
  "khan.co.kr": "경향신문",
  "kmib.co.kr": "국민일보",
  "hankyung.com": "한국경제",
  "mk.co.kr": "매일경제",
  "mt.co.kr": "머니투데이",
  "edaily.co.kr": "이데일리",
  "sedaily.com": "서울경제",
  "etnews.com": "전자신문",
  "zdnet.co.kr": "ZDNet",
  "ytn.co.kr": "YTN",
  "sbs.co.kr": "SBS",
  "kbs.co.kr": "KBS",
  "mbc.co.kr": "MBC",
  "yna.co.kr": "연합뉴스",
  "newsis.com": "뉴시스",
  "news1.kr": "뉴스1",
};

// URL에서 도메인 추출
export function extractDomain(url: string): string {
  try {
    const match = url.match(/https?:\/\/(?:www\.)?([^/]+)/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

// URL에서 신문사 이름 추출
export function getSourceName(url: string): string {
  const domain = extractDomain(url);
  for (const [key, name] of Object.entries(NEWS_SOURCES)) {
    if (domain.includes(key)) return name;
  }
  return domain || "기타";
}

// 차단된 신문사 목록 가져오기
export async function getBlockedSources(): Promise<Set<string>> {
  const data = await AsyncStorage.getItem(BLOCKED_SOURCES_KEY);
  return new Set(data ? JSON.parse(data) : []);
}

// 신문사 차단/해제 토글
export async function toggleSource(domain: string): Promise<Set<string>> {
  const blocked = await getBlockedSources();
  if (blocked.has(domain)) {
    blocked.delete(domain);
  } else {
    blocked.add(domain);
  }
  await AsyncStorage.setItem(BLOCKED_SOURCES_KEY, JSON.stringify(Array.from(blocked)));
  return blocked;
}

// URL이 차단된 신문사인지 확인
export async function isSourceBlocked(url: string): Promise<boolean> {
  const blocked = await getBlockedSources();
  const domain = extractDomain(url);
  for (const blockedDomain of blocked) {
    if (domain.includes(blockedDomain)) return true;
  }
  return false;
}
