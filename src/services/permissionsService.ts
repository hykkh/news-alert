import { NativeModules, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as IntentLauncher from "expo-intent-launcher";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { NewsPrefs } = NativeModules;

export type PermissionStatus = {
  notification: boolean;
  batteryOptimization: boolean; // true = 최적화 예외(백그라운드 허용)
  exactAlarm: boolean;
};

const PKG = "com.kkh.keywordnews";
const BATTERY_OPT_ASKED_KEY = "battery_opt_asked";
const PERMS_PRIMED_KEY = "perms_primed_v1";

export async function getPermissionStatus(): Promise<PermissionStatus> {
  if (Platform.OS !== "android") {
    return { notification: true, batteryOptimization: true, exactAlarm: true };
  }

  let notification = false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    notification = status === "granted";
  } catch {}

  let batteryOptimization = false;
  try {
    batteryOptimization = await NewsPrefs.isIgnoringBatteryOptimizations();
  } catch {}

  let exactAlarm = false;
  try {
    exactAlarm = await NewsPrefs.canScheduleExactAlarms();
  } catch {}

  return { notification, batteryOptimization, exactAlarm };
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export async function requestBatteryOptimizationExemption(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      { data: `package:${PKG}` }
    );
  } catch {
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
      );
    } catch {}
  }
  await AsyncStorage.setItem(BATTERY_OPT_ASKED_KEY, "true");
}

export async function requestExactAlarmPermission(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await NewsPrefs.openExactAlarmSettings();
  } catch {}
}

export async function openAppSettings(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await NewsPrefs.openAppSettings();
  } catch {}
}

/**
 * 최초 실행 시 필요한 권한을 순차적으로 요청.
 * 알림 → 배터리 최적화 → 정확한 알람 순.
 */
export async function primePermissionsOnFirstRun(): Promise<void> {
  if (Platform.OS !== "android") return;
  const primed = await AsyncStorage.getItem(PERMS_PRIMED_KEY);
  if (primed === "true") return;

  // 1) 알림 권한 (Android 13+)
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      await Notifications.requestPermissionsAsync();
    }
  } catch {}

  // 2) 배터리 최적화 예외
  try {
    const whitelisted = await NewsPrefs.isIgnoringBatteryOptimizations();
    if (!whitelisted) {
      await requestBatteryOptimizationExemption();
    }
  } catch {}

  // 3) 정확한 알람 (Android 12+)
  try {
    const ok = await NewsPrefs.canScheduleExactAlarms();
    if (!ok) {
      await requestExactAlarmPermission();
    }
  } catch {}

  await AsyncStorage.setItem(PERMS_PRIMED_KEY, "true");
}
