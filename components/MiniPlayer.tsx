import React, { useRef } from 'react';
import {
  View, Text, Image, StyleSheet,
  Animated, PanResponder, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoStore } from '../store/videoStore';
import { proxyImageUrl } from '../utils/imageUrl';

const MINI_W = 160;
const MINI_H = 90;

export function MiniPlayer() {
  const { isActive, bvid, title, cover, clearVideo } = useVideoStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pan = useRef(new Animated.ValueXY()).current;
  const isDragging = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      // 从 start 阶段即抢占响应权，确保拖动可靠触发
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDragging.current = false;
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gs) => {
        if (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5) {
          isDragging.current = true;
        }
        pan.x.setValue(gs.dx);
        pan.y.setValue(gs.dy);
      },
      onPanResponderRelease: (evt) => {
        pan.flattenOffset();
        if (!isDragging.current) {
          // 点击：通过坐标判断是关闭还是跳转
          const { locationX, locationY } = evt.nativeEvent;
          if (locationX > MINI_W - 28 && locationY < 28) {
            clearVideo();
          } else {
            router.push(`/video/${bvid}` as any);
          }
          return;
        }
        // 拖动：吸附到最近边缘
        const { width: sw, height: sh } = Dimensions.get('window');
        const curX = (pan.x as any)._value;
        const curY = (pan.y as any)._value;
        const snapRight = 0;
        const snapLeft = -(sw - MINI_W - 24);
        const snapX = curX < snapLeft / 2 ? snapLeft : snapRight;
        const clampedY = Math.max(-sh + MINI_H + 60, Math.min(60, curY));
        Animated.spring(pan, {
          toValue: { x: snapX, y: clampedY },
          useNativeDriver: false,
          tension: 120,
          friction: 10,
        }).start();
      },
      onPanResponderTerminate: () => { pan.flattenOffset(); },
    })
  ).current;

  if (!isActive) return null;

  const bottomOffset = insets.bottom + 16;

  return (
    <Animated.View
      style={[styles.container, { bottom: bottomOffset, transform: pan.getTranslateTransform() }]}
      {...panResponder.panHandlers}
    >
      <Image source={{ uri: proxyImageUrl(cover) }} style={styles.cover} />
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      {/* 关闭按钮仅作视觉展示，点击逻辑由 onPanResponderRelease 坐标判断处理 */}
      <View style={styles.closeBtn}>
        <Ionicons name="close" size={14} color="#fff" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 12,
    width: MINI_W,
    height: MINI_H,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  cover: { width: '100%', height: 64, backgroundColor: '#333' },
  title: {
    color: '#fff',
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 4,
    lineHeight: 14,
  },
  closeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
