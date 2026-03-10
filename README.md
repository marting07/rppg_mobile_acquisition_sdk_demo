# rppg_mobile_acquisition_sdk_demo

This workspace contains:

- a lightweight Demo Client App (`app/`)
- a reusable Mobile rPPG Acquisition SDK package (`packages/mobile-rppg-acquisition-sdk/`)

## Setup

The demo app already includes native `ios/` and `android/` shells under `app/`.

Install JavaScript dependencies from the workspace root:

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

Run Metro from the app root:

```bash
cd /Users/marting/Documents/Papers/rppg_mobile_acquisition_sdk_demo/app
npx react-native start
```

Run the iOS app:

```bash
cd /Users/marting/Documents/Papers/rppg_mobile_acquisition_sdk_demo/app
npx react-native run-ios
```

Run the Android app:

```bash
cd /Users/marting/Documents/Papers/rppg_mobile_acquisition_sdk_demo/app
npx react-native run-android
```

## Architecture

The demo app focuses on:

- user interaction
- session control
- preview and result visualization
- diagnostics display

The Mobile rPPG Acquisition SDK focuses on:

- acquisition-facing interfaces for camera / ROI integrations
- camera-adapter and face-tracking module boundaries
- patch RGB signal summarization
- local quality gating
- REST control-plane communication
- WebSocket data-plane streaming
- callback/event delivery for host apps

The SDK does not perform final physiological inference; backend processing remains the single source of truth.

The demo app now includes a native preview provider based on `react-native-vision-camera` and routes acquisition through the SDK adapter boundary. When a native frame-summary hook is available, the Vision Camera adapter can deliver real patch summaries into the SDK. A synthetic adapter remains as a fallback so the transport and backend contract can still be exercised without the native summary plugin.

The SDK package now also carries a native Vision Camera frame-processor plugin (`summarizeRppgFrame`) for iOS and Android. The first implementation uses a center-upper face proxy ROI and patch-level RGB summarization so the mobile-to-backend path can operate on real camera frames before a dedicated face-tracking module is added.

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

If frame summaries are not being produced:

- the Vision Camera frame processor depends on `react-native-worklets-core`
- rebuild the native app after dependency or native plugin changes
- check whether the app is falling back to the synthetic adapter by looking at the `Capture:` label in the demo UI

If Android build tools fail:

- verify `ANDROID_HOME` or `ANDROID_SDK_ROOT` is set
- ensure an emulator is running or a device is connected before `npx react-native run-android`
- if Gradle caches are stale, rebuild from `app/android` with `./gradlew clean`
