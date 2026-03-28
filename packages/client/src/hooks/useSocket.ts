import {useCallback, useEffect, useRef, useState} from "react";
import {socket} from "../api/socket";

export interface SocketEvent {
  type: string;
  data: unknown;
}

interface UseSocketOptions {
  onEvent?: (event: SocketEvent) => void;
}

export function useSocket({ onEvent }: UseSocketOptions = {}) {
  const [lastEvent, setLastEvent] = useState<SocketEvent | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    socket.connect();

    const handleUpdated = (data: unknown) => {
      const event: SocketEvent = { type: "item:updated", data };
      setLastEvent(event);
      onEventRef.current?.(event);
    };

    const handleAdded = (data: unknown) => {
      const event: SocketEvent = { type: "item:added", data };
      setLastEvent(event);
      onEventRef.current?.(event);
    };

    socket.on("item:updated", handleUpdated);
    socket.on("item:added", handleAdded);

    return () => {
      socket.off("item:updated", handleUpdated);
      socket.off("item:added", handleAdded);
      socket.disconnect();
    };
  }, []);

  const emit = useCallback(
    (event: string, data: unknown) => {
      socket.emit(event, data);
    },
    [],
  );

  return { emit, lastEvent };
}
