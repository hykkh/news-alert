// Shown until this phone has a licence (port of Hoffice ActivationActivity.kt):
// ask once, wait for the owner's approval, then call onDone().
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Modal,
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

export default function ActivationScreen({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [asking, setAsking] = useState(false);
  const [state, setState] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyText, setKeyText] = useState("");
  const polling = useRef(false);
  const alive = useRef(true);
  const finished = useRef(false);

  const done = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    polling.current = false;
    ToastAndroid.show("승인되었습니다", ToastAndroid.SHORT);
    onDone();
  }, [onDone]);

  /** Updates the screen; true when there is nothing more to wait for. */
  const show = useCallback(
    async (a: License.Answer): Promise<boolean> => {
      switch (a.state) {
        case "approved":
          if (a.license != null && (await License.save(a.license))) {
            done();
            return true;
          }
          setState("받은 열쇠가 이 폰과 맞지 않습니다. 관리자에게 문의해 주세요.");
          return true;
        case "pending":
          setState("승인을 기다리는 중입니다…\n승인되면 저절로 열립니다.");
          return false;
        // Keep asking while this screen is open: the owner may still change his mind.
        case "rejected":
          setState("승인되지 않았습니다.");
          return false;
        case "revoked":
          setState("사용이 중지된 기기입니다. 관리자에게 문의해 주세요.");
          return false;
        case "closed":
          setState("지금은 새 사용 신청을 받지 않습니다. 관리자에게 문의해 주세요.");
          return true;
        default:
          setState("");
          return true;
      }
    },
    [done]
  );

  const startPolling = useCallback(() => {
    if (polling.current || finished.current) return;
    polling.current = true;
    (async () => {
      while (polling.current && alive.current) {
        let a: License.Answer | null = null;
        try {
          a = await License.status();
        } catch {}
        if (!polling.current || !alive.current) return;
        if (a != null && (await show(a))) {
          polling.current = false;
          return;
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
    })();
  }, [show]);

  // onResume / onPause: asked before (or the app was closed while waiting) -> keep waiting while shown.
  useEffect(() => {
    alive.current = true;
    License.lastName().then((n) => setName((cur) => cur || n));
    const resume = () => {
      License.wasRequested().then((r) => {
        if (r) startPolling();
      });
    };
    resume();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") resume();
      else polling.current = false;
    });
    return () => {
      alive.current = false;
      polling.current = false;
      sub.remove();
    };
  }, [startPolling]);

  const sendRequest = async () => {
    const n = name.trim();
    if (!n) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setAsking(true);
    setState("신청하는 중…");
    try {
      const a = await License.request(n);
      setAsking(false);
      await show(a);
      startPolling();
    } catch (e: any) {
      setAsking(false);
      console.warn("License request failed", e);
      setState(
        `서버에 연결하지 못했습니다.\n인터넷을 확인하거나, 아래 기기 번호를 관리자에게 보내 주세요.\n(${e?.name ?? "Error"})`
      );
    }
  };

  const shareDevice = () => {
    const text = `${License.APP_NAME} 사용 신청\n이름: ${name.trim()}\n기기 번호: ${License.deviceLabel()}`;
    Share.share({ message: text }, { dialogTitle: "기기 번호 보내기" }).catch(() => {});
  };

  const confirmKey = async () => {
    setKeyOpen(false);
    if (await License.save(keyText)) done();
    else ToastAndroid.show("이 폰에 맞는 열쇠가 아닙니다", ToastAndroid.LONG);
    setKeyText("");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.bar}>
        <Text style={styles.barTitle}>{License.APP_NAME} 사용 신청</Text>
      </View>
      <ScrollView contentContainerStyle={styles.box} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>처음 한 번만 사용 승인을 받으면, 그다음부터는 인터넷 없이 쓸 수 있습니다.</Text>
        <TextInput
          style={styles.input}
          placeholder="이름"
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
        {nameError ? <Text style={styles.err}>이름을 넣어 주세요</Text> : null}
        <TouchableOpacity
          style={[styles.btn, styles.primary, asking && styles.disabled]}
          disabled={asking}
          onPress={sendRequest}
        >
          <Text style={styles.primaryText}>사용 신청</Text>
        </TouchableOpacity>
        <Text style={styles.state}>{state}</Text>

        <Text style={styles.device}>기기 번호  {License.deviceLabel()}</Text>
        <Text style={styles.hint}>인터넷이 안 되면 기기 번호를 관리자에게 보내고, 받은 열쇠를 넣으세요.</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.half]} onPress={shareDevice}>
            <Text style={styles.btnText}>기기 번호 보내기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.half]} onPress={() => setKeyOpen(true)}>
            <Text style={styles.btnText}>열쇠 직접 넣기</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={keyOpen} transparent animationType="fade" onRequestClose={() => setKeyOpen(false)}>
        <View style={styles.dim}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>열쇠 직접 넣기</Text>
            <TextInput
              style={[styles.input, styles.keyInput]}
              placeholder="받은 열쇠를 붙여 넣으세요"
              value={keyText}
              onChangeText={setKeyText}
              multiline
              numberOfLines={3}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.dialogRow}>
              <TouchableOpacity
                onPress={() => {
                  setKeyOpen(false);
                  setKeyText("");
                }}
              >
                <Text style={styles.dialogBtn}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmKey}>
                <Text style={styles.dialogBtn}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  bar: { height: 56, justifyContent: "center", paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "#eee" },
  barTitle: { fontSize: 18, fontWeight: "bold", color: "#222" },
  box: { padding: 20 },
  intro: { fontSize: 16, color: "#333" },
  input: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#222",
  },
  err: { color: "#d33", marginTop: 4, fontSize: 13 },
  btn: {
    marginTop: 8,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#eee",
  },
  primary: { backgroundColor: "#4A90D9" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  disabled: { opacity: 0.5 },
  btnText: { color: "#222", fontSize: 14 },
  state: { fontSize: 15, textAlign: "center", paddingVertical: 16, color: "#222" },
  device: { fontSize: 14, fontFamily: "monospace", color: "#666", paddingTop: 24, paddingBottom: 4 },
  hint: { fontSize: 13, color: "#888" },
  row: { flexDirection: "row", marginTop: 6, gap: 8 },
  half: { flex: 1 },
  dim: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  dialog: { backgroundColor: "#fff", borderRadius: 8, padding: 20 },
  dialogTitle: { fontSize: 18, fontWeight: "bold", color: "#222" },
  keyInput: { minHeight: 80, textAlignVertical: "top", marginTop: 12 },
  dialogRow: { flexDirection: "row", justifyContent: "flex-end", gap: 24, marginTop: 16 },
  dialogBtn: { fontSize: 15, color: "#4A90D9", fontWeight: "bold" },
});
