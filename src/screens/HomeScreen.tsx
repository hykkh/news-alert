import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Linking,
} from "react-native";
import { getKeywords } from "../services/keywordService";
import { searchNews, searchGoogleNews, getApiSources, NewsItem } from "../services/newsService";

export default function HomeScreen() {
  const [news, setNews] = useState<(NewsItem & { keyword: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);

  const fetchAllNews = useCallback(async () => {
    const kws = await getKeywords();
    setKeywords(kws);
    if (kws.length === 0) {
      setNews([]);
      setLoading(false);
      return;
    }

    const allNews: (NewsItem & { keyword: string })[] = [];
    const apiSources = await getApiSources();
    for (const kw of kws) {
      try {
        if (apiSources.naver) {
          const items = await searchNews(kw, 10);
          items.forEach((item) => allNews.push({ ...item, keyword: kw }));
        }
        if (apiSources.google) {
          const items = await searchGoogleNews(kw, 5);
          items.forEach((item) => allNews.push({ ...item, keyword: kw }));
        }
      } catch (e) {
        console.error(`키워드 "${kw}" 검색 실패:`, e);
      }
    }

    // 최신순 정렬
    allNews.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    setNews(allNews);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAllNews();
  }, [fetchAllNews]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllNews();
    setRefreshing(false);
  };

  const openNews = (url: string) => {
    Linking.openURL(url);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, "0");
    const mins = date.getMinutes().toString().padStart(2, "0");
    return `${month}/${day} ${hours}:${mins}`;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A90D9" />
        <Text style={styles.loadingText}>뉴스 불러오는 중...</Text>
      </View>
    );
  }

  if (keywords.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emoji}>🔍</Text>
        <Text style={styles.emptyTitle}>등록된 키워드가 없습니다</Text>
        <Text style={styles.emptyDesc}>키워드 탭에서 관심 키워드를 추가해주세요</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={news}
        keyExtractor={(item, index) => item.link + index}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.newsCard} onPress={() => openNews(item.originallink || item.link)}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <View style={styles.keywordBadge}>
                <Text style={styles.keywordText}>{item.keyword}</Text>
              </View>
              {(item as any).source && (
                <View style={[styles.keywordBadge, { backgroundColor: (item as any).source === "google" ? "#FEF3E8" : "#E8F0FE" }]}>
                  <Text style={[styles.keywordText, { color: (item as any).source === "google" ? "#E67E22" : "#4A90D9" }]}>
                    {(item as any).source === "google" ? "Google" : "Naver"}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.newsTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.newsDesc} numberOfLines={3}>
              {item.description}
            </Text>
            <Text style={styles.newsDate}>{formatDate(item.pubDate)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyDesc}>검색 결과가 없습니다</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  loadingText: { marginTop: 10, color: "#666", fontSize: 16 },
  emoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: "#333", marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: "#999", textAlign: "center" },
  newsCard: {
    backgroundColor: "#fff",
    marginHorizontal: 12,
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  keywordBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E8F0FE",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  keywordText: { color: "#4A90D9", fontSize: 12, fontWeight: "600" },
  newsTitle: { fontSize: 16, fontWeight: "bold", color: "#222", marginBottom: 6, lineHeight: 22 },
  newsDesc: { fontSize: 14, color: "#666", lineHeight: 20, marginBottom: 8 },
  newsDate: { fontSize: 12, color: "#aaa" },
});
