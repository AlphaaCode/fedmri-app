"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

export default function HomePage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    } else if (user?.role === "DOCTOR") {
      router.replace("/doctor/scan");
    } else if (user?.role === "PATIENT") {
      router.replace("/patient/chat");
    } else {
      router.replace("/login");
    }
  }, [token, user, router]);

  return (
    <main className="flex-1 flex items-center justify-center text-gray-500">
      Redirecting…
    </main>
  );
}
