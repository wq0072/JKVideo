import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { useDownloadStore } from '../store/downloadStore';
import { getPlayUrlForDownload } from '../services/bilibili';

// 模块级进度节流
const lastReportedProgress: Record<string, number> = {};

const QUALITY_LABELS: Record<number, string> = {
  16: '360P',
  32: '480P',
  64: '720P',
  80: '1080P',
  112: '1080P+',
  116: '1080P60',
};

/** 等待 App 回到前台 */
function waitForActive(): Promise<void> {
  return new Promise((resolve) => {
    if (AppState.currentState === 'active') {
      resolve();
      return;
    }
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        sub.remove();
        resolve();
      }
    });
  });
}

/** 读取本地文件实际大小 */
async function readFileSize(uri: string): Promise<number | undefined> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    if (info.exists) return (info as any).size as number;
  } catch {}
  return undefined;
}

export function useDownload() {
  const { tasks, addTask, updateTask, removeTask } = useDownloadStore();

  function taskKey(bvid: string, qn: number) {
    return `${bvid}_${qn}`;
  }

  function localPath(bvid: string, qn: number) {
    return `${FileSystem.documentDirectory}${bvid}_${qn}.mp4`;
  }

  async function startDownload(
    bvid: string,
    cid: number,
    qn: number,
    qdesc: string,
    title: string,
    cover: string,
  ) {
    const key = taskKey(bvid, qn);
    if (tasks[key]?.status === 'downloading') return;

    addTask(key, {
      bvid, title, cover, qn,
      qdesc: qdesc || QUALITY_LABELS[qn] || String(qn),
      status: 'downloading',
      progress: 0,
      createdAt: Date.now(),
    });

    try {
      const [url, buvid3, sessdata] = await Promise.all([
        getPlayUrlForDownload(bvid, cid, qn),
        AsyncStorage.getItem('buvid3'),
        AsyncStorage.getItem('SESSDATA'),
      ]);
      const dest = localPath(bvid, qn);

      const cookies: string[] = [];
      if (buvid3) cookies.push(`buvid3=${buvid3}`);
      if (sessdata) cookies.push(`SESSDATA=${sessdata}`);

      const headers = {
        Referer: 'https://www.bilibili.com',
        Origin: 'https://www.bilibili.com',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(cookies.length > 0 && { Cookie: cookies.join('; ') }),
      };

      const progressCallback = (p: FileSystem.DownloadProgressData) => {
        const { totalBytesWritten, totalBytesExpectedToWrite } = p;
        const progress = totalBytesExpectedToWrite > 0
          ? totalBytesWritten / totalBytesExpectedToWrite : 0;
        const last = lastReportedProgress[key] ?? -1;
        if (progress - last >= 0.01) {
          lastReportedProgress[key] = progress;
          updateTask(key, { progress });
        }
      };

      const resumable = FileSystem.createDownloadResumable(url, dest, { headers }, progressCallback);

      // ── 后台暂停 / 前台续传 ──
      let pausedByBackground = false;
      const appStateSub = AppState.addEventListener('change', async (nextState) => {
        if ((nextState === 'background' || nextState === 'inactive') && !pausedByBackground) {
          pausedByBackground = true;
          try { await resumable.pauseAsync(); } catch {}
        }
      });

      let result = await resumable.downloadAsync();

      // 如果是因为进入后台被暂停（result 为 null 或抛出连接中断），等回前台续传
      if (!result?.uri && pausedByBackground) {
        await waitForActive();
        pausedByBackground = false;
        try {
          result = await resumable.resumeAsync();
        } catch {
          result = null;
        }
      }

      appStateSub.remove();
      delete lastReportedProgress[key];

      if (result?.uri) {
        const fileSize = await readFileSize(result.uri);
        updateTask(key, {
          status: 'done', progress: 1, localUri: result.uri,
          ...(fileSize ? { fileSize } : {}),
        });
      } else {
        updateTask(key, { status: 'error', error: '下载失败' });
      }

    } catch (e: any) {
      delete lastReportedProgress[key];
      console.error('[Download] failed:', e);

      // 连接中断 + 已被后台暂停 → 不报错，等回前台后让用户手动重试即可
      const isConnectionAbort = (e?.message ?? '').includes('connection a');
      const msg = isConnectionAbort ? '已暂停，返回应用后可重试' : (e?.message ?? '下载失败');
      updateTask(key, {
        status: 'error',
        error: msg.length > 40 ? msg.slice(0, 40) + '...' : msg,
      });
    }
  }

  function getLocalUri(bvid: string, qn: number): string | undefined {
    return tasks[taskKey(bvid, qn)]?.localUri;
  }

  function cancelDownload(bvid: string, qn: number) {
    removeTask(taskKey(bvid, qn));
  }

  return { tasks, startDownload, getLocalUri, cancelDownload, taskKey };
}
