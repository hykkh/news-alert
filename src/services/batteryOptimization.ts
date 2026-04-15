import { Platform } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BATTERY_OPT_ASKED_KEY = "battery_opt_asked";

/**
 * 최초 실행 시 배터리 최적화 해제 설정 화면을 자동으로 띄움
 * Android에서 REQUEST_IGNORE_BATTERY_OPTIMIZATIONS 인텐트 사용
 */
export async function requestBatteryOptimization(): Promise<void> {
  if (Platform.OS !== "android") return;

  // 이미 안내한 적 있으면 스킵
  const asked = await AsyncStorage.getItem(BATTERY_OPT_ASKED_KEY);
  if (asked === "true") return;

  try {
    // 배터리 최적화 무시 요청 화면 띄우기
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      {
        data: "package:com.kkh.keywordnews",
      }
    );
  } catch (e) {
    // 일부 기기에서 위 인텐트가 안 되면 배터리 최적화 설정 목록으로 이동
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
      );
    } catch (e2) {
      console.log("배터리 최적화 설정 열기 실패:", e2);
    }
  }

  // 한번 띄웠으면 기록
  await AsyncStorage.setItem(BATTERY_OPT_ASKED_KEY, "true");
}
