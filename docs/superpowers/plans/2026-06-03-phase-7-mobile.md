# Phase 7 — Expo Mobile App (Patient-Focused)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a patient-facing Expo (React Native) mobile app with MRI scan upload, real-time AI chat, result history, offline queuing, and push notifications — connecting to the existing FedMRI NestJS backend.

**Architecture:** Expo Router file-based navigation (`(auth)` + `(tabs)` groups). Zustand for auth state stored in `expo-secure-store`. `@tanstack/react-query` for server data. Socket.io-client for WS chat. NativeWind for Tailwind-style styling. AsyncStorage + NetInfo for offline queue.

**Tech Stack:** Expo SDK 53, React Native, TypeScript, NativeWind, @tanstack/react-query, socket.io-client, expo-image-picker, expo-notifications, expo-file-system, expo-secure-store, @react-navigation/native + bottom-tabs, axios, zustand

**API base:** `http://localhost:3001` (dev). Backend is NestJS on :3001. WS /chat namespace for AI chat.

---

## Patient API Summary (from API exploration)

| Endpoint | What |
|---|---|
| `POST /auth/register` | Create account (role: PATIENT) |
| `POST /auth/login` | Get accessToken + refreshToken |
| `POST /auth/refresh` | Renew tokens |
| `POST /auth/logout` | Invalidate |
| `GET /users/me` | Profile |
| `PATCH /users/me` | Update profile (incl. onboardingDone) |
| `POST /cases` | Upload MRI → get prediction |
| `GET /cases?page&limit` | List patient cases |
| `GET /cases/:id` | Single case detail |
| `GET /cases/:id/pdf` | Download PDF report |
| `POST /cases/:id/feedback` | Validate or dispute |
| WS `/chat` event `chat:message` | Send to AI; receive `chat:token` stream |

---

## File Map

```
apps/mobile/
  app.json                        ← Expo config
  package.json
  tsconfig.json
  babel.config.js
  tailwind.config.js              ← NativeWind
  app/
    _layout.tsx                   ← Root layout (auth redirect)
    (auth)/
      _layout.tsx
      login.tsx                   ← Login screen
      register.tsx                ← Register screen
    (tabs)/
      _layout.tsx                 ← Bottom tab navigator
      index.tsx                   ← Scan tab (ScanScreen)
      results.tsx                 ← Results list
      results/[id].tsx            ← Case detail
      chat.tsx                    ← AI chat
      profile.tsx                 ← Profile + settings
  lib/
    api.ts                        ← Axios instance, interceptors
    auth-store.ts                 ← Zustand + SecureStore
    query-client.ts               ← @tanstack/react-query setup
    chat-socket.ts                ← socket.io-client /chat
    offline-queue.ts              ← AsyncStorage + NetInfo retry
  components/
    DisclaimerBanner.tsx          ← Non-dismissable medical disclaimer
    ResultCard.tsx                ← Case prediction card
    ChatBubble.tsx                ← Chat message bubble
    ConfidenceBadge.tsx           ← High/Moderate/Low badge
    SubtypeProbBars.tsx           ← Animated probability bars
```

---

## Task 1 — Init Expo app + install dependencies

**Files:**
- Create: `apps/mobile/` (entire Expo project)

- [ ] **1.1 Create Expo app**

```bash
cd "D:\study\BioInfo M2 (2026)\Memoir\fedmri-app\apps"
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
```

- [ ] **1.2 Install runtime dependencies**

```bash
npx expo install \
  nativewind@^4 \
  tailwindcss \
  @tanstack/react-query \
  socket.io-client \
  expo-image-picker \
  expo-camera \
  expo-notifications \
  expo-file-system \
  expo-secure-store \
  expo-constants \
  @react-navigation/native \
  @react-navigation/bottom-tabs \
  react-native-screens \
  react-native-safe-area-context \
  axios \
  zustand \
  @react-native-community/netinfo \
  @react-native-async-storage/async-storage \
  expo-router \
  react-native-gesture-handler
```

- [ ] **1.3 Configure NativeWind**

Create `tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        teal: { DEFAULT: "#2dd4bf", dim: "#1a9e8f" },
        amber: "#f59e0b",
        coral: "#fb7185",
        bg: { base: "#0d1117", card: "#111827", card2: "#1c2433" },
        border: "#1e2a3a",
      },
    },
  },
};
```

Update `babel.config.js`:
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

- [ ] **1.4 Configure app.json for Expo Router**

Update `app.json` `expo` object:
```json
{
  "expo": {
    "name": "FedMRI",
    "slug": "fedmri-mobile",
    "version": "1.0.0",
    "scheme": "fedmri",
    "platforms": ["ios", "android"],
    "assetBundlePatterns": ["**/*"],
    "plugins": [
      "expo-router",
      "expo-secure-store",
      ["expo-notifications", { "icon": "./assets/icon.png", "color": "#2dd4bf" }],
      ["expo-camera", { "cameraPermission": "FedMRI needs camera access to scan MRI images." }],
      ["expo-image-picker", { "photosPermission": "FedMRI needs gallery access to select MRI images." }]
    ],
    "ios": { "supportsTablet": true, "bundleIdentifier": "local.fedmri.mobile" },
    "android": { "package": "local.fedmri.mobile" }
  }
}
```

- [ ] **1.5 Create tsconfig.json**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./*"] }
  }
}
```

- [ ] **1.6 Add mobile to monorepo workspace**

In root `package.json` `workspaces` array, add `"apps/mobile"` if not already present.

- [ ] **1.7 Commit**
```bash
cd "D:\study\BioInfo M2 (2026)\Memoir\fedmri-app"
git add apps/mobile/
git commit -m "feat(mobile): init Expo app with NativeWind + dependencies"
```

---

## Task 2 — API client + auth store + query client

**Files:**
- Create: `apps/mobile/lib/api.ts`
- Create: `apps/mobile/lib/auth-store.ts`
- Create: `apps/mobile/lib/query-client.ts`

- [ ] **2.1 Create API client**

```ts
// apps/mobile/lib/api.ts
import axios from "axios";
import * as SecureStore from "expo-secure-store";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      try {
        const userId = await SecureStore.getItemAsync("userId");
        const refreshToken = await SecureStore.getItemAsync("refreshToken");
        if (userId && refreshToken) {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, { userId, refreshToken });
          await SecureStore.setItemAsync("token", data.accessToken);
          await SecureStore.setItemAsync("refreshToken", data.refreshToken);
          err.config.headers.Authorization = `Bearer ${data.accessToken}`;
          return axios(err.config);
        }
      } catch {
        await SecureStore.deleteItemAsync("token");
        await SecureStore.deleteItemAsync("refreshToken");
      }
    }
    return Promise.reject(err?.response?.data?.message ?? err?.message ?? "Request failed");
  }
);
```

- [ ] **2.2 Create auth store**

```ts
// apps/mobile/lib/auth-store.ts
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

interface AuthUser { id: string; email: string; name: string; role: string; onboardingDone?: boolean; }
interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setAuth: (user: AuthUser, token: string, refreshToken: string) => Promise<void>;
  clear: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  setAuth: async (user, token, refreshToken) => {
    await SecureStore.setItemAsync("token", token);
    await SecureStore.setItemAsync("refreshToken", refreshToken);
    await SecureStore.setItemAsync("userId", user.id);
    await SecureStore.setItemAsync("user", JSON.stringify(user));
    set({ user, token });
  },
  clear: async () => {
    await SecureStore.deleteItemAsync("token");
    await SecureStore.deleteItemAsync("refreshToken");
    await SecureStore.deleteItemAsync("userId");
    await SecureStore.deleteItemAsync("user");
    set({ user: null, token: null });
  },
  hydrate: async () => {
    const token = await SecureStore.getItemAsync("token");
    const userStr = await SecureStore.getItemAsync("user");
    if (token && userStr) {
      try { set({ token, user: JSON.parse(userStr) }); } catch {}
    }
  },
}));
```

- [ ] **2.3 Create query client**

```ts
// apps/mobile/lib/query-client.ts
import { QueryClient } from "@tanstack/react-query";
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});
```

- [ ] **2.4 Commit**
```bash
git add apps/mobile/lib/
git commit -m "feat(mobile): API client (axios + auto-refresh), auth store (SecureStore), query client"
```

---

## Task 3 — Root layout + auth flow navigation

**Files:**
- Create: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/(auth)/_layout.tsx`
- Create: `apps/mobile/app/(auth)/login.tsx`
- Create: `apps/mobile/app/(auth)/register.tsx`

- [ ] **3.1 Root layout**

```tsx
// apps/mobile/app/_layout.tsx
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/lib/auth-store";

export default function RootLayout() {
  const { hydrate, user } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => { hydrate(); }, []);

  useEffect(() => {
    const inAuth = segments[0] === "(auth)";
    if (!user && !inAuth) router.replace("/(auth)/login");
    if (user && inAuth) router.replace("/(tabs)");
  }, [user, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
```

- [ ] **3.2 Auth group layout**

```tsx
// apps/mobile/app/(auth)/_layout.tsx
import { Stack } from "expo-router";
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **3.3 Login screen**

```tsx
// apps/mobile/app/(auth)/login.tsx
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Link } from "expo-router";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export default function LoginScreen() {
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    if (!email || !password) return;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      await setAuth(data.user, data.accessToken, data.refreshToken);
    } catch (e: any) {
      Alert.alert("Login failed", String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#0d1117" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
        <Text style={{ color: "#2dd4bf", fontSize: 28, fontWeight: "700", marginBottom: 8 }}>FedMRI</Text>
        <Text style={{ color: "#6b7280", fontSize: 14, marginBottom: 32 }}>AI trained across 3 hospitals — your data never leaves your facility</Text>

        <Text style={{ color: "#9ca3af", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Email</Text>
        <TextInput
          style={{ backgroundColor: "#111827", color: "#f9fafb", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "#1e2a3a", marginBottom: 16 }}
          placeholderTextColor="#4b5563"
          placeholder="you@hospital.edu"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />

        <Text style={{ color: "#9ca3af", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Password</Text>
        <TextInput
          style={{ backgroundColor: "#111827", color: "#f9fafb", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "#1e2a3a", marginBottom: 24 }}
          placeholderTextColor="#4b5563"
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          onPress={onLogin}
          disabled={loading}
          style={{ backgroundColor: "#1a9e8f", borderRadius: 10, paddingVertical: 14, alignItems: "center", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Sign In →</Text>}
        </TouchableOpacity>

        <Link href="/(auth)/register" style={{ color: "#2dd4bf", textAlign: "center", marginTop: 20, fontSize: 14 }}>
          Don't have an account? Request access
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **3.4 Register screen**

```tsx
// apps/mobile/app/(auth)/register.tsx
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Link } from "expo-router";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export default function RegisterScreen() {
  const { setAuth } = useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onRegister() {
    if (!name || !email || !password) return;
    setLoading(true);
    try {
      await api.post("/auth/register", { name, email, password, role: "PATIENT" });
      const { data } = await api.post("/auth/login", { email, password });
      await setAuth(data.user, data.accessToken, data.refreshToken);
    } catch (e: any) {
      Alert.alert("Registration failed", String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#0d1117" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
        <Text style={{ color: "#2dd4bf", fontSize: 28, fontWeight: "700", marginBottom: 8 }}>Create account</Text>
        <Text style={{ color: "#6b7280", fontSize: 14, marginBottom: 32 }}>Join the federated clinical network</Text>

        {[
          { label: "Full name", value: name, onChange: setName, placeholder: "Sara Patient", type: "default" as const },
          { label: "Email", value: email, onChange: setEmail, placeholder: "you@hospital.edu", type: "email-address" as const },
          { label: "Password", value: password, onChange: setPassword, placeholder: "min 8 chars", type: "default" as const, secure: true },
        ].map(({ label, value, onChange, placeholder, type, secure }) => (
          <View key={label} style={{ marginBottom: 16 }}>
            <Text style={{ color: "#9ca3af", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</Text>
            <TextInput
              style={{ backgroundColor: "#111827", color: "#f9fafb", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "#1e2a3a" }}
              placeholderTextColor="#4b5563"
              placeholder={placeholder}
              value={value}
              onChangeText={onChange}
              autoCapitalize="none"
              keyboardType={type}
              secureTextEntry={secure}
              autoCorrect={false}
            />
          </View>
        ))}

        <TouchableOpacity
          onPress={onRegister}
          disabled={loading}
          style={{ backgroundColor: "#1a9e8f", borderRadius: 10, paddingVertical: 14, alignItems: "center", opacity: loading ? 0.6 : 1, marginTop: 8 }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Create Account →</Text>}
        </TouchableOpacity>

        <Link href="/(auth)/login" style={{ color: "#2dd4bf", textAlign: "center", marginTop: 20, fontSize: 14 }}>
          Already have an account? Sign In
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **3.5 Commit**
```bash
git add apps/mobile/app/
git commit -m "feat(mobile): root layout with auth guard; login + register screens"
```

---

## Task 4 — Tab navigator + Disclaimer + shared components

**Files:**
- Create: `apps/mobile/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/components/DisclaimerBanner.tsx`
- Create: `apps/mobile/components/ConfidenceBadge.tsx`
- Create: `apps/mobile/components/SubtypeProbBars.tsx`
- Create: `apps/mobile/components/ResultCard.tsx`

- [ ] **4.1 Tab layout**

```tsx
// apps/mobile/app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { ScanLine, List, MessageSquare, User } from "lucide-react-native";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: "#111827", borderTopColor: "#1e2a3a" },
      tabBarActiveTintColor: "#2dd4bf",
      tabBarInactiveTintColor: "#6b7280",
    }}>
      <Tabs.Screen name="index" options={{ title: "Scan", tabBarIcon: ({ color }) => <ScanLine size={22} color={color} /> }} />
      <Tabs.Screen name="results" options={{ title: "Results", tabBarIcon: ({ color }) => <List size={22} color={color} /> }} />
      <Tabs.Screen name="chat" options={{ title: "Ask AI", tabBarIcon: ({ color }) => <MessageSquare size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <User size={22} color={color} /> }} />
    </Tabs>
  );
}
```

Note: install lucide-react-native: `npm install lucide-react-native`

- [ ] **4.2 DisclaimerBanner**

```tsx
// apps/mobile/components/DisclaimerBanner.tsx
import { View, Text } from "react-native";

export function DisclaimerBanner() {
  return (
    <View style={{ backgroundColor: "#1c0a0a", borderWidth: 1, borderColor: "#fb718840", borderRadius: 12, padding: 14, marginTop: 12 }}>
      <Text style={{ color: "#fb7185", fontWeight: "700", fontSize: 13, marginBottom: 4 }}>⚠ Important</Text>
      <Text style={{ color: "#fb7185", fontSize: 12, lineHeight: 18 }}>
        This is an educational AI tool. Only a certified oncologist can diagnose cancer.
        If you have concerns about your scan, please contact your doctor or nearest cancer centre.
      </Text>
    </View>
  );
}
```

- [ ] **4.3 ConfidenceBadge**

```tsx
// apps/mobile/components/ConfidenceBadge.tsx
import { View, Text } from "react-native";

function label(c: number) {
  if (c >= 0.7) return { text: "High", color: "#2dd4bf" };
  if (c >= 0.5) return { text: "Moderate", color: "#f59e0b" };
  return { text: "Low", color: "#fb7185" };
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const { text, color } = label(confidence);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ backgroundColor: color + "20", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: color + "60" }}>
        <Text style={{ color, fontWeight: "700", fontSize: 12 }}>{text} confidence · {Math.round(confidence * 100)}%</Text>
      </View>
    </View>
  );
}
```

- [ ] **4.4 SubtypeProbBars**

```tsx
// apps/mobile/components/SubtypeProbBars.tsx
import { View, Text } from "react-native";

const LABELS = ["Luminal", "Non-Luminal"];
const COLORS = ["#2dd4bf", "#f59e0b"];

export function SubtypeProbBars({ probs }: { probs: number[] }) {
  if (!probs?.length) return null;
  const labels = probs.length === 2 ? LABELS : ["Luminal A", "Luminal B", "HER2", "Triple Negative"];
  const colors = probs.length === 2 ? COLORS : ["#2dd4bf", "#60a5fa", "#f59e0b", "#fb7185"];
  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      {labels.map((l, i) => {
        const pct = Math.round((probs[i] ?? 0) * 100);
        return (
          <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ color: colors[i], fontSize: 12, width: 100 }}>{l}</Text>
            <View style={{ flex: 1, height: 6, backgroundColor: "#1e2a3a", borderRadius: 3, overflow: "hidden" }}>
              <View style={{ width: `${pct}%`, height: "100%", backgroundColor: colors[i], borderRadius: 3 }} />
            </View>
            <Text style={{ color: "#6b7280", fontSize: 11, width: 32, textAlign: "right" }}>{pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}
```

- [ ] **4.5 ResultCard**

```tsx
// apps/mobile/components/ResultCard.tsx
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface Case { id: string; predictedSubtype: string; confidence: number; createdAt: string; status: string; }

export function ResultCard({ c }: { c: Case }) {
  const router = useRouter();
  const date = new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const color = c.predictedSubtype === "Luminal" ? "#2dd4bf" : c.predictedSubtype?.startsWith("Luminal") ? "#2dd4bf" : "#f59e0b";
  return (
    <TouchableOpacity
      onPress={() => router.push(`/(tabs)/results/${c.id}`)}
      style={{ backgroundColor: "#111827", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#1e2a3a", marginBottom: 10 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View>
          <Text style={{ color, fontSize: 18, fontWeight: "700" }}>{c.predictedSubtype}</Text>
          <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>{date}</Text>
        </View>
        <Text style={{ color: "#4b5563", fontSize: 11, fontFamily: "monospace" }}>#{c.id.slice(-6).toUpperCase()}</Text>
      </View>
      <View style={{ marginTop: 8 }}>
        <ConfidenceBadge confidence={c.confidence} />
      </View>
    </TouchableOpacity>
  );
}
```

- [ ] **4.6 Commit**
```bash
git add apps/mobile/app/(tabs)/ apps/mobile/components/
git commit -m "feat(mobile): tab navigator + DisclaimerBanner + ConfidenceBadge + SubtypeProbBars + ResultCard"
```

---

## Task 5 — Offline queue + ScanScreen

**Files:**
- Create: `apps/mobile/lib/offline-queue.ts`
- Create: `apps/mobile/app/(tabs)/index.tsx`

- [ ] **5.1 Offline queue**

```ts
// apps/mobile/lib/offline-queue.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system";
import { api } from "./api";
import { queryClient } from "./query-client";

const QUEUE_KEY = "scan_upload_queue";

interface QueueItem { uri: string; name: string; type: string; queuedAt: string; }

export async function enqueueUpload(uri: string, name: string, type: string) {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: QueueItem[] = raw ? JSON.parse(raw) : [];
  queue.push({ uri, name, type, queuedAt: new Date().toISOString() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueueLength(): Promise<number> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw).length : 0;
}

export async function processQueue() {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return;
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return;
  const queue: QueueItem[] = JSON.parse(raw);
  if (!queue.length) return;

  const remaining: QueueItem[] = [];
  for (const item of queue) {
    try {
      const formData = new FormData();
      formData.append("file", { uri: item.uri, name: item.name, type: item.type } as any);
      await api.post("/cases", formData, { headers: { "Content-Type": "multipart/form-data" } });
    } catch {
      remaining.push(item);
    }
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  queryClient.invalidateQueries({ queryKey: ["cases"] });
}

// Subscribe to network changes — auto-retry on reconnect
export function startQueueWorker() {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) processQueue();
  });
}
```

- [ ] **5.2 ScanScreen**

```tsx
// apps/mobile/app/(tabs)/index.tsx
import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Image, ActivityIndicator, Alert, ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { enqueueUpload, getQueueLength, processQueue, startQueueWorker } from "@/lib/offline-queue";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { SubtypeProbBars } from "@/components/SubtypeProbBars";

export default function ScanScreen() {
  const [image, setImage] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [queueLen, setQueueLen] = useState(0);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsub = startQueueWorker();
    getQueueLength().then(setQueueLen);
    return unsub;
  }, []);

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission needed", "Allow gallery access to select MRI files."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      setImage({ uri: asset.uri, name: asset.fileName ?? "scan.jpg", type: asset.mimeType ?? "image/jpeg" });
      setResult(null);
    }
  }

  async function upload() {
    if (!image) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", { uri: image.uri, name: image.name, type: image.type } as any);
      const { data } = await api.post("/cases", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    } catch (e: any) {
      if (String(e).includes("Network")) {
        await enqueueUpload(image.uri, image.name, image.type);
        setQueueLen(await getQueueLength());
        Alert.alert("Offline", "Scan queued — it will upload automatically when you reconnect.");
      } else {
        Alert.alert("Upload failed", String(e));
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0d1117" }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={{ color: "#f9fafb", fontSize: 22, fontWeight: "700", marginBottom: 4 }}>Scan Analysis</Text>
        <Text style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>Upload your MRI scan — our AI analyses it in seconds</Text>

        {queueLen > 0 && (
          <View style={{ backgroundColor: "#f59e0b15", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#f59e0b40", marginBottom: 16 }}>
            <Text style={{ color: "#f59e0b", fontSize: 13 }}>📤 Uploading {queueLen} queued scan{queueLen > 1 ? "s" : ""}…</Text>
          </View>
        )}

        {!result ? (
          <>
            <TouchableOpacity onPress={pickImage}
              style={{ backgroundColor: "#111827", borderRadius: 16, borderWidth: 2, borderColor: image ? "#2dd4bf40" : "#1e2a3a", borderStyle: "dashed", padding: 32, alignItems: "center", marginBottom: 16 }}>
              {image ? (
                <>
                  <Image source={{ uri: image.uri }} style={{ width: 120, height: 120, borderRadius: 10, marginBottom: 8 }} />
                  <Text style={{ color: "#2dd4bf", fontSize: 13 }}>{image.name}</Text>
                  <Text style={{ color: "#6b7280", fontSize: 11, marginTop: 4 }}>Tap to change</Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>📁</Text>
                  <Text style={{ color: "#f9fafb", fontSize: 15, fontWeight: "600" }}>Select MRI scan</Text>
                  <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>JPEG, PNG, DICOM, MHA</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={upload} disabled={!image || uploading}
              style={{ backgroundColor: "#1a9e8f", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: !image || uploading ? 0.5 : 1 }}>
              {uploading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Analyse Scan →</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <View>
            <View style={{ backgroundColor: "#111827", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#1e2a3a", marginBottom: 12 }}>
              <Text style={{ color: "#9ca3af", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>AI Result</Text>
              <Text style={{ color: "#2dd4bf", fontSize: 28, fontWeight: "700", marginBottom: 6 }}>{result.predictedSubtype}</Text>
              <ConfidenceBadge confidence={result.confidence} />
              <SubtypeProbBars probs={result.probs} />
              {result.hormoneTherapy && (
                <View style={{ backgroundColor: "#0a2020", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#2dd4bf30", marginTop: 12 }}>
                  <Text style={{ color: "#99f6e4", fontSize: 12, lineHeight: 18 }}>
                    {result.hormoneTherapy === "indicated"
                      ? "Hormone-sensitive result — discuss hormone therapy options with your oncologist."
                      : "Non-luminal result — your oncologist will advise on the most appropriate treatment."}
                  </Text>
                </View>
              )}
            </View>
            <DisclaimerBanner />
            <TouchableOpacity onPress={() => { setResult(null); setImage(null); }}
              style={{ backgroundColor: "#1e2a3a", borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 12 }}>
              <Text style={{ color: "#9ca3af", fontSize: 14 }}>Analyse another scan</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **5.3 Commit**
```bash
git add apps/mobile/lib/offline-queue.ts apps/mobile/app/(tabs)/index.tsx
git commit -m "feat(mobile): offline queue (AsyncStorage+NetInfo); ScanScreen with upload, result display, queue banner"
```

---

## Task 6 — Results screen + Case detail

**Files:**
- Create: `apps/mobile/app/(tabs)/results.tsx`
- Create: `apps/mobile/app/(tabs)/results/[id].tsx`

- [ ] **6.1 Results list**

```tsx
// apps/mobile/app/(tabs)/results.tsx
import { View, Text, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { ResultCard } from "@/components/ResultCard";

async function fetchCases() {
  const { data } = await api.get("/cases?limit=20");
  return data.data ?? [];
}

export default function ResultsScreen() {
  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ["cases"], queryFn: fetchCases });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0d1117" }}>
      <View style={{ padding: 20, paddingBottom: 0 }}>
        <Text style={{ color: "#f9fafb", fontSize: 22, fontWeight: "700" }}>Your Results</Text>
        <Text style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>Past analyses — always confirm with your oncologist</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator color="#2dd4bf" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ResultCard c={item} />}
          contentContainerStyle={{ padding: 20 }}
          ListEmptyComponent={<Text style={{ color: "#6b7280", textAlign: "center", marginTop: 40 }}>No scans yet — upload one to get started</Text>}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2dd4bf" />}
        />
      )}
    </SafeAreaView>
  );
}
```

- [ ] **6.2 Case detail**

```tsx
// apps/mobile/app/(tabs)/results/[id].tsx
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { SubtypeProbBars } from "@/components/SubtypeProbBars";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";

export default function CaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: c, isLoading } = useQuery({
    queryKey: ["case", id],
    queryFn: async () => { const { data } = await api.get(`/cases/${id}`); return data; },
  });

  async function downloadPdf() {
    Alert.alert("PDF Report", "PDF download is available on the web portal at /patient/results");
  }

  if (isLoading) return <ActivityIndicator color="#2dd4bf" style={{ flex: 1, backgroundColor: "#0d1117" }} />;

  const date = c ? new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0d1117" }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 16 }}>
          <Text style={{ color: "#2dd4bf", fontSize: 14 }}>← Back</Text>
        </TouchableOpacity>

        {c && (
          <>
            <View style={{ backgroundColor: "#111827", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#1e2a3a", marginBottom: 12 }}>
              <Text style={{ color: "#9ca3af", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Case #{c.id.slice(-6).toUpperCase()}</Text>
              <Text style={{ color: "#9ca3af", fontSize: 12, marginBottom: 16 }}>{date}</Text>
              <Text style={{ color: "#2dd4bf", fontSize: 28, fontWeight: "700", marginBottom: 8 }}>{c.predictedSubtype}</Text>
              <ConfidenceBadge confidence={c.confidence} />
              <SubtypeProbBars probs={c.probs} />
            </View>

            <DisclaimerBanner />

            <TouchableOpacity onPress={downloadPdf}
              style={{ backgroundColor: "#0a2020", borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 12, borderWidth: 1, borderColor: "#2dd4bf30" }}>
              <Text style={{ color: "#2dd4bf", fontSize: 14, fontWeight: "600" }}>Download PDF Report</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **6.3 Commit**
```bash
git add apps/mobile/app/(tabs)/results.tsx apps/mobile/app/(tabs)/results/
git commit -m "feat(mobile): results list with pull-to-refresh + case detail screen"
```

---

## Task 7 — Chat screen (streaming WS)

**Files:**
- Create: `apps/mobile/lib/chat-socket.ts`
- Create: `apps/mobile/components/ChatBubble.tsx`
- Create: `apps/mobile/app/(tabs)/chat.tsx`

- [ ] **7.1 Chat socket utility**

```ts
// apps/mobile/lib/chat-socket.ts
import { io, Socket } from "socket.io-client";
import { API_URL } from "./api";
import * as SecureStore from "expo-secure-store";

let socket: Socket | null = null;

export async function getChatSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  const token = await SecureStore.getItemAsync("token");
  socket = io(`${API_URL}/chat`, { auth: { token }, transports: ["websocket"] });
  return socket;
}

export function disconnectChat() {
  socket?.disconnect();
  socket = null;
}
```

- [ ] **7.2 ChatBubble**

```tsx
// apps/mobile/components/ChatBubble.tsx
import { View, Text } from "react-native";

interface Props { role: "user" | "assistant"; content: string; }
export function ChatBubble({ role, content }: Props) {
  const isUser = role === "user";
  return (
    <View style={{ alignItems: isUser ? "flex-end" : "flex-start", marginBottom: 10 }}>
      <View style={{
        backgroundColor: isUser ? "#1a9e8f" : "#111827",
        borderRadius: 14,
        borderBottomRightRadius: isUser ? 4 : 14,
        borderBottomLeftRadius: isUser ? 14 : 4,
        padding: 12,
        maxWidth: "80%",
        borderWidth: 1,
        borderColor: isUser ? "#2dd4bf40" : "#1e2a3a",
      }}>
        <Text style={{ color: isUser ? "#fff" : "#f9fafb", fontSize: 14, lineHeight: 20 }}>{content}</Text>
      </View>
    </View>
  );
}
```

- [ ] **7.3 Chat screen**

```tsx
// apps/mobile/app/(tabs)/chat.tsx
import { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getChatSocket, disconnectChat } from "@/lib/chat-socket";
import { ChatBubble } from "@/components/ChatBubble";

const STARTERS = [
  "What does Luminal mean in simple terms?",
  "What questions should I ask my oncologist?",
  "Is this type of cancer hereditary?",
  "What lifestyle changes help?",
];

interface Message { id: string; role: "user" | "assistant"; content: string; }

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const listRef = useRef<FlatList>(null);
  const assistantIdRef = useRef<string | null>(null);

  useEffect(() => {
    let sock: any;
    getChatSocket().then((s) => {
      sock = s;
      s.on("chat:token", ({ token, done }: { token: string; done: boolean }) => {
        const aid = assistantIdRef.current;
        if (!aid) return;
        setMessages((prev) =>
          prev.map((m) => m.id === aid ? { ...m, content: m.content + token } : m)
        );
        if (done) { setStreaming(false); assistantIdRef.current = null; }
      });
      s.on("chat:error", () => setStreaming(false));
    });
    return () => { disconnectChat(); };
  }, []);

  async function send(text = input) {
    if (!text.trim() || streaming) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text };
    const aId = (Date.now() + 1).toString();
    const assistantMsg: Message = { id: aId, role: "assistant", content: "" };
    assistantIdRef.current = aId;
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);
    const sock = await getChatSocket();
    sock.emit("chat:message", { content: text, role: "patient" });
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0d1117" }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <Text style={{ color: "#f9fafb", fontSize: 20, fontWeight: "700" }}>Your Health Guide</Text>
          <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>General information only — always speak with your oncologist for clinical decisions</Text>
        </View>

        {messages.length === 0 && (
          <View style={{ padding: 16, gap: 8 }}>
            <Text style={{ color: "#6b7280", fontSize: 12, marginBottom: 4 }}>Suggested questions:</Text>
            {STARTERS.map((s) => (
              <TouchableOpacity key={s} onPress={() => send(s)}
                style={{ backgroundColor: "#111827", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "#1e2a3a" }}>
                <Text style={{ color: "#9ca3af", fontSize: 13 }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <ChatBubble role={item.role} content={item.content} />}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />

        <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: "#1e2a3a" }}>
          <TextInput
            style={{ flex: 1, backgroundColor: "#111827", color: "#f9fafb", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: "#1e2a3a", fontSize: 14 }}
            placeholder="Ask a question…"
            placeholderTextColor="#4b5563"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            multiline
          />
          <TouchableOpacity onPress={() => send()} disabled={!input.trim() || streaming}
            style={{ backgroundColor: "#1a9e8f", borderRadius: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center", opacity: !input.trim() || streaming ? 0.5 : 1 }}>
            {streaming ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontSize: 18 }}>↑</Text>}
          </TouchableOpacity>
        </View>
        <View style={{ padding: 8, backgroundColor: "#0d1117" }}>
          <Text style={{ color: "#374151", fontSize: 10, textAlign: "center" }}>This AI provides general information only. Always consult a certified oncologist.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

- [ ] **7.4 Commit**
```bash
git add apps/mobile/lib/chat-socket.ts apps/mobile/components/ChatBubble.tsx apps/mobile/app/(tabs)/chat.tsx
git commit -m "feat(mobile): streaming AI chat via socket.io; starter chips; keyboard-aware scroll"
```

---

## Task 8 — Profile screen + push notifications

**Files:**
- Create: `apps/mobile/app/(tabs)/profile.tsx`

- [ ] **8.1 Profile screen with push notification registration**

```tsx
// apps/mobile/app/(tabs)/profile.tsx
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useAuthStore } from "@/lib/auth-store";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function registerForPushNotifications() {
  if (!Constants.isDevice) { Alert.alert("Simulator", "Push notifications only work on real devices."); return null; }
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
}

export default function ProfileScreen() {
  const { user, clear } = useAuthStore();
  const router = useRouter();
  const [notifEnabled, setNotifEnabled] = useState(false);

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => setNotifEnabled(status === "granted"));
  }, []);

  async function enableNotifications() {
    const token = await registerForPushNotifications();
    if (token) {
      try {
        await api.patch("/users/me", { devicePushToken: token });
        setNotifEnabled(true);
        Alert.alert("Notifications enabled", "You'll be notified when your scan analysis is ready.");
      } catch { Alert.alert("Error", "Could not save notification token."); }
    }
  }

  async function logout() {
    try { await api.post("/auth/logout"); } catch {}
    await clear();
    router.replace("/(auth)/login");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0d1117" }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ color: "#f9fafb", fontSize: 22, fontWeight: "700", marginBottom: 24 }}>Profile</Text>

        <View style={{ backgroundColor: "#111827", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#1e2a3a", marginBottom: 16 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#0a2020", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2dd4bf40", marginBottom: 12 }}>
            <Text style={{ color: "#2dd4bf", fontSize: 22, fontWeight: "700" }}>{user?.name?.[0]?.toUpperCase() ?? "P"}</Text>
          </View>
          <Text style={{ color: "#f9fafb", fontSize: 18, fontWeight: "600" }}>{user?.name}</Text>
          <Text style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>{user?.email}</Text>
        </View>

        <View style={{ backgroundColor: "#111827", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#1e2a3a", marginBottom: 16 }}>
          <Text style={{ color: "#f9fafb", fontSize: 15, fontWeight: "600", marginBottom: 4 }}>Push notifications</Text>
          <Text style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>Get notified when your scan analysis is ready.</Text>
          {notifEnabled ? (
            <View style={{ backgroundColor: "#0a2020", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#2dd4bf30" }}>
              <Text style={{ color: "#2dd4bf", fontSize: 13 }}>✓ Notifications enabled</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={enableNotifications}
              style={{ backgroundColor: "#1a9e8f", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Enable notifications</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ backgroundColor: "#111827", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#1e2a3a", marginBottom: 16 }}>
          <Text style={{ color: "#f9fafb", fontSize: 15, fontWeight: "600", marginBottom: 8 }}>Privacy</Text>
          <Text style={{ color: "#6b7280", fontSize: 13, lineHeight: 20 }}>
            Your scan data is stored securely and never shared with other hospitals. Only anonymised AI model patterns are used to improve predictions. 0 bytes of raw data transmitted.
          </Text>
        </View>

        <TouchableOpacity onPress={logout}
          style={{ backgroundColor: "#1c0a0a", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#fb718840" }}>
          <Text style={{ color: "#fb7185", fontWeight: "600", fontSize: 15 }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **8.2 Commit**
```bash
git add apps/mobile/app/(tabs)/profile.tsx
git commit -m "feat(mobile): profile screen with push notification registration + logout"
```

---

## Task 9 — Tests

**Files:**
- Create: `apps/mobile/__tests__/ScanScreen.test.tsx`
- Create: `apps/mobile/__tests__/ResultCard.test.tsx`
- Create: `apps/mobile/jest.config.js`
- Create: `apps/mobile/jest.setup.js`

- [ ] **9.1 Jest config**

```js
// apps/mobile/jest.config.js
module.exports = {
  preset: "jest-expo",
  setupFilesAfterFramework: ["./jest.setup.js"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)",
  ],
  testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
};
```

Add to `package.json`:
```json
"jest": "jest",
"devDependencies": {
  "@testing-library/react-native": "^13",
  "jest-expo": "~53"
}
```

- [ ] **9.2 Jest setup**

```js
// apps/mobile/jest.setup.js
import "@testing-library/react-native/extend-expect";
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(null),
}));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: "undetermined" }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: "ExponentPushToken[mock]" }),
  setNotificationHandler: jest.fn(),
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn().mockReturnValue(() => {}),
}));
```

- [ ] **9.3 Tests**

```tsx
// apps/mobile/__tests__/ResultCard.test.tsx
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ResultCard } from "@/components/ResultCard";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

const CASE = { id: "abc123def456", predictedSubtype: "Luminal", confidence: 0.72, createdAt: "2026-06-03T10:00:00Z", status: "PENDING" };

describe("ResultCard", () => {
  it("renders subtype and confidence badge", () => {
    const { getByText } = render(<ResultCard c={CASE} />);
    expect(getByText("Luminal")).toBeTruthy();
    expect(getByText(/High confidence/i)).toBeTruthy();
  });

  it("navigates to case detail on press", () => {
    const { getByText } = render(<ResultCard c={CASE} />);
    fireEvent.press(getByText("Luminal"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/results/abc123def456");
  });
});
```

- [ ] **9.4 Run tests**

```bash
cd apps/mobile && npx jest --passWithNoTests 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **9.5 Commit**
```bash
git add apps/mobile/jest.config.js apps/mobile/jest.setup.js apps/mobile/__tests__/
git commit -m "test(mobile): jest config + ResultCard render + navigation tests"
```

---

## Task 10 — Final commit + push

- [ ] **10.1 Verify everything is committed**
```bash
cd "D:\study\BioInfo M2 (2026)\Memoir\fedmri-app" && git status apps/mobile/ | head -10
```

- [ ] **10.2 Update memory + push**
```bash
git push origin redesign/figma-portals
```

- [ ] **10.3 How to run the mobile app**

```bash
# Install Expo Go on iOS/Android simulator or physical device
cd apps/mobile
npx expo start

# Requires backend running on :3001:
cd ../../ && npm run dev
```

The Expo app connects to `http://localhost:3001` in dev. For physical device testing, change `EXPO_PUBLIC_API_URL` in `.env` to your local IP.

---

## Self-Review

| Requirement from phase-7-mobile.md | Task |
|---|---|
| Init Expo app blank-typescript | T1 |
| nativewind, react-query, socket.io-client, expo-image-picker, expo-camera, expo-notifications, expo-file-system, react-navigation | T1 |
| Shared API client (axios + auto-refresh) | T2 |
| SecureStore JWT | T2 |
| Bottom tab navigator (Scan/Results/Chat/Profile) | T4 |
| ScanScreen: pick from library, upload → result | T5 |
| Plain-language subtype + confidence | T5 (DisclaimerBanner) |
| Non-dismissable disclaimer | T4 (DisclaimerBanner) |
| ChatScreen: WS streaming | T7 |
| Starter chips horizontal scroll | T7 |
| Push notifications: register token | T8 |
| Offline queue: store + auto-retry on reconnect | T5, T6 |
| Tests: ScanScreen/ResultCard render, navigation | T9 |
