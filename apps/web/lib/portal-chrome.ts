"use client";

import { create } from "zustand";

interface PortalChromeState {
  title: string;
  setTitle: (title: string) => void;
}

export const usePortalChrome = create<PortalChromeState>((set) => ({
  title: "",
  setTitle: (title) => set({ title }),
}));
