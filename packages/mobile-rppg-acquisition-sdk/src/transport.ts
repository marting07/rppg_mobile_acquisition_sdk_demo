import { FeedbackEvent, LivenessResult, SessionCreateResponse, SessionOptions } from "./types";

export class BackendTransport {
  private baseUrl: string;
  private ws: WebSocket | null = null;
  private onFeedback: ((event: FeedbackEvent) => void) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async createSession(options: SessionOptions): Promise<SessionCreateResponse> {
    const res = await fetch(`${this.baseUrl}/v1/liveness/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: options.deviceId,
        app_version: options.appVersion,
        preferred_method: options.preferredMethod
      })
    });
    if (!res.ok) {
      throw new Error(`createSession failed with status ${res.status}`);
    }
    return (await res.json()) as SessionCreateResponse;
  }

  connect(session: SessionCreateResponse, onFeedback: (event: FeedbackEvent) => void): void {
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

  sendPacket(packet: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(packet));
  }

  stop(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "end_stream" }));
    }
  }

  async stopSession(sessionId: string): Promise<LivenessResult> {
    const res = await fetch(`${this.baseUrl}/v1/liveness/sessions/${sessionId}/stop`, { method: "POST" });
    if (!res.ok) {
      throw new Error(`stopSession failed with status ${res.status}`);
    }
    return (await res.json()) as LivenessResult;
  }

  async getResult(sessionId: string): Promise<LivenessResult> {
    const res = await fetch(`${this.baseUrl}/v1/liveness/sessions/${sessionId}/result`);
    if (!res.ok) {
      throw new Error(`getResult failed with status ${res.status}`);
    }
    return (await res.json()) as LivenessResult;
  }
}
