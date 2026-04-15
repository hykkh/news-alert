import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { getKeywords, getSeenNewsIds, markNewsAsSeen } from "./keywordService";
import { searchNews } from "./newsService";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "app_settings";

// 알림 핸들러 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// 뉴스 제목에서 핵심 텍스트 추출 (중복 판별용)
function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, "")
    .replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("실제 기기에서만 푸시 알림을 사용할 수 있습니다");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("푸시 알림 권한이 거부되었습니다");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("news-alerts", {
      name: "뉴스 알림",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4A90D9",
    });
  }

  return "local-only";
}

export async function sendLocalNotification(title: string, body: string, data?: any) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: null,
  });
}

export async function checkForNewNews(): Promise<number> {
  // 설정 확인
  const settingsData = await AsyncStorage.getItem(SETTINGS_KEY);
  const settings = settingsData ? JSON.parse(settingsData) : { notificationsEnabled: true };
  if (!settings.notificationsEnabled) return 0;

  // 방해금지 시간대 확인
  if (settings.quietHoursEnabled) {
    const now = new Date().getHours();
    const start = settings.quietHoursStart ?? 22;
    const end = settings.quietHoursEnd ?? 9;
    const isQuiet = start < end
      ? (now >= start && now < end)
      : (now >= start || now < end);
    if (isQuiet) return 0;
  }

  const keywords = await getKeywords();
  if (keywords.length === 0) return 0;

  const seenIds = await getSeenNewsIds();
  let newCount = 0;
  const newLinks: string[] = [];
  const seenTitles = new Set<string>();

  const allItems: { keyword: string; title: string; normalizedTitle: string; link: string; originallink: string }[] = [];

  for (const keyword of keywords) {
    try {
      const items = await searchNews(keyword, 5);
      for (const item of items) {
        allItems.push({
          keyword,
          title: item.title,
          normalizedTitle: normalizeTitle(item.title),
          link: item.link,
          originallink: item.originallink,
        });
      }
    } catch (e) {
      console.error(`키워드 "${keyword}" 확인 실패:`, e);
    }
  }

  for (const item of allItems) {
    if (seenIds.has(item.link)) continue;

    if (seenTitles.has(item.normalizedTitle)) {
      newLinks.push(item.link);
      continue;
    }

    seenTitles.add(item.normalizedTitle);
    newLinks.push(item.link);
    newCount++;
    await sendLocalNotification(
      `[${item.keyword}] 새 뉴스`,
      item.title,
      { url: item.originallink || item.link }
    );
  }

  if (newLinks.length > 0) {
    await markNewsAsSeen(newLinks);
  }

  return newCount;
}
