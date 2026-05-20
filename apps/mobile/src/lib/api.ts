import Constants from "expo-constants";
import { Platform } from "react-native";
import { getItem, setItem, deleteItem } from "./storage";

// Default from app.json — used until the user overrides it at runtime
const DEFAULT_API_URL: string =
  (Constants.expoConfig?.extra as any)?.apiUrl ?? "http://10.0.2.2:3001";

// Runtime-mutable cache. Set on app boot from storage; can be changed
// from the Login screen without rebuilding.
let _apiUrl: string = DEFAULT_API_URL;

export async function loadApiUrl(): Promise<string> {
  const saved = await getItem("apiUrl");
  if (saved) _apiUrl = saved;
  return _apiUrl;
}

export async function setApiUrl(url: string): Promise<void> {
  const trimmed = url.trim().replace(/\/$/, "");
  _apiUrl = trimmed;
  await setItem("apiUrl", trimmed);
}

export function getApiUrl(): string {
  return _apiUrl;
}

export const API_URL = DEFAULT_API_URL;

async function getToken(): Promise<string | null> {
  return getItem("token");
}

export async function setToken(token: string): Promise<void> {
  await setItem("token", token);
}

export async function clearToken(): Promise<void> {
  await deleteItem("token");
  await deleteItem("user");
}

export async function setUser(user: any): Promise<void> {
  await setItem("user", JSON.stringify(user));
}

export async function getUser(): Promise<any | null> {
  const raw = await getItem("user");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers as any);
  headers.set("Accept", "application/json");
  const t = await getToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${getApiUrl()}${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401) {
      await clearToken();
      throw new Error("Session expired — please sign in again");
    }
    let detail = "Request failed";
    try { detail = ((await res.json()) as any).message || detail; } catch {}
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${getApiUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || "Login failed");
  }
  return res.json() as Promise<{ accessToken: string; refreshToken: string; user: any }>;
}

export async function apiRegister(email: string, password: string, name: string) {
  const res = await fetch(`${getApiUrl()}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, role: "PATIENT" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || "Registration failed");
  }
  return res.json();
}

async function buildFileForm(uri: string, filename: string, fieldName = "file"): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === "web") {
    // On web, uri is a blob URL — fetch the real bytes then append as Blob
    const blobRes = await fetch(uri);
    const blob = await blobRes.blob();
    form.append(fieldName, blob, filename);
  } else {
    // React Native FormData accepts { uri, type, name } shape
    form.append(fieldName, { uri, type: "image/jpeg", name: filename } as any);
  }
  return form;
}

export async function apiVerifyImage(uri: string, filename: string): Promise<{ valid: boolean; confidence: number; reason: string }> {
  const t = await getToken();
  const form = await buildFileForm(uri, `verify-${filename}`);
  const res = await fetch(`${getApiUrl()}/cases/verify`, {
    method: "POST",
    headers: t ? { Authorization: `Bearer ${t}` } : {},
    body: form as any,
  });
  if (!res.ok) {
    return { valid: true, confidence: 0.5, reason: "Could not verify — proceeding" };
  }
  return res.json();
}

export async function apiUploadImage(uri: string, filename: string): Promise<any> {
  const t = await getToken();
  const form = await buildFileForm(uri, filename);
  const res = await fetch(`${getApiUrl()}/cases`, {
    method: "POST",
    headers: t ? { Authorization: `Bearer ${t}` } : {},
    body: form as any,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Upload failed (${res.status})`);
  }
  return res.json();
}
