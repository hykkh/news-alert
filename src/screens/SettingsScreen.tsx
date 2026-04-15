import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, NativeModules, Platform, TextInput, Alert, Linking, Clipboard } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NEWS_SOURCES, getBlockedSources, toggleSource } from "../services/filterService";
import { getApiSources, setApiSources, ApiSources } from "../services/newsService";
import { getServerUrl, setServerUrl } from "../services/keywordService";
import { getNaverApiKeys, setNaverApiKeys, hasNaverApiKeys, getApiKeySource, ApiKeySource } from "../services/naverKeyService";
import { generateShareCode, decodeShareCode } from "../services/shareKeyService";

const { NewsPrefs } = NativeModules;

const SETTINGS_KEY = "app_settings";

interface Settings {
  notificationsEnabled: boolean;
  checkIntervalMinutes: number;
  quietHoursEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
}

const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
  checkIntervalMinutes: 5,
  quietHoursEnabled: false,
  quietHoursStart: 22,
  quietHoursEnd: 9,
};

export default function SettingsScreen() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [blockedSources, setBlockedSources] = useState<Set<string>>(new Set());
  const [apiSources, setApiSourcesState] = useState<ApiSources>({ naver: true, google: true });
  const [serverUrl, setServerUrlState] = useState("");
  const [serverStatus, setServerStatus] = useState<"idle" | "ok" | "fail">("idle");
  const [naverClientId, setNaverClientId] = useState("");
  const [naverClientSecret, setNaverClientSecret] = useState("");
  const [naverKeySaved, setNaverKeySaved] = useState(false);
  const [naverKeySource, setNaverKeySource] = useState<ApiKeySource | null>(null);
  const [guideVisible, setGuideVisible] = useState(false);
  const [shareCode, setShareCode] = useState("");
  const [shareInputCode, setShareInputCode] = useState("");

  useEffect(() => {
    loadSettings();
    loadBlockedSources();
    loadApiSources();
    getServerUrl().then(setServerUrlState);
    getNaverApiKeys().then(({ clientId, clientSecret }) => {
      setNaverClientId(clientId);
      setNaverClientSecret(clientSecret);
      setNaverKeySaved(clientId.length > 0 && clientSecret.length > 0);
    });
    getApiKeySource().then(setNaverKeySource);
  }, []);

  const handleNaverKeySave = async () => {
    const id = naverClientId.trim();
    const secret = naverClientSecret.trim();
    if (!id || !secret) {
      Alert.alert("입력 오류", "Client ID와 Client Secret을 모두 입력해주세요");
      return;
    }
    await setNaverApiKeys(id, secret, "manual");
    setNaverKeySaved(true);
    setNaverKeySource("manual");
    setShareCode(""); // 키가 바뀌면 이전 공유 코드 초기화
    Alert.alert("저장 완료", "네이버 API 키가 저장되었습니다.\n이제 뉴스 검색이 가능합니다.");
  };

  const handleGenerateShareCode = async () => {
    const id = naverClientId.trim();
    const secret = naverClientSecret.trim();
    if (!id || !secret) {
      Alert.alert("오류", "먼저 API 키를 저장해주세요");
      return;
    }
    const code = generateShareCode(id, secret);
    setShareCode(code);
    Clipboard.setString(code);
    Alert.alert("공유 코드 생성됨", "클립보드에 복사되었습니다.\n이 코드를 앱을 공유할 분께 전달하세요.\n\n받은 분은 설정 → 공유 코드 입력란에 붙여넣으면 됩니다.");
  };

  const handleApplyShareCode = async () => {
    const code = shareInputCode.trim();
    if (!code) {
      Alert.alert("오류", "공유 코드를 입력해주세요");
      return;
    }
    const result = decodeShareCode(code);
    if (!result) {
      Alert.alert("코드 오류", "유효하지 않은 공유 코드입니다.\n코드를 다시 확인해주세요.");
      return;
    }
    await setNaverApiKeys(result.clientId, result.clientSecret, "shared");
    setNaverKeySaved(true);
    setNaverKeySource("shared");
    setShareInputCode("");
    Alert.alert("적용 완료", "API 키가 등록되었습니다.\n이제 뉴스 검색이 가능합니다.");
  };

  const handleServerUrlSave = async () => {
    await setServerUrl(serverUrl);
    Alert.alert("저장됨", "PC 서버 주소가 저장되었습니다");
  };

  const handleServerTest = async () => {
    const url = serverUrl.trim().replace(/\/$/, "");
    if (!url) { Alert.alert("오류", "서버 주소를 입력해주세요"); return; }
    setServerStatus("idle");
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${url}/status`, { signal: controller.signal });
      clearTimeout(timer);
      const data = await res.json();
      setServerStatus("ok");
      Alert.alert("연결 성공", `키워드: ${data.keywords?.join(", ") || "없음"}\n푸시 토큰: ${data.push_token ? "등록됨" : "미등록"}`);
    } catch {
      setServerStatus("fail");
      Alert.alert("연결 실패", "PC 서버에 연결할 수 없습니다.\nIP 주소와 포트를 확인해주세요");
    }
  };

  const loadSettings = async () => {
    const data = await AsyncStorage.getItem(SETTINGS_KEY);
    if (data) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(data) });
  };

  const loadBlockedSources = async () => {
    const blocked = await getBlockedSources();
    setBlockedSources(blocked);
  };

  const loadApiSources = async () => {
    const sources = await getApiSources();
    setApiSourcesState(sources);
  };

  const handleToggleApi = async (key: keyof ApiSources) => {
    const updated = { ...apiSources, [key]: !apiSources[key] };
    setApiSourcesState(updated);
    await setApiSources(updated);
  };

  const updateSetting = async (key: keyof Settings, value: any) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));

    if (Platform.OS === "android" && NewsPrefs) {
      if (key === "quietHoursEnabled" || key === "quietHoursStart" || key === "quietHoursEnd") {
        NewsPrefs.syncQuietHours(
          updated.quietHoursEnabled,
          updated.quietHoursStart,
          updated.quietHoursEnd
        ).catch(() => {});
      }
      if (key === "checkIntervalMinutes") {
        NewsPrefs.syncInterval(updated.checkIntervalMinutes).catch(() => {});
      }
    }
  };

  const handleToggleSource = async (domain: string) => {
    const updated = await toggleSource(domain);
    setBlockedSources(updated);
  };

  const formatHour = (h: number) => {
    const period = h < 12 ? "오전" : "오후";
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${period} ${display}시`;
  };

  const cycleHour = (current: number, direction: 1 | -1) => {
    return (current + direction + 24) % 24;
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>알림 설정</Text>

      <View style={styles.settingItem}>
        <View>
          <Text style={styles.settingLabel}>푸시 알림</Text>
          <Text style={styles.settingDesc}>새 뉴스 발견 시 알림을 받습니다</Text>
        </View>
        <Switch
          value={settings.notificationsEnabled}
          onValueChange={(v) => updateSetting("notificationsEnabled", v)}
          trackColor={{ true: "#4A90D9" }}
        />
      </View>

      <Text style={styles.sectionTitle}>방해금지 시간</Text>

      <View style={styles.settingItem}>
        <View>
          <Text style={styles.settingLabel}>방해금지 모드</Text>
          <Text style={styles.settingDesc}>설정한 시간대에는 알림을 보내지 않습니다</Text>
        </View>
        <Switch
          value={settings.quietHoursEnabled}
          onValueChange={(v) => updateSetting("quietHoursEnabled", v)}
          trackColor={{ true: "#4A90D9" }}
        />
      </View>

      {settings.quietHoursEnabled && (
        <View style={styles.timePickerContainer}>
          <View style={styles.timePickerRow}>
            <Text style={styles.timeLabel}>시작</Text>
            <View style={styles.timePicker}>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => updateSetting("quietHoursStart", cycleHour(settings.quietHoursStart, -1))}
              >
                <Text style={styles.timeButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.timeValue}>{formatHour(settings.quietHoursStart)}</Text>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => updateSetting("quietHoursStart", cycleHour(settings.quietHoursStart, 1))}
              >
                <Text style={styles.timeButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.timePickerRow}>
            <Text style={styles.timeLabel}>종료</Text>
            <View style={styles.timePicker}>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => updateSetting("quietHoursEnd", cycleHour(settings.quietHoursEnd, -1))}
              >
                <Text style={styles.timeButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.timeValue}>{formatHour(settings.quietHoursEnd)}</Text>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => updateSetting("quietHoursEnd", cycleHour(settings.quietHoursEnd, 1))}
              >
                <Text style={styles.timeButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.quietHoursInfo}>
            {formatHour(settings.quietHoursStart)} ~ {formatHour(settings.quietHoursEnd)} 동안 알림 없음
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>뉴스 확인 주기</Text>

      {[1, 3, 5, 10, 30].map((min) => (
        <TouchableOpacity
          key={min}
          style={[styles.intervalItem, settings.checkIntervalMinutes === min && styles.intervalSelected]}
          onPress={() => updateSetting("checkIntervalMinutes", min)}
        >
          <Text style={[styles.intervalText, settings.checkIntervalMinutes === min && styles.intervalTextSelected]}>
            {min}분마다 확인
          </Text>
          {settings.checkIntervalMinutes === min && <Text style={styles.checkMark}>✓</Text>}
        </TouchableOpacity>
      ))}

      {/* ── 네이버 API 키 ── */}
      <Text style={styles.sectionTitle}>네이버 API 키</Text>

      {/* 상태 배지 */}
      <View style={styles.apiKeyStatusRow}>
        <View style={[styles.apiKeyBadge, naverKeySaved
          ? (naverKeySource === "shared" ? styles.apiKeyBadgeShared : styles.apiKeyBadgeOk)
          : styles.apiKeyBadgeNone]}>
          <Text style={styles.apiKeyBadgeText}>
            {naverKeySaved ? (naverKeySource === "shared" ? "공유받음" : "직접등록") : "미등록"}
          </Text>
        </View>
        <Text style={styles.apiKeyStatusDesc}>
          {!naverKeySaved && "키를 발급받거나 공유 코드를 입력하세요"}
          {naverKeySaved && naverKeySource === "manual" && "직접 발급한 키가 등록되어 있습니다"}
          {naverKeySaved && naverKeySource === "shared" && "공유 코드로 등록된 키입니다"}
        </Text>
      </View>

      {/* 직접 입력 (공유받은 사람은 숨김) */}
      {naverKeySource !== "shared" && (
        <>
          <TouchableOpacity style={styles.guideToggle} onPress={() => setGuideVisible(!guideVisible)}>
            <Text style={styles.guideToggleText}>{guideVisible ? "▲ 발급 방법 닫기" : "▼ 네이버 API 키 발급 방법 (처음이세요?)"}</Text>
          </TouchableOpacity>

          {guideVisible && (
            <View style={styles.guideBox}>
              <Text style={styles.guideTitle}>네이버 API 키 발급 방법</Text>
              <Text style={styles.guideStep}>{"1"}.  아래 버튼을 눌러 네이버 개발자 센터에 접속합니다</Text>
              <TouchableOpacity style={styles.guideLinkBtn} onPress={() => Linking.openURL("https://developers.naver.com/apps/#/register")}>
                <Text style={styles.guideLinkBtnText}>네이버 개발자 센터 열기</Text>
              </TouchableOpacity>
              <Text style={styles.guideStep}>{"2"}.  네이버 계정으로 로그인합니다</Text>
              <Text style={styles.guideStep}>{"3"}.  애플리케이션 이름 입력 (예: 키워드뉴스)</Text>
              <Text style={styles.guideStep}>{"4"}.  사용 API 목록에서 <Text style={styles.guideEmphasis}>검색</Text> 선택</Text>
              <Text style={styles.guideStep}>{"5"}.  환경: <Text style={styles.guideEmphasis}>Android</Text> 선택{"\n"}     패키지명: <Text style={styles.guideEmphasis}>com.kkh.keywordnews</Text></Text>
              <Text style={styles.guideStep}>{"6"}.  등록 후 <Text style={styles.guideEmphasis}>Client ID</Text>와 <Text style={styles.guideEmphasis}>Client Secret</Text> 복사</Text>
              <Text style={styles.guideStep}>{"7"}.  아래 입력란에 붙여넣고 저장</Text>
              <Text style={styles.guideNote}>무료 · 하루 25,000건 검색 가능</Text>
            </View>
          )}

          <View style={styles.serverRow}>
            <Text style={styles.apiKeyLabel}>Client ID</Text>
            <TextInput style={styles.serverInput} placeholder="예: VO73fziKrECDVO1EZEpM"
              value={naverClientId} onChangeText={setNaverClientId}
              autoCapitalize="none" autoCorrect={false} />
          </View>
          <View style={styles.serverRow}>
            <Text style={styles.apiKeyLabel}>Client Secret</Text>
            <TextInput style={styles.serverInput} placeholder="예: QxCfERy4Df"
              value={naverClientSecret} onChangeText={setNaverClientSecret}
              autoCapitalize="none" autoCorrect={false} secureTextEntry />
          </View>
          <View style={styles.serverBtnRow}>
            <TouchableOpacity style={[styles.serverBtn, { flex: 1 }]} onPress={handleNaverKeySave}>
              <Text style={styles.serverBtnText}>API 키 저장</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* 공유 코드 생성 (직접 등록한 사람만) */}
      {naverKeySource === "manual" && (
        <>
          <Text style={styles.sectionTitle}>공유 코드</Text>
          <Text style={styles.filterHint}>이 코드를 받은 사람은 API 키 없이 앱을 쓸 수 있습니다</Text>
          <View style={styles.serverBtnRow}>
            <TouchableOpacity style={[styles.serverBtn, { flex: 1 }]} onPress={handleGenerateShareCode}>
              <Text style={styles.serverBtnText}>공유 코드 생성 + 복사</Text>
            </TouchableOpacity>
          </View>
          {shareCode.length > 0 && (
            <View style={styles.shareCodeBox}>
              <Text style={styles.shareCodeLabel}>생성된 코드 (클립보드에 복사됨)</Text>
              <Text style={styles.shareCodeText} selectable>{shareCode}</Text>
            </View>
          )}
        </>
      )}

      {/* 공유 코드 입력 (미등록 또는 공유받은 사람) */}
      {naverKeySource !== "manual" && (
        <>
          <Text style={styles.sectionTitle}>공유 코드 입력</Text>
          <Text style={styles.filterHint}>앱을 공유해준 분께 받은 코드를 입력하세요</Text>
          <View style={styles.serverRow}>
            <TextInput style={styles.serverInput} placeholder="공유 코드 붙여넣기"
              value={shareInputCode} onChangeText={setShareInputCode}
              autoCapitalize="none" autoCorrect={false} />
          </View>
          <View style={styles.serverBtnRow}>
            <TouchableOpacity style={[styles.serverBtn, { flex: 1 }]} onPress={handleApplyShareCode}>
              <Text style={styles.serverBtnText}>코드 적용</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>뉴스 소스</Text>
      <Text style={styles.filterHint}>검색에 사용할 API를 선택합니다</Text>

      <View style={styles.settingItem}>
        <View>
          <Text style={styles.settingLabel}>네이버 뉴스</Text>
          <Text style={styles.settingDesc}>네이버 뉴스 검색 API</Text>
        </View>
        <Switch
          value={apiSources.naver}
          onValueChange={() => handleToggleApi("naver")}
          trackColor={{ true: "#4A90D9", false: "#ddd" }}
        />
      </View>
      <View style={styles.settingItem}>
        <View>
          <Text style={styles.settingLabel}>구글 뉴스</Text>
          <Text style={styles.settingDesc}>Google News RSS</Text>
        </View>
        <Switch
          value={apiSources.google}
          onValueChange={() => handleToggleApi("google")}
          trackColor={{ true: "#4A90D9", false: "#ddd" }}
        />
      </View>

      <Text style={styles.sectionTitle}>신문사 필터</Text>
      <Text style={styles.filterHint}>OFF로 끄면 해당 신문사 뉴스를 받지 않습니다</Text>

      {Object.entries(NEWS_SOURCES).map(([domain, name]) => (
        <View key={domain} style={styles.settingItem}>
          <Text style={styles.settingLabel}>{name}</Text>
          <Switch
            value={!blockedSources.has(domain)}
            onValueChange={() => handleToggleSource(domain)}
            trackColor={{ true: "#4A90D9", false: "#ddd" }}
          />
        </View>
      ))}

      <Text style={styles.sectionTitle}>PC 푸시 서버</Text>
      <Text style={styles.filterHint}>키워드 동기화를 위해 PC 서버 주소를 입력하세요</Text>
      <View style={styles.serverRow}>
        <TextInput
          style={styles.serverInput}
          placeholder="http://192.168.0.10:8889"
          value={serverUrl}
          onChangeText={setServerUrlState}
          autoCapitalize="none"
          keyboardType="url"
        />
      </View>
      <View style={styles.serverBtnRow}>
        <TouchableOpacity style={styles.serverBtn} onPress={handleServerUrlSave}>
          <Text style={styles.serverBtnText}>저장</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.serverBtn, serverStatus === "ok" ? styles.serverBtnOk : serverStatus === "fail" ? styles.serverBtnFail : {}]}
          onPress={handleServerTest}
        >
          <Text style={styles.serverBtnText}>연결 테스트</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>앱 정보</Text>
      <View style={styles.settingItem}>
        <Text style={styles.settingLabel}>버전</Text>
        <Text style={styles.settingDesc}>2.2.0</Text>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  sectionTitle: {
    fontSize: 14,
    color: "#999",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  filterHint: {
    fontSize: 12,
    color: "#bbb",
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  settingLabel: { fontSize: 16, color: "#333" },
  settingDesc: { fontSize: 13, color: "#999", marginTop: 2 },
  timePickerContainer: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  timePickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  timeLabel: { fontSize: 15, color: "#555", fontWeight: "500" },
  timePicker: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E8F0FE",
    justifyContent: "center",
    alignItems: "center",
  },
  timeButtonText: { fontSize: 20, color: "#4A90D9", fontWeight: "bold" },
  timeValue: {
    fontSize: 16,
    color: "#222",
    fontWeight: "600",
    minWidth: 80,
    textAlign: "center",
  },
  quietHoursInfo: {
    fontSize: 13,
    color: "#4A90D9",
    textAlign: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
  },
  intervalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  intervalSelected: { backgroundColor: "#E8F0FE" },
  intervalText: { fontSize: 16, color: "#333" },
  intervalTextSelected: { color: "#4A90D9", fontWeight: "600" },
  checkMark: { color: "#4A90D9", fontSize: 18, fontWeight: "bold" },
  serverRow: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  serverInput: {
    height: 44,
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#222",
  },
  serverBtnRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  serverBtn: {
    flex: 1,
    backgroundColor: "#4A90D9",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  serverBtnOk: { backgroundColor: "#4CAF50" },
  serverBtnFail: { backgroundColor: "#FF4444" },
  serverBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  apiKeyStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    gap: 10,
  },
  apiKeyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  apiKeyBadgeOk: { backgroundColor: "#E8F5E9" },
  apiKeyBadgeShared: { backgroundColor: "#EDE7F6" },
  apiKeyBadgeNone: { backgroundColor: "#FFF3E0" },
  apiKeyBadgeText: { fontSize: 13, fontWeight: "600", color: "#555" },
  apiKeyStatusDesc: { fontSize: 13, color: "#777", flex: 1 },
  guideToggle: {
    backgroundColor: "#E8F0FE",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#c8d8f0",
  },
  guideToggleText: { color: "#4A90D9", fontSize: 14, fontWeight: "600" },
  guideBox: {
    backgroundColor: "#F0F4FF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#c8d8f0",
  },
  guideTitle: { fontSize: 15, fontWeight: "bold", color: "#333", marginBottom: 12 },
  guideStep: { fontSize: 14, color: "#444", lineHeight: 22, marginBottom: 6 },
  guideEmphasis: { fontWeight: "bold", color: "#4A90D9" },
  guideNote: {
    marginTop: 10,
    fontSize: 13,
    color: "#4CAF50",
    fontWeight: "600",
    backgroundColor: "#E8F5E9",
    padding: 8,
    borderRadius: 8,
  },
  guideLinkBtn: {
    backgroundColor: "#4A90D9",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    marginVertical: 8,
  },
  guideLinkBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  apiKeyLabel: { fontSize: 13, color: "#888", marginBottom: 4 },
  shareCodeBox: {
    backgroundColor: "#F5F5F5",
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  shareCodeLabel: { fontSize: 12, color: "#999", marginBottom: 6 },
  shareCodeText: { fontSize: 13, color: "#333", fontFamily: "monospace", lineHeight: 20 },
});
