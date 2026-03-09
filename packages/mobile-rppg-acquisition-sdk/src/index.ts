export type SessionCreateResponse = {
  session_id: string;
  stream_url: string;
  access_token: string;
  expires_at_unix: number;
  capture_config: {
    fps: number;
    roi_width: number;
    roi_height: number;
    min_duration_seconds: number;
    max_duration_seconds: number;
    format: string;
  };
};

export type LivenessResult = {
  session_id: string;
  status: string;
  run_id?: string;
  decision?: "live" | "not_live" | "inconclusive";
  liveness_score?: number;
  confidence?: number;
  method_scores?: Record<string, number>;
  quality_summary?: Record<string, number>;
  failure_reasons?: string[];
};

export type FeedbackEvent =
  | { type: "ack"; seq: number; accepted: number }
  | { type: "quality_feedback"; frame_count: number; message: string; brightness?: number; motion?: number }
  | { type: "complete"; result: LivenessResult }
  | { type: "error"; code: string; detail?: string };

export class MobileRppgAcquisitionSdkClient {
  private baseUrl: string;
  private ws: WebSocket | null = null;
  private onFeedback: ((event: FeedbackEvent) => void) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async startSession(deviceId: string): Promise<SessionCreateResponse> {
    const res = await fetch(`${this.baseUrl}/v1/liveness/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId })
    });
    if (!res.ok) {
      throw new Error(`startSession failed with status ${res.status}`);
    }
    return (await res.json()) as SessionCreateResponse;
  }

  startStreaming(session: SessionCreateResponse, onFeedback: (event: FeedbackEvent) => void): void {
    this.onFeedback = onFeedback;
    const wsUrl = this.baseUrl.replace(/^http/, "ws") + session.stream_url;
    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as FeedbackEvent;
        this.onFeedback?.(parsed);
      } catch {
        this.onFeedback?.({ type: "error", code: "invalid_json" });
      }
    };
    this.ws.onerror = () => {
      this.onFeedback?.({ type: "error", code: "websocket_error" });
    };
  }

  sendRoiChunk(params: {
    sessionId: string;
    seq: number;
    timestampMs: number;
    imageBytesB64: string;
    imageFormat?: string;
  }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(
      JSON.stringify({
        type: "roi_frame_chunk",
        session_id: params.sessionId,
        seq: params.seq,
        timestamp_ms: params.timestampMs,
        image_format: params.imageFormat || "jpeg",
        image_bytes_b64: params.imageBytesB64
      })
    );
  }

  stopStreaming(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "end_stream" }));
    }
  }

  async getResult(sessionId: string): Promise<LivenessResult> {
    const res = await fetch(`${this.baseUrl}/v1/liveness/sessions/${sessionId}/result`);
    if (!res.ok) {
      throw new Error(`getResult failed with status ${res.status}`);
    }
    return (await res.json()) as LivenessResult;
  }
}
