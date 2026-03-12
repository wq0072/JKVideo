import React, { useState, useRef, useEffect, useCallback } from "react";
import { File, Directory, Paths } from "expo-file-system";
import { formatDuration } from "../utils/format";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Text,
  Modal,
  Image,
  PanResponder,
  useWindowDimensions,
} from "react-native";
import Video, { VideoRef } from "react-native-video";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type {
  PlayUrlResponse,
  VideoShotData,
  DanmakuItem,
} from "../services/types";
import { buildDashMpdUri } from "../utils/dash";
import { getVideoShot } from "../services/bilibili";
import DanmakuOverlay from "./DanmakuOverlay";

const BAR_H = 3;
// 进度球尺寸
const BALL = 12;
// 活跃状态下的拖动球增大尺寸，提升触控体验
const BALL_ACTIVE = 16;
const HIDE_DELAY = 3000;

const HEADERS = {
  Referer: "https://www.bilibili.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function decodePvBuffer(buffer: ArrayBuffer): number[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const timestamps: number[] = [];

  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i++];
    const wireType = tag & 0x07;
    const fieldNum = tag >> 3;

    // 我们主要关心 repeated float32，通常 field 1 或直接数据
    if (wireType === 5) {
      // fixed32 / float32
      if (i + 4 > bytes.length) break;
      timestamps.push(view.getFloat32(i, true)); // little-endian
      i += 4;
    } else if (wireType === 2) {
      // length-delimited → 进入子消息或 packed repeated
      let len = 0;
      let shift = 0;
      while (true) {
        if (i >= bytes.length) break;
        const b = bytes[i++];
        len |= (b & 0x7f) << shift;
        shift += 7;
        if (!(b & 0x80)) break;
      }
      const end = i + len;
      // packed repeated float32 最常见情况：直接连续 float32
      while (i + 4 <= end) {
        timestamps.push(view.getFloat32(i, true));
        i += 4;
      }
      // 如果不是 packed，也跳过
    } else if (wireType === 0) {
      // varint
      while (i < bytes.length && bytes[i++] & 0x80);
    } else if (wireType === 1) {
      // fixed64
      i += 8;
    } else {
      break; // 未知类型，停止
    }
  }

  // 过滤掉明显异常值（比如负数或极大值）
  return timestamps.filter((t) => t >= 0 && t < 86400); // 视频不会超过24小时
}

async function loadPvData(url: string) {
  const realUrl = url.startsWith("//") ? `https:${url}` : url;

  try {
    // 选择缓存目录下的一个子目录（避免污染根缓存）
    const cacheDir = new Directory(Paths.cache, "bili_pvdata");

    // 如果目录不存在，创建（intermediates: true 自动创建父目录）
    if (!cacheDir.exists) {
      await cacheDir.create({ intermediates: true });
    }

    // 下载文件到这个目录（会自动用远程文件名，或你可以指定 File）
    // 这里用 Directory 作为 destination，SDK 会从 URL 或 header 推导文件名
    const downloadedFile: File = await File.downloadFileAsync(
      realUrl,
      cacheDir,
      {
        headers: HEADERS,
        idempotent: true, // 如果文件已存在，覆盖（避免重复下载失败）
      },
    );
    console.log("Downloaded to:", downloadedFile.uri);
    // 读取为 base64（如果你原来的 decodeFloats/decodePvBuffer 用 base64）
    // const base64 = await downloadedFile.base64();
    // 更好：直接读 binary 为 Uint8Array，然后转 ArrayBuffer
    const bytes: Uint8Array = await downloadedFile.bytes();
    const nums = new Uint16Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength / 2,
    );

    return nums;
  } catch (error) {
    console.error("loadPvData failed:", error);
    throw error;
  }
}

function findFrameIdx(timestamps: number[], seekTime: number): number {
  if (!timestamps.length) return 0;
  let lo = 0,
    hi = timestamps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timestamps[mid] <= seekTime) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

interface Props {
  playData: PlayUrlResponse | null;
  qualities: { qn: number; desc: string }[];
  currentQn: number;
  onQualityChange: (qn: number) => void;
  onFullscreen: () => void;
  onMiniPlayer?: () => void;
  style?: object;
  bvid?: string;
  cid?: number;
  danmakus?: DanmakuItem[];
  isFullscreen?: boolean;
  onTimeUpdate?: (t: number) => void;
  initialTime?: number;
}

export function NativeVideoPlayer({
  playData,
  qualities,
  currentQn,
  onQualityChange,
  onFullscreen,
  onMiniPlayer,
  style,
  bvid,
  cid,
  danmakus,
  isFullscreen,
  onTimeUpdate,
  initialTime,
}: Props) {
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const VIDEO_H = SCREEN_W * 0.5625;

  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>();
  const isDash = !!playData?.dash;

  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);

  const [showQuality, setShowQuality] = useState(false);

  const [buffered, setBuffered] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const isSeekingRef = useRef(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const barOffsetX = useRef(0);
  const barWidthRef = useRef(300);
  const trackRef = useRef<View>(null);

  const [shots, setShots] = useState<VideoShotData | null>(null);
  const [shotTimestamps, setShotTimestamps] = useState<number[]>([]);
  const [showDanmaku, setShowDanmaku] = useState(true);

  const videoRef = useRef<VideoRef>(null);
  const currentDesc =
    qualities.find((q) => q.qn === currentQn)?.desc ??
    String(currentQn || "HD");

  // URL resolution
  useEffect(() => {
    if (!playData) {
      setResolvedUrl(undefined);
      return;
    }
    if (isDash) {
      buildDashMpdUri(playData, currentQn)
        .then(setResolvedUrl)
        .catch(() => setResolvedUrl(playData.dash!.video[0]?.baseUrl));
    } else {
      setResolvedUrl(playData.durl?.[0]?.url);
    }
  }, [playData, currentQn]);

  // Video shots (thumbnails for seek preview)
  useEffect(() => {
    if (!bvid || !cid) return;
    let cancelled = false;
    getVideoShot(bvid, cid).then((shotData) => {
      if (cancelled) return;
      if (shotData?.image?.length) {
        setShots(shotData);
        if (shotData.pvdata) {
          try {
            loadPvData(shotData.pvdata).then((r) => {
              setShotTimestamps(r);
            });
          } catch {
            setShotTimestamps([]);
          }
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bvid, cid]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  const resetHideTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!isSeekingRef.current) {
      hideTimer.current = setTimeout(() => setShowControls(false), HIDE_DELAY);
    }
  }, []);

  const showAndReset = useCallback(() => {
    setShowControls(true);
    resetHideTimer();
  }, [resetHideTimer]);

  const handleTap = useCallback(() => {
    setShowControls((prev) => {
      if (!prev) {
        resetHideTimer();
        return true;
      }
      if (hideTimer.current) clearTimeout(hideTimer.current);
      return false;
    });
  }, [resetHideTimer]);

  // Start hide timer on mount
  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const measureTrack = useCallback(() => {
    trackRef.current?.measureInWindow((x, _y, w) => {
      if (w > 0) {
        barOffsetX.current = x;
        barWidthRef.current = w;
      }
    });
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gs) => {
        isSeekingRef.current = true;
        setIsSeeking(true);
        setShowControls(true);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setTouchX(clamp(gs.x0 - barOffsetX.current, 0, barWidthRef.current));
      },
      onPanResponderMove: (_, gs) => {
        setTouchX(clamp(gs.moveX - barOffsetX.current, 0, barWidthRef.current));
      },
      onPanResponderRelease: (_, gs) => {
        const ratio = clamp(
          (gs.moveX - barOffsetX.current) / barWidthRef.current,
          0,
          1,
        );
        const t = ratio * durationRef.current;
        videoRef.current?.seek(t);
        setCurrentTime(t);
        setTouchX(null);
        isSeekingRef.current = false;
        setIsSeeking(false);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(
          () => setShowControls(false),
          HIDE_DELAY,
        );
      },
      onPanResponderTerminate: () => {
        setTouchX(null);
        isSeekingRef.current = false;
        setIsSeeking(false);
      },
    }),
  ).current;

  const touchRatio =
    touchX !== null ? clamp(touchX / barWidthRef.current, 0, 1) : null;
  const progressRatio = duration > 0 ? clamp(currentTime / duration, 0, 1) : 0;
  const bufferedRatio = duration > 0 ? clamp(buffered / duration, 0, 1) : 0;

  const THUMB_DISPLAY_W = 120; // scaled display width

  const renderThumbnail = () => {
    if (touchRatio === null || !shots || !isSeeking) return null;
    const {
      img_x_size: TW,
      img_y_size: TH,
      img_x_len,
      img_y_len,
      image,
    } = shots;
    const framesPerSheet = img_x_len * img_y_len;
    const totalFrames = framesPerSheet * image.length;

    // Use pvdata timestamps for accurate frame lookup; fall back to linear interpolation
    const seekTime = touchRatio * duration;
    const frameIdx =
      shotTimestamps.length > 0
        ? findFrameIdx(shotTimestamps, seekTime)
        : Math.floor(touchRatio * (totalFrames - 1));

    const sheetIdx = Math.floor(frameIdx / framesPerSheet);
    const local = frameIdx % framesPerSheet;
    const col = local % img_x_len;
    const row = Math.floor(local / img_x_len);

    // Scale sprite frame to display size
    const scale = THUMB_DISPLAY_W / TW;
    const DW = THUMB_DISPLAY_W;
    const DH = Math.round(TH * scale);

    const trackLeft = barOffsetX.current;
    const absLeft = clamp(trackLeft + (touchX ?? 0) - DW / 2, 0, SCREEN_W - DW);

    // Protocol-relative URLs from B站 API need explicit https:
    const sheetUrl = image[sheetIdx].startsWith("//")
      ? `https:${image[sheetIdx]}`
      : image[sheetIdx];
    return (
      <View
        style={[styles.thumbPreview, { left: absLeft, width: DW }]}
        pointerEvents="none"
      >
        <View
          style={{ width: DW, height: DH, overflow: "hidden", borderRadius: 4 }}
        >
          <Image
            source={{ uri: sheetUrl, headers: HEADERS }}
            style={{
              position: "absolute",
              width: TW * img_x_len * scale,
              height: TH * img_y_len * scale,
              left: -col * DW,
              top: -row * DH,
            }}
          />
        </View>
        <Text style={styles.thumbTime}>
          {formatDuration(Math.floor(seekTime))}
        </Text>
      </View>
    );
  };

  return (
    <View
      style={[
        isFullscreen
          ? styles.fsContainer
          : [styles.container, { width: SCREEN_W, height: VIDEO_H }],
        style,
      ]}
    >
      {resolvedUrl ? (
        <Video
          key={resolvedUrl}
          ref={videoRef}
          source={
            isDash
              ? { uri: resolvedUrl, type: "mpd", headers: HEADERS }
              : { uri: resolvedUrl, headers: HEADERS }
          }
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          controls={false}
          paused={paused}
          onProgress={({ currentTime: ct, seekableDuration: dur, playableDuration: buf }) => {
            setCurrentTime(ct);
            if (dur > 0) setDuration(dur);
            setBuffered(buf);
            onTimeUpdate?.(ct);
          }}
          onLoad={() => {
            if (initialTime && initialTime > 0) {
              videoRef.current?.seek(initialTime);
            }
          }}
        />
      ) : (
        <View style={styles.placeholder} />
      )}

      {isFullscreen && !!danmakus?.length && (
        <DanmakuOverlay
          danmakus={danmakus}
          currentTime={currentTime}
          screenWidth={SCREEN_W}
          screenHeight={SCREEN_H}
          visible={showDanmaku}
        />
      )}

      {/* Permanent transparent tap layer — always above Video so taps always reach it */}
      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      {showControls && (
        <>
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "transparent"]}
            style={styles.topBar}
            pointerEvents="box-none"
          >
            {onMiniPlayer && (
              <TouchableOpacity onPress={onMiniPlayer} style={styles.topBtn}>
                <Ionicons
                  name="tablet-portrait-outline"
                  size={20}
                  color="#fff"
                />
              </TouchableOpacity>
            )}
          </LinearGradient>

          {/* Center play/pause */}
          <TouchableOpacity
            style={styles.centerBtn}
            onPress={() => {
              setPaused((p) => !p);
              showAndReset();
            }}
          >
            <View style={styles.centerBtnBg}>
              <Ionicons
                name={paused ? "play" : "pause"}
                size={28}
                color="#fff"
              />
            </View>
          </TouchableOpacity>

          {/* Bottom bar */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={styles.bottomBar}
            pointerEvents="box-none"
          >
            {/* Progress track */}
            <View
              ref={trackRef}
              style={styles.trackWrapper}
              onLayout={measureTrack}
              {...panResponder.panHandlers}
            >
              <View style={styles.track}>
                {/* Buffered: lighter white overlay on top of base */}
                <View
                  style={[
                    styles.trackLayer,
                    { width: `${bufferedRatio * 100}%` as any, backgroundColor: "rgba(255,255,255,0.35)" },
                  ]}
                />
                {/* Played: accent color on top */}
                <View
                  style={[
                    styles.trackLayer,
                    { width: `${progressRatio * 100}%` as any, backgroundColor: "#00AEEC" },
                  ]}
                />
              </View>
              {isSeeking && touchX !== null ? (
                <View
                  style={[
                    styles.ball,
                    styles.ballActive,
                    { left: touchX - BALL_ACTIVE / 2 },
                  ]}
                />
              ) : (
                <View
                  style={[
                    styles.ball,
                    { left: progressRatio * barWidthRef.current - BALL / 2 },
                  ]}
                />
              )}
            </View>

            {/* Controls row */}
            <View style={styles.ctrlRow}>
              <TouchableOpacity
                onPress={() => {
                  setPaused((p) => !p);
                  showAndReset();
                }}
                style={styles.ctrlBtn}
              >
                <Ionicons
                  name={paused ? "play" : "pause"}
                  size={16}
                  color="#fff"
                />
              </TouchableOpacity>
              <Text style={styles.timeText}>
                {formatDuration(Math.floor(currentTime))}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.timeText}>{formatDuration(duration)}</Text>
              <TouchableOpacity
                style={styles.ctrlBtn}
                onPress={() => setShowQuality(true)}
              >
                <Text style={styles.qualityText}>{currentDesc}</Text>
              </TouchableOpacity>
              {isFullscreen && (
                <TouchableOpacity
                  style={styles.ctrlBtn}
                  onPress={() => setShowDanmaku((v) => !v)}
                >
                  <Ionicons
                    name={showDanmaku ? "chatbubbles" : "chatbubbles-outline"}
                    size={16}
                    color="#fff"
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.ctrlBtn} onPress={onFullscreen}>
                <Ionicons name="expand" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </>
      )}

      {/* Thumbnail preview — absolute on container to avoid clipping */}
      {renderThumbnail()}

      {/* Quality modal */}
      <Modal visible={showQuality} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setShowQuality(false)}
        >
          <View style={styles.qualityList}>
            <Text style={styles.qualityTitle}>选择清晰度</Text>
            {qualities.map((q) => (
              <TouchableOpacity
                key={q.qn}
                style={styles.qualityItem}
                onPress={() => {
                  setShowQuality(false);
                  onQualityChange(q.qn);
                  showAndReset();
                }}
              >
                <Text
                  style={[
                    styles.qualityItemText,
                    q.qn === currentQn && styles.qualityItemActive,
                  ]}
                >
                  {q.desc}
                </Text>
                {q.qn === currentQn && (
                  <Ionicons name="checkmark" size={16} color="#00AEEC" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#000" },
  fsContainer: { flex: 1, backgroundColor: "#000" },
  placeholder: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    paddingHorizontal: 12,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  topBtn: { padding: 6 },
  centerBtn: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -28 }, { translateY: -28 }],
  },
  centerBtnBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 8,
    paddingTop: 32,
  },
  thumbPreview: { position: "absolute", bottom: 64, alignItems: "center" },
  thumbTime: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  trackWrapper: {
    marginHorizontal: 8,
    height: BAR_H + BALL_ACTIVE,
    justifyContent: "center",
    position: "relative",
  },
  track: {
    height: BAR_H,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  trackLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    height: BAR_H,
  },
  ball: {
    position: "absolute",
    top: (BAR_H + BALL_ACTIVE) / 2 - BALL / 2,
    width: BALL,
    height: BALL,
    borderRadius: BALL / 2,
    backgroundColor: "#fff",
    elevation: 3,
  },
  ballActive: {
    width: BALL_ACTIVE,
    height: BALL_ACTIVE,
    borderRadius: BALL_ACTIVE / 2,
    backgroundColor: "#00AEEC",
    top: 0,
  },
  ctrlRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    marginTop: 4,
  },
  ctrlBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  timeText: { color: "#fff", fontSize: 11, marginHorizontal: 2 },
  qualityText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  qualityList: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 180,
  },
  qualityTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#212121",
    paddingVertical: 10,
    textAlign: "center",
  },
  qualityItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eee",
  },
  qualityItemText: { fontSize: 14, color: "#333" },
  qualityItemActive: { color: "#00AEEC", fontWeight: "700" },
});
