import React, { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RoiGuidance } from "./components/RoiGuidance";
import { SyntheticCameraAdapter } from "./adapters/SyntheticCameraAdapter";
import { BACKEND_BASE_URL } from "./config";
import {
  FeedbackEvent,
  MobileRppgAcquisitionSdk,
  PreviewAttachment,
  SdkEvent,
  VisionCameraAdapter,
  VisionCameraCaptureView
} from "mobile-rppg-acquisition-sdk";

export default function App(): JSX.Element {
  const availableMethods = ["chrom", "pos", "ica"] as const;
  const sdk = useMemo(() => new MobileRppgAcquisitionSdk(BACKEND_BASE_URL), []);
  const cameraAdapterRef = useRef<SyntheticCameraAdapter>(new SyntheticCameraAdapter());
  const visionCameraAdapterRef = useRef<VisionCameraAdapter>(new VisionCameraAdapter());
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nativeSummaryPluginAvailable, setNativeSummaryPluginAvailable] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("idle");
  const [feedback, setFeedback] = useState<string>("Ready");
  const [decision, setDecision] = useState<string>("-");
  const [backendMethod, setBackendMethod] = useState<string>("-");
  const [bpm, setBpm] = useState<string>("-");
  const [selectedMethod, setSelectedMethod] = useState<(typeof availableMethods)[number]>("chrom");
  const [resultDetails, setResultDetails] = useState<string>("-");
  const isSessionActive = status === "streaming" || status === "session_created";

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      sdk.dispose();
    };
  }, [sdk]);

  const onSdkEvent = (event: SdkEvent) => {
    if (event.type === "status") {
      setStatus(event.status);
    } else if (event.type === "quality_changed") {
      setFeedback(
        `quality b=${event.quality.brightness.toFixed(2)} m=${event.quality.motionScore.toFixed(2)} c=${event.quality.roiCoverage.toFixed(2)}`
      );
    } else if (event.type === "warning") {
      setFeedback(event.message);
    } else if (event.type === "session_summary") {
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      setDecision(event.result.decision || "unknown");
      setBackendMethod(event.result.selected_method || "-");
      setResultDetails(formatResultDetails(event.result));
    }
  };

  const onBackendEvent = (event: FeedbackEvent) => {
    if (event.type === "quality_feedback") {
      setFeedback(event.message);
    } else if (event.type === "provisional_result" || event.type === "stable_result") {
      const highlighted = event.method_state[selectedMethod];
      setBpm((highlighted?.bpm ?? event.bpm).toFixed(1));
      setBackendMethod(event.selected_method);
      setFeedback(event.type === "stable_result" ? "stable" : "buffering");
    } else if (event.type === "complete") {
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      setDecision(event.result.decision || "unknown");
      setBackendMethod(event.result.selected_method || "-");
      setResultDetails(formatResultDetails(event.result));
      setStatus("stopped");
    } else if (event.type === "error") {
      setFeedback(`error:${event.code}`);
    }
  };

  const startFlow = async () => {
    try {
      if (isSessionActive) {
        return;
      }
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      setDecision("-");
      setBackendMethod("-");
      setBpm("-");
      setResultDetails("-");
      setFeedback("starting");
      sdk.initialize(onSdkEvent);
      const previewAttachment: PreviewAttachment = {
        attach: () => undefined,
        detach: () => undefined
      };
      sdk.attachPreview(previewAttachment);
      sdk.configureAcquisition({ camera: nativeSummaryPluginAvailable ? visionCameraAdapterRef.current : cameraAdapterRef.current });
      await sdk.createSession({ deviceId: "demo-device", appVersion: "0.1.0", preferredMethod: selectedMethod });
      await sdk.startStreaming(onBackendEvent);
      sdk.startAcquisition();
      setFeedback("streaming");
    } catch (error) {
      const message = error instanceof Error ? error.message : "session_start_failed";
      setFeedback(`start_error:${message}`);
      setStatus("stopped");
    }
  };

  const stopFlow = async () => {
    try {
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      const result = await sdk.stopStreaming();
      if (!result) {
        setStatus("stopped");
        return;
      }
      setDecision(result.decision || "unknown");
      setBackendMethod(result.selected_method || "-");
      setFeedback("stopped");
      setResultDetails(formatResultDetails(result));
      setStatus("stopped");
    } catch (error) {
      const message = error instanceof Error ? error.message : "stop_failed";
      setFeedback(`stop_error:${message}`);
      setStatus("stopped");
    }
  };

  const refreshResult = async () => {
    try {
      const result = await sdk.fetchResult();
      if (!result) {
        setFeedback("result_unavailable");
        return;
      }
      setStatus(result.status || status);
      setDecision(result.decision || "pending");
      setBackendMethod(result.selected_method || "-");
      setResultDetails(formatResultDetails(result));
      if (typeof result.confidence === "number") {
        setFeedback(`result:${result.status}${result.decision ? `:${result.decision}` : ""}`);
      } else {
        setFeedback(`result:${result.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "fetch_result_failed";
      setFeedback(`result_error:${message}`);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.cameraStub}>
        <VisionCameraCaptureView
          adapter={visionCameraAdapterRef.current}
          isActive={status === "streaming" || status === "session_created"}
          onPluginAvailabilityChange={setNativeSummaryPluginAvailable}
          style={styles.cameraFill}
        />
        <RoiGuidance />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.panel}>
          <Text style={styles.label}>Status: {status}</Text>
          <Text style={styles.label}>Feedback: {feedback}</Text>
          <Text style={styles.label}>Decision: {decision}</Text>
          <Text style={styles.label}>Decision Mode: multi-method</Text>
          <Text style={styles.label}>Selected Method: {selectedMethod}</Text>
          <Text style={styles.label}>Backend Selected Method: {backendMethod}</Text>
          <Text style={styles.label}>BPM: {bpm}</Text>
          <Text style={styles.label}>Backend: {BACKEND_BASE_URL}</Text>
          <Text style={styles.label}>Capture: {nativeSummaryPluginAvailable ? "vision-camera" : "synthetic fallback (no native summary plugin)"}</Text>
          <Text style={styles.label}>Result Details: {resultDetails}</Text>

          <View style={styles.methodSelector}>
            {availableMethods.map((candidate) => {
              const active = candidate === selectedMethod;
              return (
                <TouchableOpacity
                  key={candidate}
                  disabled={isSessionActive}
                  onPress={() => setSelectedMethod(candidate)}
                  style={[styles.methodChip, active ? styles.methodChipActive : null, isSessionActive ? styles.methodChipDisabled : null]}
                >
                  <Text style={styles.methodChipText}>{candidate.toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={[styles.button, isSessionActive ? styles.stopButton : null]} onPress={isSessionActive ? stopFlow : startFlow}>
            <Text style={styles.buttonText}>{isSessionActive ? "Stop Liveness Session" : "Start Liveness Session"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={refreshResult}>
            <Text style={styles.buttonText}>Fetch Result</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#101419" },
  scrollContent: { paddingBottom: 24, flexGrow: 1 },
  cameraStub: {
    height: 320,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: "#1d2730",
    overflow: "hidden"
  },
  cameraFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  panel: { paddingHorizontal: 16, paddingBottom: 20, gap: 10 },
  label: { color: "#e6edf3", fontSize: 15 },
  button: { backgroundColor: "#0ea5e9", borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14 },
  stopButton: { backgroundColor: "#ef4444" },
  buttonText: { color: "white", fontWeight: "700", textAlign: "center" },
  methodSelector: { flexDirection: "row", gap: 8 },
  methodChip: { backgroundColor: "#1f2937", borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  methodChipActive: { backgroundColor: "#22c55e" },
  methodChipDisabled: { opacity: 0.6 },
  methodChipText: { color: "#f8fafc", fontWeight: "700" }
});

function formatResultDetails(result: {
  liveness_score?: number;
  confidence?: number;
  failure_reasons?: string[];
  operational_metrics?: Record<string, number | null>;
}): string {
  const score = typeof result.liveness_score === "number" ? result.liveness_score.toFixed(2) : "-";
  const confidence = typeof result.confidence === "number" ? result.confidence.toFixed(2) : "-";
  const firstStable = result.operational_metrics?.time_to_stable_estimate_ms;
  const stableMs = typeof firstStable === "number" ? String(Math.round(firstStable)) : "-";
  const reasons =
    Array.isArray(result.failure_reasons) && result.failure_reasons.length > 0
      ? result.failure_reasons.join("|")
      : "-";
  return `score=${score} conf=${confidence} stable_ms=${stableMs} reasons=${reasons}`;
}
