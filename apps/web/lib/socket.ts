"use client";

import { io, Socket } from "socket.io-client";
import { useFlStore } from "./fl-store";
import { useToastStore } from "@/components/ToastProvider";
import type { WsRoundComplete } from "./types";
import { API_URL } from "./api";

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (socket && socket.connected) return socket;
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(API_URL, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  const fl = useFlStore.getState();

  socket.on("fl:round:started", fl.onRoundStarted);
  socket.on("fl:round:progress", fl.onProgress);
  socket.on("fl:round:complete", (p: WsRoundComplete) => {
    fl.onRoundComplete(p);
    const f1 = p.globalF1After != null ? ` · global F1 ${p.globalF1After.toFixed(3)}` : "";
    useToastStore.getState().push(`Federated round complete — model v${p.modelVersion}${f1}`, "success");
  });
  socket.on("model:updated", fl.onModelUpdated);

  socket.on("connect_error", (err) => {
    // eslint-disable-next-line no-console
    console.warn("[fl-socket] connect error:", err.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
