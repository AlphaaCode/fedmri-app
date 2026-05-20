import { create } from "zustand";
import { clearToken, getUser, loadApiUrl, setToken, setUser } from "./api";
import { getItem } from "./storage";

interface AuthState {
  user: any | null;
  token: string | null;
  ready: boolean;
  setAuth: (user: any, token: string) => Promise<void>;
  clear: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  ready: false,
  setAuth: async (user, token) => {
    await setToken(token);
    await setUser(user);
    set({ user, token });
  },
  clear: async () => {
    await clearToken();
    set({ user: null, token: null });
  },
  hydrate: async () => {
    // Load saved API URL FIRST so subsequent fetches go to the right host.
    await loadApiUrl();
    const token = await getItem("token");
    const user = await getUser();
    set({ token, user, ready: true });
  },
}));
