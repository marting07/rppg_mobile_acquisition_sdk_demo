# rppg_mobile_acquisition_sdk_demo

This workspace contains:

- a lightweight Demo Client App in `app/`
- a reusable Mobile rPPG Acquisition SDK in `packages/mobile-rppg-acquisition-sdk/`

This is the client side of the canonical modular architecture used in the paper:

- the demo app owns UI, session control, preview, and result visualization
- the SDK owns acquisition-facing integration points, local prechecks, packet building, and backend transport
- final physiological inference remains backend-centered

## Setup

The demo app already includes native `ios/` and `android/` shells under `app/`.

Install workspace dependencies:

```bash
cd /Users/marting/Documents/Papers/rppg_mobile_acquisition_sdk_demo
npm install
```

Install iOS pods:

```bash
cd /Users/marting/Documents/Papers/rppg_mobile_acquisition_sdk_demo/app/ios
pod install
```

## Run

Start Metro:

```bash
cd /Users/marting/Documents/Papers/rppg_mobile_acquisition_sdk_demo/app
npx react-native start
```

Run on iOS:

```bash
cd /Users/marting/Documents/Papers/rppg_mobile_acquisition_sdk_demo/app
npx react-native run-ios
```

Run on Android:

```bash
cd /Users/marting/Documents/Papers/rppg_mobile_acquisition_sdk_demo/app
npx react-native run-android
```

## Backend URL

The demo app backend target is centralized in:

- `app/src/config.ts`

Current defaults:

- iOS simulator: `http://127.0.0.1:8001`
- Android emulator: `http://10.0.2.2:8001`

For a physical device, set `PHYSICAL_DEVICE_HOST` in `app/src/config.ts` to your Mac's LAN IP, for example:

```ts
const PHYSICAL_DEVICE_HOST = "192.168.1.20";
```

The active backend URL is also shown in the demo UI under `Backend:`.

For iOS physical-device development, the demo shell currently allows insecure HTTP loads so it can connect to a LAN backend such as `http://192.168.x.x:8001`. This is a development/demo setting for the app shell, not a production transport recommendation.

## Architecture

### Demo Client App

- user interaction
- session start/stop
- preview and result visualization
- diagnostics display

### Mobile rPPG Acquisition SDK

- camera-provider integration points
- face/ROI integration boundary
- patch RGB signal summarization
- local quality gating
- packet serialization
- REST control-plane communication
- WebSocket data-plane streaming
- callback/event delivery to host apps

The SDK does not perform authoritative BPM inference or final live-decision logic. The backend remains the single source of truth for physiological analysis.

## Native Capture Path

The demo app uses `react-native-vision-camera` for preview and native frame access.

The SDK package includes a native Vision Camera frame-processor plugin, `summarizeRppgFrame`, for iOS and Android. The current implementation supports face-driven ROI extraction and patch-level RGB summarization for mobile-to-backend streaming.

A synthetic adapter remains available as a fallback so transport and backend integration can still be exercised when the native frame-summary path is unavailable.

## Validation Status

Current verification in this workspace includes:

- iOS native shell build
- Android native shell build
- SDK/demo app integration against the current backend contract

What is still worth doing for stronger deployment validation:

- run real end-to-end sessions on a physical device
- collect additional device-side traces under motion and illumination variation

## Troubleshooting

If `npm install` fails from the workspace root:

- make sure you are running it from `/Users/marting/Documents/Papers/rppg_mobile_acquisition_sdk_demo`
- confirm the workspace packages are visible with `npm workspaces list`

If iOS pods fail to install:

- make sure CocoaPods is installed: `pod --version`
- retry from `/Users/marting/Documents/Papers/rppg_mobile_acquisition_sdk_demo/app/ios`
- if needed, run `pod repo update` and then `pod install`

If the iOS build fails on Vision Camera or frame processors:

- verify `react-native-vision-camera` and `react-native-worklets-core` are installed in the app workspace
- confirm the SDK podspec in `packages/mobile-rppg-acquisition-sdk/mobile-rppg-acquisition-sdk.podspec` is being picked up by autolinking
- clean derived data and rebuild if Xcode is holding stale native artifacts

If the app opens but camera preview does not appear:

- confirm camera permissions are granted on the device or simulator
- note that iOS simulators generally do not provide a useful real front-camera path for this workflow; prefer a physical device
- on Android, verify camera permission was accepted and that the selected device has a front-facing camera

If a physical iPhone shows `Network request failed` when calling the backend:

- confirm the backend is running on your Mac with `--host 0.0.0.0`
- confirm the phone and Mac are on the same Wi-Fi network
- confirm `PHYSICAL_DEVICE_HOST` in `app/src/config.ts` matches your Mac LAN IP
- confirm macOS firewall is not blocking inbound connections to the backend process
- rebuild the iOS app after any `Info.plist` transport-permission change

If frame summaries are not being produced:

- the Vision Camera frame processor depends on `react-native-worklets-core`
- rebuild the native app after dependency or native plugin changes
- check whether the app is falling back to the synthetic adapter by looking at the `Capture:` label in the demo UI

If Android build tools fail:

- verify `ANDROID_HOME` or `ANDROID_SDK_ROOT` is set
- ensure an emulator is running or a device is connected before `npx react-native run-android`
- if Gradle caches are stale, rebuild from `app/android` with `./gradlew clean`
