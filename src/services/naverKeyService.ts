import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";

const NAVER_ID_KEY = "naver_client_id";
const NAVER_SECRET_KEY = "naver_client_secret";
const NAVER_KEY_SOURCE = "naver_key_source"; // "manual" | "shared"
const { NewsPrefs } = NativeModules;

// 앱 빌드 시 .env에 기본값이 있으면 fallback으로 사용
const BUILT_IN_ID = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? "";
const BUILT_IN_SECRET = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET ?? "";

export async function getNaverClientId(): Promise<string> {
  return (await AsyncStorage.getItem(NAVER_ID_KEY)) || BUILT_IN_ID;
}

export async function getNaverClientSecret(): Promise<string> {
  return (await AsyncStorage.getItem(NAVER_SECRET_KEY)) || BUILT_IN_SECRET;
}

export async function getNaverApiKeys(): Promise<{ clientId: string; clientSecret: string }> {
  const [clientId, clientSecret] = await Promise.all([getNaverClientId(), getNaverClientSecret()]);
  return { clientId, clientSecret };
}

export type ApiKeySource = "manual" | "shared";

export async function setNaverApiKeys(
  clientId: string,
  clientSecret: string,
  source: ApiKeySource = "manual"
): Promise<void> {
  const id = clientId.trim();
  const secret = clientSecret.trim();
  await AsyncStorage.setItem(NAVER_ID_KEY, id);
  await AsyncStorage.setItem(NAVER_SECRET_KEY, secret);
  await AsyncStorage.setItem(NAVER_KEY_SOURCE, source);
  if (Platform.OS === "android" && NewsPrefs) {
    try {
      await NewsPrefs.syncApiKeys(id, secret);
    } catch {}
  }
}

export async function getApiKeySource(): Promise<ApiKeySource | null> {
  return (await AsyncStorage.getItem(NAVER_KEY_SOURCE)) as ApiKeySource | null;
}

export async function hasNaverApiKeys(): Promise<boolean> {
  const { clientId, clientSecret } = await getNaverApiKeys();
  return clientId.length > 0 && clientSecret.length > 0;
}
