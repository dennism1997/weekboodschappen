import {useCallback, useEffect, useRef, useState} from "react";
import {apiFetch} from "../api/client";

interface QueueItem {
  id: string;
  url: string;
  method: string;
  body: string | undefined;
  timestamp: number;
}

const STORAGE_KEY = "offline_queue";

function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueueItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueLength, setQueueLength] = useState(() => loadQueue().length);
  const replayingRef = useRef(false);

  const enqueue = useCallback(
    (url: string, method: string, body?: string) => {
      const queue = loadQueue();
      queue.push({
        id: crypto.randomUUID(),
        url,
        method,
        body,
        timestamp: Date.now(),
      });
      saveQueue(queue);
      setQueueLength(queue.length);
    },
    [],
  );

  const replayQueue = useCallback(async () => {
    if (replayingRef.current) return;
    replayingRef.current = true;

    try {
      const queue = loadQueue();
      const remaining: QueueItem[] = [];

      for (const item of queue) {
        try {
          await apiFetch(item.url, {
            method: item.method,
            body: item.body,
          });
        } catch {
          remaining.push(item);
        }
      }

      saveQueue(remaining);
      setQueueLength(remaining.length);
    } finally {
      replayingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      replayQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Replay any queued items on mount if online
    if (navigator.onLine) {
      replayQueue();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [replayQueue]);

  return { enqueue, queueLength, isOnline };
}
