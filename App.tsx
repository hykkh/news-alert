import React, { useEffect, useRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { Text, Linking, Platform, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import HomeScreen from "./src/screens/HomeScreen";
import KeywordScreen from "./src/screens/KeywordScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { registerForPushNotifications, checkForNewNews } from "./src/services/notificationService";
import { getKeywords, primeSeenOnFirstRun } from "./src/services/keywordService";
import { requestBatteryOptimization } from "./src/services/batteryOptimization";
import { NativeModules } from "react-native";

const Tab = createBottomTabNavigator();

export default function App() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 푸시 알림 등록 (권한 허용 시 Expo 토큰 PC 서버에 자동 등록)
    registerForPushNotifications().catch(console.error);

    // 배터리 최적화 해제 안내 (Android, 1회만) - Activity 준비 후 호출
    const batteryTimer = setTimeout(() => {
      requestBatteryOptimization().catch(() => {});
    }, 2500);

    // 알림 클릭 시 뉴스 링크 열기
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (url) {
        Linking.openURL(url as string);
      }
    });

    // 키워드를 네이티브에 동기화 (백그라운드 체크용)
    getKeywords().then(kws => {
      if (kws.length > 0 && NativeModules.NewsPrefs) {
        NativeModules.NewsPrefs.syncKeywords(JSON.stringify(kws)).catch(() => {});
      }
    });

    // 첫 실행이면 기존 뉴스 전부 seen으로 기록 → 알림 홍수 방지
    // 완료 후에만 정기 체크 시작
    primeSeenOnFirstRun()
      .catch(() => {})
      .finally(() => {
        checkForNewNews();
      });

    // 설정에서 주기 읽어 setInterval 시작 (변경 시 재설정)
    const applyInterval = async () => {
      try {
        const raw = await AsyncStorage.getItem("app_settings");
        const minutes = raw ? (JSON.parse(raw).checkIntervalMinutes ?? 5) : 5;
        const ms = Math.max(1, Math.min(360, minutes)) * 60 * 1000;
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
          checkForNewNews();
        }, ms);
      } catch {}
    };
    applyInterval();

    // 앱이 다시 포그라운드로 오면 설정 변경 반영 (설정 화면에서 바꾸고 뒤로가기)
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") applyInterval();
    });

    return () => {
      subscription.remove();
      appStateSub.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearTimeout(batteryTimer);
    };
  }, []);

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: "#4A90D9",
          tabBarInactiveTintColor: "#999",
          headerStyle: { backgroundColor: "#fff" },
          headerTitleStyle: { fontWeight: "bold" },
        }}
      >
        <Tab.Screen
          name="뉴스"
          component={HomeScreen}
          options={{
            headerTitle: "키워드 뉴스",
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📰</Text>,
          }}
        />
        <Tab.Screen
          name="키워드"
          component={KeywordScreen}
          options={{
            headerTitle: "키워드 관리",
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🔍</Text>,
          }}
        />
        <Tab.Screen
          name="설정"
          component={SettingsScreen}
          options={{
            headerTitle: "설정",
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>⚙️</Text>,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
