import { useState, useCallback, useRef, useMemo } from 'react';
import { getRecommendFeed } from '../services/bilibili';
import type { VideoItem } from '../services/types';

export function useRelatedVideos() {
  const [pages, setPages] = useState<VideoItem[][]>([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const freshIdxRef = useRef(0);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const data = await getRecommendFeed(freshIdxRef.current);
      setPages(prev => [...prev, data]);
      freshIdxRef.current += 1;
    } catch (e) {
      console.warn('useRelatedVideos: failed', e);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  const videos = useMemo(() => pages.flat(), [pages]);
  return { videos, loading, load };
}
