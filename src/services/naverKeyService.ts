import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const NAVER_ID_KEY = "naver_client_id";
const NAVER_SECRET_KEY = "naver_client_secret";
const NAVER_KEY_SOURCE = "naver_key_source"; // "manual" | "shared"
const MIGRATED_FLAG = "naver_key_migrated_v1";
const { NewsPrefs } = NativeModules;

// 앱 빌드 시 .env에 기본값이 있으면 fallback으로 사용
const BUILT_IN_ID = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? "";
const BUILT_IN_SECRET = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET ?? "";

export type ApiKeySource = "manual" | "shared";

// ── 마이그레이션: AsyncStorage 평문 → SecureStore (Android Keystore 기반 암호화) ──
let migrationDone = false;
async function migrateIfNeeded(): Promise<void> {
  if (migrationDone) return;
  if ((await AsyncStorage.getItem(MIGRATED_FLAG)) === "true") {
    migrationDone = true;
    return;
  }
  try {
    const oldId = await AsyncStorage.getItem(NAVER_ID_KEY);
    const oldSecret = await AsyncStorage.getItem(NAVER_SECRET_KEY);
    const oldSource = await AsyncStorage.getItem(NAVER_KEY_SOURCE);
    if (oldId) {
      await SecureStore.setItemAsync(NAVER_ID_KEY, oldId);
      await AsyncStorage.removeItem(NAVER_ID_KEY);
    }
    if (oldSecret) {
      await SecureStore.setItemAsync(NAVER_SECRET_KEY, oldSecret);
      await AsyncStorage.removeItem(NAVER_SECRET_KEY);
    }
    if (oldSource) {
      await SecureStore.setItemAsync(NAVER_KEY_SOURCE, oldSource);
      await AsyncStorage.removeItem(NAVER_KEY_SOURCE);
    }
  } catch {}
  await AsyncStorage.setItem(MIGRATED_FLAG, "true");
  migrationDone = true;
}

async function getSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function getNaverClientId(): Promise<string> {
  await migrateIfNeeded();
  return (await getSecure(NAVER_ID_KEY)) || BUILT_IN_ID;
}

export async function getNaverClientSecret(): Promise<string> {
  await migrateIfNeeded();
  return (await getSecure(NAVER_SECRET_KEY)) || BUILT_IN_SECRET;
}

export async function getNaverApiKeys(): Promise<{ clientId: string; clientSecret: string }> {
  const [clientId, clientSecret] = await Promise.all([getNaverClientId(), getNaverClientSecret()]);
  return { clientId, clientSecret };
}

export async function setNaverApiKeys(
  clientId: string,
  clientSecret: string,
  source: ApiKeySource = "manual"
): Promise<void> {
  await migrateIfNeeded();
  const id = clientId.trim();
  const secret = clientSecret.trim();
  await SecureStore.setItemAsync(NAVER_ID_KEY, id);
  await SecureStore.setItemAsync(NAVER_SECRET_KEY, secret);
  await SecureStore.setItemAsync(NAVER_KEY_SOURCE, source);
  if (Platform.OS === "android" && NewsPrefs) {
    try {
      await NewsPrefs.syncApiKeys(id, secret);
    } catch {}
  }
}

export async function getApiKeySource(): Promise<ApiKeySource | null> {
  await migrateIfNeeded();
  return (await getSecure(NAVER_KEY_SOURCE)) as ApiKeySource | null;
}

export async function hasNaverApiKeys(): Promise<boolean> {
  const { clientId, clientSecret } = await getNaverApiKeys();
  return clientId.length > 0 && clientSecret.length > 0;
}
