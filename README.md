# rppg_mobile_acquisition_sdk_demo

This workspace contains:

- a lightweight Demo Client App (`app/`)
- a reusable Mobile rPPG Acquisition SDK package (`packages/mobile-rppg-acquisition-sdk/`)

## Design Intent

The demo app focuses on:

- user interaction
- session control
- preview and result visualization
- diagnostics display

The Mobile rPPG Acquisition SDK focuses on:

- camera-connected ROI sample acquisition integration points
- REST control-plane communication
- WebSocket data-plane streaming
- callback/event delivery for host apps

The SDK does not perform final physiological inference; backend processing remains the single source of truth.
