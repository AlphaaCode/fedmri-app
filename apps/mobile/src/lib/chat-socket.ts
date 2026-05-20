import { io, Socket } from "socket.io-client";
import { getApiUrl } from "./api";

let socket: Socket | null = null;

export function getChatSocket(token: string): Socket {
  if (socket && socket.connected) return socket;
  if (socket) { socket.disconnect(); socket = null; }
  socket = io(`${getApiUrl()}/chat`, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
  });
  return socket;
}

export function disconnectChatSocket(): void {
  if (socket) { socket.disconnect(); socket = null; }
}
