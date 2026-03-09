import React, { useMemo, useRef, useState } from "react";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RoiGuidance } from "./components/RoiGuidance";
import { MobileRppgAcquisitionSdkClient, SessionCreateResponse, FeedbackEvent } from "mobile-rppg-acquisition-sdk";

export default function App(): JSX.Element {
  const client = useMemo(() => new MobileRppgAcquisitionSdkClient("http://127.0.0.1:8008"), []);
  const sessionRef = useRef<SessionCreateResponse | null>(null);
  const seqRef = useRef<number>(0);
  const [status, setStatus] = useState<string>("idle");
  const [feedback, setFeedback] = useState<string>("Ready");
  const [decision, setDecision] = useState<string>("-");

  const onFeedback = (event: FeedbackEvent) => {
    if (event.type === "quality_feedback") {
      setFeedback(event.message);
    } else if (event.type === "complete") {
      setDecision(event.result.decision || "unknown");
      setStatus("complete");
    } else if (event.type === "error") {
      setFeedback(`error:${event.code}`);
    }
  };

  const startFlow = async () => {
    setStatus("starting");
    const session = await client.startSession("demo-device");
    sessionRef.current = session;
    client.startStreaming(session, onFeedback);
    setStatus("streaming");

    // Demo stub: replace with camera ROI callback from react-cam-roi integration.
    const intervalMs = Math.round(1000 / session.capture_config.fps);
    const timer = setInterval(() => {
      if (!sessionRef.current) {
        clearInterval(timer);
        return;
      }
      seqRef.current += 1;
      const fakeChunk = "";
      if (fakeChunk) {
        client.sendRoiChunk({
          sessionId: session.session_id,
          seq: seqRef.current,
          timestampMs: Date.now(),
          imageBytesB64: fakeChunk,
          imageFormat: session.capture_config.format
        });
      }
    }, intervalMs);

    setTimeout(() => {
      clearInterval(timer);
      client.stopStreaming();
    }, session.capture_config.max_duration_seconds * 1000);
  };

  const refreshResult = async () => {
    const s = sessionRef.current;
    if (!s) return;
    const result = await client.getResult(s.session_id);
    setDecision(result.decision || "pending");
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.cameraStub}>
        <RoiGuidance />
      </View>
      <View style={styles.panel}>
        <Text style={styles.label}>Status: {status}</Text>
        <Text style={styles.label}>Feedback: {feedback}</Text>
        <Text style={styles.label}>Decision: {decision}</Text>

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
  panel: { flex: 2, paddingHorizontal: 16, paddingBottom: 20, gap: 10 },
  label: { color: "#e6edf3", fontSize: 15 },
  button: { backgroundColor: "#0ea5e9", borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14 },
  buttonText: { color: "white", fontWeight: "700", textAlign: "center" }
});
