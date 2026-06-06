# Phase 7 — Expo mobile app (patient-focused)

**Model**: claude-opus-4-6
**Skills**: zoom-out (understand API shape before building) → tdd
**Complexity**: L4

## Pre-task

Run zoom-out skill first: "Understand the patient-facing API endpoints and WebSocket
events in apps/backend/src/ — list every route and WS event that the mobile app needs."
## Prompt for Claude Code
f
```
Read CLAUDE.md and CONTEXT.md. Read packages/shared/src/types/index.ts.
Run zoom-out on apps/backend/src/ to map all patient-facing endpoints before writing code.

1. Init Expo app:
   cd apps && npx create-expo-app mobile --template blank-typescript
   Install: nativewind, @tanstack/react-query, socket.io-client, expo-image-picker,
            expo-camera, expo-notifications, expo-file-system, @react-navigation/native,
            @react-navigation/bottom-tabs
2. Shared API client (packages/shared/src/api/client.ts):
   - Axios instance with baseURL from env
   - Request interceptor: attach JWT from SecureStore
   - Response interceptor: auto-refresh on 401

3. Bottom tab navigator (4 tabs):
   - Scan (camera icon) → ScanScreen
   - Results (list icon) → ResultsScreen
   - Chat (message icon) → ChatScreen
   - Profile (user icon) → ProfileScreen

4. ScanScreen:
   - Two options: "Take Photo" (expo-camera) or "Choose from Library" (expo-image-picker)
   - Camera permission request with explanation copy
   - Upload button → POST /cases → loading spinner → ResultDetailScreen
   - On result: plain-language subtype + confidence level (High/Med/Low, same as web)
   - Non-dismissable disclaimer text below result

5. ChatScreen:
   - Connect to WS /chat namespace with JWT
   - Same streaming chat as web patient portal
   - Suggested starter chips as horizontal scroll pills
   - Keyboard-aware scroll view

6. Push notifications (expo-notifications):
   - Register device token on login → POST /users/me/device-token
   - NestJS: when WS 'model:updated' fires, also trigger push if user has device token
   - Notification: "Your scan analysis is ready" (for async results)

7. Offline queue:
   - If upload fails due to no network: store image path in AsyncStorage queue
   - On network reconnect (NetInfo): retry uploads automatically
   - Show "Uploading 1 queued scan..." banner

Write tests (jest + @testing-library/react-native):
- ScanScreen renders camera and gallery buttons
- Upload triggers POST /cases with correct multipart body
- ChatScreen connects to WS and renders streamed tokens
- Offline queue stores and retries on reconnect
```

## Acceptance criteria

- [ ] App runs on iOS simulator or Android emulator
- [ ] Scan → upload → plain-language result works end to end
- [ ] Chat streams tokens in real time
- [ ] Disclaimer visible and non-dismissable on result screen
- [ ] Offline queue retries automatically on reconnect
