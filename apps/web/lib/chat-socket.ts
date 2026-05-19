"use client";

import { io, Socket } from "socket.io-client";
import { API_URL } from "./api";

let chatSocket: Socket | null = null;

export function getChatSocket(token: string): Socket {
  if (chatSocket && chatSocket.connected) return chatSocket;
  if (chatSocket) {
    chatSocket.disconnect();
    chatSocket = null;
  }
  chatSocket = io(`${API_URL}/chat`, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
  });
  return chatSocket;
}

export function disconnectChatSocket(): void {
  if (chatSocket) {
    chatSocket.disconnect();
    chatSocket = null;
  }
}
