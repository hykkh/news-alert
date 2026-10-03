// Shown until this phone has a licence: ask once, wait for the owner's approval,
// then call onDone(). Same screen as the Android apps' ActivationActivity.
//
// Copied from h-license/rn-template by apply.py; edit it there, not here.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Image,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as License from "../services/license";

// Material 3 baseline (light) — the colours the Android screen gets from its theme.
const C = {
  primary: "#65558F",
  onPrimary: "#FFFFFF",
  bg: "#FEF7FF",
  card: "#F7F2FA",
  dialog: "#ECE6F0",
  surfaceVariant: "#E7E0EB",
  onSurface: "#1D1B20",
  onSurfaceVariant: "#49454F",
  outline: "#79747E",
  outlineVariant: "#CAC4D0",
  error: "#B3261E",
};

const ICON = {
  lock: require("./activation/ic_lock_outline.png"),
  person: require("./activation/ic_person.png"),
  check: require("./activation/ic_check.png"),
  hourglass: require("./activation/ic_hourglass.png"),
  checkCircle: require("./activation/ic_check_circle.png"),
  block: require("./activation/ic_block.png"),
  cloudOff: require("./activation/ic_cloud_off.png"),
  device: require("./activation/ic_device.png"),
  share: require("./activation/ic_share.png"),
  key: require("./activation/ic_vpn_key.png"),
};

type Status = { icon: ImageSourcePropType; tint: string; line1: string; line2?: string };

function toast(msg: string, long = false) {
  if (Platform.OS === "android") ToastAndroid.show(msg, long ? ToastAndroid.LONG : ToastAndroid.SHORT);
  else Alert.alert(msg);
}

export default function ActivationScreen({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [asking, setAsking] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyText, setKeyText] = useState("");

  const polling = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const finished = useRef(false);

  const stopPolling = useCallback(() => {
    polling.current = false;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const done = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    stopPolling();
    toast("승인되었습니다");
    onDone();
  }, [onDone, stopPolling]);

  /** Updates the screen; true when there is nothing more to wait for. */
  const show = useCallback(
    async (a: License.Answer): Promise<boolean> => {
      switch (a.state) {
        case "approved":
          if (a.license != null && (await License.save(a.license))) {
            setStatus({ icon: ICON.checkCircle, tint: C.primary, line1: "승인 완료" });
            done();
            return true;
          }
          setStatus({ icon: ICON.block, tint: C.error, line1: "받은 열쇠가 이 폰과 맞지 않습니다", line2: "관리자에게 문의해 주세요" });
          return true;
        case "pending":
          setStatus({ icon: ICON.hourglass, tint: C.primary, line1: "승인 대기 중", line2: "승인되면 자동으로 열립니다" });
          return false;
        // Keep asking while this screen is open: the owner may still change his mind.
        case "rejected":
          setStatus({ icon: ICON.block, tint: C.error, line1: "승인되지 않았습니다", line2: "관리자가 다시 허용하면 자동으로 열립니다" });
          return false;
        case "revoked":
          setStatus({ icon: ICON.block, tint: C.error, line1: "사용이 중지된 기기", line2: "관리자에게 문의해 주세요" });
          return false;
        case "closed":
          setStatus({ icon: ICON.block, tint: C.onSurfaceVariant, line1: "신청을 받지 않는 중", line2: "관리자에게 문의해 주세요" });
          return true;
        default:
          setStatus(null);
          return true;
      }
    },
    [done]
  );

  const startPolling = useCallback(() => {
    if (polling.current || finished.current) return;
    polling.current = true;
    const tick = async () => {
      if (!polling.current || !alive.current) return;
      let a: License.Answer | null = null;
      try {
        a = await License.status();
      } catch {}
      if (!polling.current || !alive.current) return;
      if (a != null && (await show(a))) {
        polling.current = false;
        return;
      }
      pollTimer.current = setTimeout(tick, 4000);
    };
    tick();
  }, [show]);

  // onResume / onPause: asked before (or the app was closed while waiting) -> keep waiting while shown.
  useEffect(() => {
    alive.current = true;
    License.lastName().then((n) => {
      if (alive.current && n) setName((cur) => cur || n);
    });
    const resume = async () => {
      if (await License.wasRequested()) startPolling();
    };
    resume();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") resume();
      else stopPolling();
    });
    return () => {
      alive.current = false;
      stopPolling();
      sub.remove();
    };
  }, [startPolling, stopPolling]);

  const sendRequest = async () => {
    const n = name.trim();
    if (!n) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setAsking(true);
    setStatus({ icon: ICON.hourglass, tint: C.primary, line1: "신청하는 중…" });
    try {
      const a = await License.request(n);
      if (!alive.current) return;
      setAsking(false);
      await show(a);
      startPolling();
    } catch (e: any) {
      if (!alive.current) return;
      setAsking(false);
      console.warn("License request failed", e);
      setStatus({
        icon: ICON.cloudOff,
        tint: C.error,
        line1: "서버에 연결하지 못했습니다",
        line2: `인터넷을 확인하거나, 아래 기기 번호를 관리자에게 보내 주세요. (${e?.name ?? "Error"})`,
      });
    }
  };

  const shareDevice = () => {
    const text = `${License.APP_NAME} 사용 신청\n이름: ${name.trim()}\n기기 번호: ${License.deviceLabel()}`;
    Share.share({ message: text }, { dialogTitle: "기기 번호 보내기" }).catch(() => {});
  };

  const confirmKey = async () => {
    setKeyOpen(false);
    if (await License.save(keyText)) done();
    else toast("이 폰에 맞는 열쇠가 아닙니다", true);
    setKeyText("");
  };

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={s.box} keyboardShouldPersistTaps="handled">
        <Image source={ICON.lock} style={s.brand} tintColor={C.primary} />
        <Text style={s.title}>{License.APP_NAME} 사용 신청</Text>
        <Text style={s.sub}>처음 한 번만 승인받으면 그 후엔 인터넷 없이 사용</Text>

        <View style={[s.field, nameError && s.fieldError]}>
          <Image source={ICON.person} style={s.fieldIcon} tintColor={nameError ? C.error : C.onSurfaceVariant} />
          <TextInput
            style={s.fieldInput}
            placeholder="이름"
            placeholderTextColor={nameError ? C.error : C.onSurfaceVariant}
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (nameError) setNameError(false);
            }}
            autoComplete="name"
            textContentType="name"
            returnKeyType="done"
            onSubmitEditing={sendRequest}
          />
        </View>
        {nameError ? <Text style={s.err}>이름을 넣어 주세요</Text> : null}

        <TouchableOpacity style={[s.primary, asking && s.primaryOff]} disabled={asking} onPress={sendRequest} activeOpacity={0.8}>
          <Image source={ICON.check} style={s.btnIcon} tintColor={asking ? C.outline : C.onPrimary} />
          <Text style={[s.primaryText, asking && s.primaryTextOff]}>사용 신청</Text>
        </TouchableOpacity>

        {status ? (
          <View style={s.status}>
            <Image source={status.icon} style={s.statusIcon} tintColor={status.tint} />
            <View style={s.statusText}>
              <Text style={s.statusLine1}>{status.line1}</Text>
              {status.line2 ? <Text style={s.statusLine2}>{status.line2}</Text> : null}
            </View>
          </View>
        ) : null}

        <View style={s.or}>
          <View style={s.rule} />
          <Text style={s.orText}>또는</Text>
          <View style={s.rule} />
        </View>

        <View style={s.card}>
          <View style={s.cardHead}>
            <Image source={ICON.device} style={s.cardIcon} tintColor={C.onSurfaceVariant} />
            <Text style={s.cardLabel}>기기 번호</Text>
          </View>
          <Text style={s.device} numberOfLines={1} adjustsFontSizeToFit>
            {License.deviceLabel()}
          </Text>
          <Text style={s.hint}>인터넷이 안 되면 기기 번호를 관리자에게 보내고, 받은 열쇠를 넣으세요.</Text>
        </View>

        <View style={s.row}>
          <TouchableOpacity style={s.outlined} onPress={shareDevice}>
            <Image source={ICON.share} style={s.btnIcon} tintColor={C.primary} />
            <Text style={s.outlinedText}>번호 공유</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.outlined}
            onPress={() => {
              setKeyText("");
              setKeyOpen(true);
            }}
          >
            <Image source={ICON.key} style={s.btnIcon} tintColor={C.primary} />
            <Text style={s.outlinedText}>열쇠 넣기</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={keyOpen} transparent animationType="fade" onRequestClose={() => setKeyOpen(false)}>
        <KeyboardAvoidingView style={s.dim} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>열쇠 직접 넣기</Text>
            <TextInput
              style={s.keyInput}
              placeholder="받은 열쇠를 붙여 넣으세요"
              placeholderTextColor={C.onSurfaceVariant}
              value={keyText}
              onChangeText={setKeyText}
              multiline
              numberOfLines={3}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={s.dialogRow}>
              <TouchableOpacity style={s.dialogBtn} onPress={() => setKeyOpen(false)}>
                <Text style={s.dialogBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dialogBtn} onPress={confirmKey}>
                <Text style={s.dialogBtnText}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  box: { padding: 24 },
  brand: { width: 72, height: 72, alignSelf: "center", marginTop: 24 },
  title: { marginTop: 16, fontSize: 24, lineHeight: 32, textAlign: "center", color: C.onSurface },
  sub: { marginTop: 4, fontSize: 14, lineHeight: 20, textAlign: "center", color: C.onSurfaceVariant },

  field: {
    marginTop: 32,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.outline,
    borderRadius: 4,
    paddingHorizontal: 12,
  },
  fieldError: { borderWidth: 2, borderColor: C.error },
  fieldIcon: { width: 24, height: 24 },
  fieldInput: { flex: 1, marginLeft: 12, fontSize: 16, color: C.onSurface, paddingVertical: 0 },
  err: { marginTop: 4, marginLeft: 16, fontSize: 12, color: C.error },

  primary: {
    marginTop: 16,
    marginBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 100,
    paddingVertical: 14,
    backgroundColor: C.primary,
  },
  primaryOff: { backgroundColor: "rgba(29,27,32,0.12)" },
  primaryText: { fontSize: 16, fontWeight: "500", color: C.onPrimary },
  primaryTextOff: { color: C.outline },
  btnIcon: { width: 18, height: 18, marginRight: 8 },

  status: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: C.surfaceVariant,
  },
  statusIcon: { width: 32, height: 32 },
  statusText: { flex: 1, marginLeft: 16 },
  statusLine1: { fontSize: 16, lineHeight: 24, fontWeight: "bold", color: C.onSurface },
  statusLine2: { marginTop: 2, fontSize: 12, lineHeight: 16, color: C.onSurfaceVariant },

  or: { flexDirection: "row", alignItems: "center", marginVertical: 20 },
  rule: { flex: 1, height: 1, backgroundColor: C.outlineVariant },
  orText: { marginHorizontal: 12, fontSize: 12, color: C.onSurfaceVariant },

  card: { padding: 16, borderRadius: 12, backgroundColor: C.card, elevation: 2 },
  cardHead: { flexDirection: "row", alignItems: "center" },
  cardIcon: { width: 20, height: 20 },
  cardLabel: { marginLeft: 8, fontSize: 14, fontWeight: "500", color: C.onSurface },
  device: { marginTop: 12, fontSize: 20, letterSpacing: 1, textAlign: "center", fontFamily: MONO, color: C.onSurface },
  hint: { marginTop: 12, fontSize: 12, lineHeight: 16, textAlign: "center", color: C.onSurfaceVariant },

  row: { flexDirection: "row", marginTop: 12, gap: 8 },
  outlined: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.outline,
    borderRadius: 100,
    paddingVertical: 10,
  },
  outlinedText: { fontSize: 14, fontWeight: "500", color: C.primary },

  dim: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  dialog: { backgroundColor: C.dialog, borderRadius: 28, padding: 24 },
  dialogTitle: { fontSize: 24, lineHeight: 32, color: C.onSurface },
  keyInput: {
    marginTop: 16,
    minHeight: 88,
    borderWidth: 1,
    borderColor: C.outline,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: "top",
    color: C.onSurface,
  },
  dialogRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16 },
  dialogBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  dialogBtnText: { fontSize: 14, fontWeight: "500", color: C.primary },
});
