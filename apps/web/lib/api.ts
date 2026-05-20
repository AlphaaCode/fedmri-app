const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function token(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const t = token();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401) {
      // Token expired or missing — clear auth and force re-login
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
      throw new Error("Session expired — please sign in again");
    }
    let detail = "Request failed";
    try {
      detail = (await res.json()).message || detail;
    } catch {}
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string; user: any }> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Login failed");
  }
  return res.json();
}

export async function apiVerifyImage(file: File): Promise<{ valid: boolean; confidence: number; reason: string }> {
  const form = new FormData();
  form.append("file", file);
  const t = token();
  const headers: Record<string, string> = {};
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const res = await fetch(`${API}/cases/verify`, { method: "POST", body: form, headers });
  if (!res.ok) return { valid: true, confidence: 0.5, reason: "Could not verify — proceeding" };
  return res.json();
}

export async function apiUploadCase(file: File): Promise<any> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch("/cases", { method: "POST", body: form });
}

export async function apiGetAttention(
  caseId: string,
): Promise<{ attention: number[]; size: number }> {
  return apiFetch(`/cases/${caseId}/attention`);
}

export async function apiSubmitFeedback(
  caseId: string,
  type: "VALIDATE" | "DISPUTE",
  correctSubtype?: string,
  justification?: string,
): Promise<any> {
  return apiFetch(`/cases/${caseId}/feedback`, {
    method: "POST",
    body: JSON.stringify({ type, correctSubtype, justification }),
  });
}

export const API_URL = API;
