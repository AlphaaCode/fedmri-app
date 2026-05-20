# FedMRI Mobile (Expo)

Patient-focused mobile app — scan upload, results, AI chat, profile.

## Quick start

### 1. Make sure the backend is reachable

The mobile app needs to talk to the NestJS backend (`apps/backend`, port 3001).

| You are running on | Set `apiUrl` in `app.json` to |
|---|---|
| **Android emulator (Android Studio)** | `http://10.0.2.2:3001` ← default |
| **Expo Go on a real phone** | `http://<YOUR-MACHINE-LAN-IP>:3001` (e.g. `http://192.168.1.42:3001`) |
| **iOS simulator** | `http://localhost:3001` |

To find your machine's LAN IP on Windows: `ipconfig | grep IPv4`

Edit `app.json` → `expo.extra.apiUrl` if needed.

### 2. Start the app

```bash
cd apps/mobile
npx expo start
```

Then:
- **Android emulator** → press `a`
- **iOS simulator** (Mac only) → press `i`
- **Expo Go on phone** → scan the QR code with the Expo Go app

### 3. Build a real APK (Android)

```bash
# install eas if you don't have it
npm i -g eas-cli

# login + configure
eas login
eas build:configure

# build APK (free tier, ~15 min queue)
eas build --platform android --profile preview
```

Or for fully local builds (requires Android Studio + JDK):

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# APK appears in android/app/build/outputs/apk/release/
```

## Architecture

```
apps/mobile/
├── App.tsx              # Auth gate + bottom-tab navigator
├── app.json             # Expo config (icon, permissions, apiUrl)
└── src/
    ├── lib/
    │   ├── api.ts            # fetch wrapper, SecureStore JWT, upload helper
    │   ├── auth-store.ts     # Zustand auth state
    │   ├── chat-socket.ts    # socket.io client for /chat namespace
    │   └── theme.ts          # Colors + subtype palette
    └── screens/
        ├── LoginScreen.tsx
        ├── RegisterScreen.tsx
        ├── ScanScreen.tsx        # Camera + gallery + upload + result
        ├── ResultsScreen.tsx     # Past scans timeline
        ├── ChatScreen.tsx        # Streaming AI chat
        └── ProfileScreen.tsx     # User info + sign out
```

## What works end-to-end

- ✅ Register (PATIENT role)
- ✅ Login (JWT stored in SecureStore — encrypted on device)
- ✅ Take photo with camera OR pick from gallery
- ✅ Upload image as MRI scan → backend predicts subtype → display
- ✅ Plain-language subtype + High/Moderate/Low confidence
- ✅ Persistent disclaimer below every result
- ✅ List past scans (pull-to-refresh)
- ✅ Stream AI chat token-by-token via WebSocket
- ✅ Sign out (clears SecureStore)

## What's not built yet (Phase 7 leftovers)

- Push notifications (`expo-notifications`) — needs FCM/APNs setup
- Offline queue (`@react-native-community/netinfo` + AsyncStorage retry)
- PDF download — backend already supports it, need to wire `expo-file-system` blob save
