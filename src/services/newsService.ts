import { NAVER_NEWS_API_URL } from "../config/naver";
import { getNaverClientId, getNaverClientSecret } from "./naverKeyService";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  originallink: string;
  source?: string;
}

// ── API 소스 설정 (화면 표시용) ──
export interface ApiSources {
  naver: boolean;
  google: boolean;
}

const API_SOURCES_KEY = "api_sources";

export async function getApiSources(): Promise<ApiSources> {
  const data = await AsyncStorage.getItem(API_SOURCES_KEY);
  return data ? { naver: true, google: true, ...JSON.parse(data) } : { naver: true, google: true };
}

export async function setApiSources(sources: ApiSources): Promise<void> {
  await AsyncStorage.setItem(API_SOURCES_KEY, JSON.stringify(sources));
}

// HTML 태그 제거
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// ── 네이버 뉴스 검색 (알림 + 화면 공용) ──
export async function searchNews(keyword: string, display: number = 20): Promise<NewsItem[]> {
  const url = `${NAVER_NEWS_API_URL}?query=${encodeURIComponent(keyword)}&display=${display}&sort=date`;
  const [clientId, clientSecret] = await Promise.all([getNaverClientId(), getNaverClientSecret()]);

  const response = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });

  if (!response.ok) {
    throw new Error(`뉴스 검색 실패: ${response.status}`);
  }

  const data = await response.json();
  return data.items.map((item: NewsItem) => ({
    ...item,
    title: stripHtml(item.title),
    description: stripHtml(item.description),
    source: "naver",
  }));
}

// ── 구글 뉴스 RSS (화면 표시용만) ──
export async function searchGoogleNews(keyword: string, display: number = 10): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=ko&gl=KR&ceid=KR:ko`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return [];
    const xml = await response.text();

    const items: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < display) {
      const block = match[1];
      const title = stripHtml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
      const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";
      const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
      if (title && link) {
        items.push({ title, link, description: "", pubDate, originallink: link, source: "google" });
      }
    }
    return items;
  } catch {
    return [];
  }
}
