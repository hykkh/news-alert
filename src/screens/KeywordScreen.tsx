import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { getKeywords, addKeyword, removeKeyword, syncKeywordsToNative } from "../services/keywordService";

export default function KeywordScreen() {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    loadKeywords();
  }, []);

  const loadKeywords = async () => {
    const kws = await getKeywords();
    setKeywords(kws);
    await syncKeywordsToNative(); // 앱 시작/화면 진입 시 네이티브 동기화
  };

  const handleAdd = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (keywords.includes(trimmed)) {
      Alert.alert("알림", "이미 등록된 키워드입니다");
      return;
    }
    const updated = await addKeyword(trimmed);
    setKeywords(updated);
    setInput("");
  };

  const handleRemove = (keyword: string) => {
    Alert.alert("키워드 삭제", `"${keyword}"를 삭제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          const updated = await removeKeyword(keyword);
          setKeywords(updated);
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="키워드 입력 (예: 삼성전자, AI)"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
          <Text style={styles.addButtonText}>추가</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>등록된 키워드 ({keywords.length})</Text>

      <FlatList
        data={keywords}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <View style={styles.keywordItem}>
            <Text style={styles.keywordText}>{item}</Text>
            <TouchableOpacity onPress={() => handleRemove(item)}>
              <Text style={styles.removeText}>삭제</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>등록된 키워드가 없습니다</Text>
            <Text style={styles.emptyHint}>위 입력창에 관심 키워드를 추가해보세요</Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  inputRow: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#222",
    marginRight: 10,
  },
  addButton: {
    backgroundColor: "#4A90D9",
    paddingHorizontal: 20,
    justifyContent: "center",
    borderRadius: 10,
  },
  addButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  sectionTitle: {
    fontSize: 14,
    color: "#999",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  keywordItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 12,
    marginVertical: 4,
    padding: 16,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#4A90D9",
  },
  keywordText: { fontSize: 16, color: "#222", fontWeight: "600" },
  removeText: { fontSize: 14, color: "#FF4444" },
  emptyContainer: { alignItems: "center", paddingTop: 40 },
  emptyText: { fontSize: 16, color: "#999", marginBottom: 4 },
  emptyHint: { fontSize: 13, color: "#ccc" },
});
