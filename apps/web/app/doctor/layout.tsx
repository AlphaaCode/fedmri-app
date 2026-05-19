"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { FlTopology } from "@/components/FlTopology";

export default function DoctorLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    if (token === null && typeof window !== "undefined") {
      // wait for hydration
      const t = setTimeout(() => {
        if (!useAuthStore.getState().token) router.replace("/login");
      }, 100);
      return () => clearTimeout(t);
    }
  }, [token, router]);

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 p-6 max-w-7xl mx-auto w-full">
      <main className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Doctor portal
            </div>
            <div className="text-lg font-semibold">
              {user?.name ?? "Doctor"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              clear();
              router.replace("/login");
            }}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Sign out
          </button>
        </header>
        {children}
      </main>
      <aside className="space-y-4">
        <FlTopology />
      </aside>
    </div>
  );
}
