import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { apiUploadImage } from "./api";

const QUEUE_KEY = "fedmri_scan_queue";

interface QueueItem {
  uri: string;
  filename: string;
  queuedAt: string;
}

export async function enqueueUpload(uri: string, filename: string): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: QueueItem[] = raw ? JSON.parse(raw) : [];
  queue.push({ uri, filename, queuedAt: new Date().toISOString() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueueLength(): Promise<number> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw).length : 0;
}

export async function processQueue(): Promise<number> {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return 0;

  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return 0;
  const queue: QueueItem[] = JSON.parse(raw);
  if (!queue.length) return 0;

  const remaining: QueueItem[] = [];
  let uploaded = 0;
  for (const item of queue) {
    try {
      await apiUploadImage(item.uri, item.filename);
      uploaded++;
    } catch {
      remaining.push(item);
    }
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  return uploaded;
}

/** Call once on app start — auto-retries queued uploads on network reconnect. */
export function startQueueWorker(): () => void {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) processQueue();
  });
}
