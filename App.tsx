import React, { useEffect, useRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { Text, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";

import HomeScreen from "./src/screens/HomeScreen";
import KeywordScreen from "./src/screens/KeywordScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { registerForPushNotifications, checkForNewNews } from "./src/services/notificationService";
import { getKeywords } from "./src/services/keywordService";
import { NativeModules } from "react-native";

const Tab = createBottomTabNavigator();

export default function App() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 푸시 알림 등록
    registerForPushNotifications().catch(console.error);

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

    // 최초 실행 시 뉴스 확인
    checkForNewNews();

    // 주기적 뉴스 확인 (5분마다)
    intervalRef.current = setInterval(() => {
      checkForNewNews();
    }, 5 * 60 * 1000);

    return () => {
      subscription.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
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
