import { FeedbackEvent, LivenessResult, SessionCreateResponse, SessionOptions } from "./types";

export class BackendTransport {
  private baseUrl: string;
  private ws: WebSocket | null = null;
  private onFeedback: ((event: FeedbackEvent) => void) | null = null;
  private pendingComplete: {
    promise: Promise<LivenessResult>;
    resolve: (result: LivenessResult) => void;
    reject: (error: Error) => void;
  } | null = null;

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

  connect(session: SessionCreateResponse, onFeedback: (event: FeedbackEvent) => void): Promise<void> {
    this.onFeedback = onFeedback;
    const wsUrl = this.baseUrl.replace(/^http/, "ws") + session.stream_url;
    this.ws = new WebSocket(wsUrl);
    this.pendingComplete = this.createPendingComplete();

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      this.ws!.onopen = () => {
        succeed();
      };
      this.ws!.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as FeedbackEvent;
          if (parsed.type === "complete" && this.pendingComplete) {
            this.pendingComplete.resolve(parsed.result);
          } else if (parsed.type === "error" && parsed.code === "internal_error" && this.pendingComplete) {
            this.pendingComplete.reject(new Error(parsed.detail || parsed.code));
          }
          this.onFeedback?.(parsed);
        } catch {
          this.onFeedback?.({ type: "error", code: "invalid_json" });
        }
      };
      this.ws!.onerror = () => {
        const error = new Error("websocket_error");
        this.onFeedback?.({ type: "error", code: "websocket_error" });
        if (!settled) {
          fail(error);
        }
      };
      this.ws!.onclose = () => {
        if (!settled) {
          fail(new Error("websocket_closed_before_open"));
        }
      };
    });
  }

  sendPacket(packet: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(packet));
  }

  async stop(sessionId: string, timeoutMs = 5000): Promise<LivenessResult> {
    const pendingComplete = this.pendingComplete ?? this.createPendingComplete();
    this.pendingComplete = pendingComplete;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "end_stream" }));
      try {
        return await this.awaitWithTimeout(pendingComplete.promise, timeoutMs, "stream_complete_timeout");
      } catch {
        return this.stopSession(sessionId);
      }
    }
    return this.stopSession(sessionId);
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

  private createPendingComplete(): {
    promise: Promise<LivenessResult>;
    resolve: (result: LivenessResult) => void;
    reject: (error: Error) => void;
  } {
    let resolve!: (result: LivenessResult) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<LivenessResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  private async awaitWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}
