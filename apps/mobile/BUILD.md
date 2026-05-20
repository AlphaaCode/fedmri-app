# How to build the APK

The first EAS build failed because of two issues — both are now fixed.
**Before you retry:**

## What was broken

| Issue | Cause | Fix |
|---|---|---|
| **1.9 GB upload** | EAS uploaded the whole monorepo (`apps/web`, backend, etc.) | `.easignore` now excludes them |
| **Gradle failure** | New architecture + duplicate React + SDK 54/55 mismatch | Disabled `newArchEnabled`, aligned packages to SDK 55, added Metro monorepo config |
| **expo-doctor warnings** | Hoisted root `node_modules` competing with local one | `metro.config.js` watches both, disables hierarchical lookup |

## Retry the build

```bash
cd apps/mobile

# (Optional) sanity check
npx expo export --platform android --output-dir /tmp/expo-test
# Should finish with: "android bundles (1): … (~2.3MB)"

# Then build
eas build --platform android --profile preview
```

Expected: upload should now be **~50-80 MB** instead of 1.9 GB. Build should complete in ~10-15 minutes.

## If gradle still fails

Get the build URL from EAS output, then open the **"Run gradlew"** log section. Common Gradle errors and fixes:

- `Could not resolve com.facebook.react:react-android:0.83.6` → run `npx expo install --fix` again
- `Duplicate class found in modules` → there are still duplicate native deps, check `npx expo-doctor`
- `OutOfMemoryError` → unlikely on EAS, but in `eas.json` set `"large"` image: `"android": { "buildType": "apk", "image": "latest", "resourceClass": "large" }`

## Local build (no EAS, no upload)

If you have Android Studio + JDK 17 installed locally:

```bash
cd apps/mobile
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease
# APK appears in: android/app/build/outputs/apk/release/app-release.apk
```

This is **free**, doesn't require EAS, but needs ~10 GB of Android SDK installed.
