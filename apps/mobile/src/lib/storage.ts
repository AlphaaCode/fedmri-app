import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

export async function getItem(key: string): Promise<string | null> {
  if (isWeb) return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  const SecureStore = await import("expo-secure-store");
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) { if (typeof localStorage !== "undefined") localStorage.setItem(key, value); return; }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (isWeb) { if (typeof localStorage !== "undefined") localStorage.removeItem(key); return; }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.deleteItemAsync(key).catch(() => {});
}
