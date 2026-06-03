"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { ReactNode, useEffect, useState } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { ToastProvider } from "@/components/ToastProvider";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  const hydrate = useAuthStore((s) => s.hydrate);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (token && (user?.role === "DOCTOR" || user?.role === "RESEARCHER")) {
      getSocket(token);
    }
    return () => {
      // socket persists across pages; only disconnect on full unmount
    };
  }, [token, user]);

  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>{children}</ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
