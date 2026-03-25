import { useState, useCallback, useRef } from 'react';
import { getVideoRelated } from '../services/bilibili';
import type { VideoItem } from '../services/types';

export function useRelatedVideos(bvid: string) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const data = await getVideoRelated(bvid);
      setVideos(data);
    } catch (e) {
      console.warn('useRelatedVideos: failed', e);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [bvid]);

  return { videos, loading, load, hasMore: false };
}
