import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDownload } from "../hooks/useDownload";

interface Props {
  visible: boolean;
  onClose: () => void;
  bvid: string;
  cid: number;
  title: string;
  cover: string;
  qualities: { qn: number; desc: string }[];
}

export function DownloadSheet({
  visible,
  onClose,
  bvid,
  cid,
  title,
  cover,
  qualities,
}: Props) {
  const { tasks, startDownload, taskKey } = useDownload();
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : 300,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (qualities.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      />
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>下载视频</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="#555" />
          </TouchableOpacity>
        </View>
        <View style={styles.divider} />
        {qualities.map((q) => {
          const key = taskKey(bvid, q.qn);
          const task = tasks[key];
          return (
            <View key={q.qn} style={styles.row}>
              <Text style={styles.qualityLabel}>{q.desc}</Text>
              <View style={styles.right}>
                {!task && (
                  <TouchableOpacity
                    style={styles.downloadBtn}
                    onPress={() =>
                      startDownload(bvid, cid, q.qn, q.desc, title, cover)
                    }
                  >
                    <Text style={styles.downloadBtnTxt}>下载</Text>
                  </TouchableOpacity>
                )}
                {task?.status === "downloading" && (
                  <View style={styles.progressWrap}>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.round(task.progress * 100)}%` as any,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressTxt}>
                      {Math.round(task.progress * 100)}%
                    </Text>
                  </View>
                )}
                {task?.status === "done" && (
                  <View style={styles.doneRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="#00AEEC"
                    />
                    <Text style={styles.doneTxt}>已下载</Text>
                  </View>
                )}
                {task?.status === "error" && (
                  <View style={styles.errorWrap}>
                    {!!task.error && (
                      <Text style={styles.errorMsg} numberOfLines={2}>
                        {task.error}
                      </Text>
                    )}
                    <TouchableOpacity
                      style={styles.retryBtn}
                      onPress={() =>
                        startDownload(bvid, cid, q.qn, q.desc, title, cover)
                      }
                    >
                      <Ionicons name="refresh" size={14} color="#f44" />
                      <Text style={styles.retryTxt}>重试</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        })}
        <View style={styles.footer} />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#212121" },
  closeBtn: { padding: 4 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#eee",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  qualityLabel: { fontSize: 15, color: "#212121" },
  right: { flexDirection: "row", alignItems: "center" },
  downloadBtn: {
    backgroundColor: "#00AEEC",
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 14,
  },
  downloadBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "600" },
  progressWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressTrack: {
    width: 80,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e0e0e0",
    overflow: "hidden",
  },
  progressFill: { height: 4, backgroundColor: "#00AEEC", borderRadius: 2 },
  progressTxt: { fontSize: 12, color: "#666", minWidth: 32 },
  doneRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  doneTxt: { fontSize: 13, color: "#00AEEC" },
  errorWrap: { alignItems: "flex-end", gap: 2 },
  errorMsg: { fontSize: 11, color: "#f44", maxWidth: 160, textAlign: "right" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  retryTxt: { fontSize: 13, color: "#f44" },
  footer: { height: 24 },
});
