import React, { useMemo, useRef, useState } from "react";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RoiGuidance } from "./components/RoiGuidance";
import { SyntheticCameraAdapter } from "./adapters/SyntheticCameraAdapter";
import {
  FeedbackEvent,
  MobileRppgAcquisitionSdk,
  PreviewAttachment,
  SdkEvent,
  VisionCameraAdapter,
  VisionCameraCaptureView
} from "mobile-rppg-acquisition-sdk";

export default function App(): JSX.Element {
  const sdk = useMemo(() => new MobileRppgAcquisitionSdk("http://127.0.0.1:8008"), []);
  const cameraAdapterRef = useRef<SyntheticCameraAdapter>(new SyntheticCameraAdapter());
  const visionCameraAdapterRef = useRef<VisionCameraAdapter>(new VisionCameraAdapter());
  const nativeSummaryPluginAvailable = typeof global.__rppgSummarizeFrame === "function";
  const [status, setStatus] = useState<string>("idle");
  const [feedback, setFeedback] = useState<string>("Ready");
  const [decision, setDecision] = useState<string>("-");
  const [method, setMethod] = useState<string>("-");
  const [bpm, setBpm] = useState<string>("-");

  const onSdkEvent = (event: SdkEvent) => {
    if (event.type === "status") {
      setStatus(event.status);
    } else if (event.type === "quality_changed") {
      setFeedback(`quality b=${event.quality.brightness.toFixed(2)} m=${event.quality.motionScore.toFixed(2)}`);
    } else if (event.type === "warning") {
      setFeedback(event.message);
    } else if (event.type === "session_summary") {
      setDecision(event.result.decision || "unknown");
      setMethod(event.result.selected_method || "-");
    }
  };

  const onBackendEvent = (event: FeedbackEvent) => {
    if (event.type === "quality_feedback") {
      setFeedback(event.message);
    } else if (event.type === "provisional_result" || event.type === "stable_result") {
      setBpm(event.bpm.toFixed(1));
      setMethod(event.selected_method);
      setFeedback(event.type === "stable_result" ? "stable" : "buffering");
    } else if (event.type === "complete") {
      setDecision(event.result.decision || "unknown");
      setMethod(event.result.selected_method || "-");
      setStatus("stopped");
    } else if (event.type === "error") {
      setFeedback(`error:${event.code}`);
    }
  };

  const startFlow = async () => {
    sdk.initialize(onSdkEvent);
    const previewAttachment: PreviewAttachment = {
      attach: () => undefined,
      detach: () => undefined
    };
    sdk.attachPreview(previewAttachment);
    sdk.configureAcquisition({ camera: nativeSummaryPluginAvailable ? visionCameraAdapterRef.current : cameraAdapterRef.current });
    const session = await sdk.createSession({ deviceId: "demo-device", appVersion: "0.1.0", preferredMethod: "pos" });
    sdk.startStreaming(onBackendEvent);
    sdk.startAcquisition();

    setTimeout(async () => {
      await sdk.stopStreaming();
    }, session.capture_config.max_duration_seconds * 1000);
  };

  const refreshResult = async () => {
    const result = await sdk.fetchResult();
    if (!result) return;
    setDecision(result.decision || "pending");
    setMethod(result.selected_method || "-");
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.cameraStub}>
        <VisionCameraCaptureView
          adapter={visionCameraAdapterRef.current}
          isActive={status === "streaming" || status === "session_created"}
          style={styles.cameraFill}
        />
        <RoiGuidance />
      </View>
      <View style={styles.panel}>
        <Text style={styles.label}>Status: {status}</Text>
        <Text style={styles.label}>Feedback: {feedback}</Text>
        <Text style={styles.label}>Decision: {decision}</Text>
        <Text style={styles.label}>Method: {method}</Text>
        <Text style={styles.label}>BPM: {bpm}</Text>
        <Text style={styles.label}>Capture: {nativeSummaryPluginAvailable ? "vision-camera" : "synthetic fallback (no native summary plugin)"}</Text>

        <TouchableOpacity style={styles.button} onPress={startFlow}>
          <Text style={styles.buttonText}>Start Liveness Session</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={refreshResult}>
          <Text style={styles.buttonText}>Fetch Result</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#101419" },
  cameraStub: { flex: 3, margin: 12, borderRadius: 12, backgroundColor: "#1d2730", overflow: "hidden" },
  cameraFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  panel: { flex: 2, paddingHorizontal: 16, paddingBottom: 20, gap: 10 },
  label: { color: "#e6edf3", fontSize: 15 },
  button: { backgroundColor: "#0ea5e9", borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14 },
  buttonText: { color: "white", fontWeight: "700", textAlign: "center" }
});
