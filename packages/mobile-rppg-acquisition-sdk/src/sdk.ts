import { AcquisitionController, AcquisitionModules } from "./acquisition";
import { evaluateLocalQuality, isLocallyAcceptable } from "./quality";
import { toSummaryPacket } from "./summary";
import {
  AcquisitionFrame,
  FeedbackEvent,
  LivenessResult,
  PreviewAttachment,
  SdkEvent,
  SdkEventHandler,
  SessionCreateResponse,
  SessionOptions
} from "./types";
import { BackendTransport } from "./transport";

export class MobileRppgAcquisitionSdk {
  private readonly transport: BackendTransport;
  private acquisition: AcquisitionController | null = null;
  private session: SessionCreateResponse | null = null;
  private preview: PreviewAttachment | null = null;
  private seq = 0;
  private acceptedPackets = 0;
  private eventHandler: SdkEventHandler | null = null;

  constructor(baseUrl: string) {
    this.transport = new BackendTransport(baseUrl);
  }

  initialize(eventHandler?: SdkEventHandler): void {
    this.eventHandler = eventHandler ?? null;
    this.emit({ type: "status", status: "initialized" });
  }

  attachPreview(preview: PreviewAttachment): void {
    this.preview = preview;
    this.preview.attach();
    this.acquisition?.attachPreview(preview);
  }

  configureAcquisition(modules: AcquisitionModules): void {
    this.acquisition = new AcquisitionController(modules);
    if (this.preview) {
      this.acquisition.attachPreview(this.preview);
    }
  }

  async createSession(options: SessionOptions): Promise<SessionCreateResponse> {
    this.session = await this.transport.createSession(options);
    this.seq = 0;
    this.acceptedPackets = 0;
    this.emit({ type: "status", status: "session_created" });
    return this.session;
  }

  async startStreaming(onBackendEvent?: (event: FeedbackEvent) => void): Promise<void> {
    if (!this.session) {
      throw new Error("Session has not been created");
    }
    await this.transport.connect(this.session, (event) => {
      if (event.type === "ack" && event.accepted) {
        this.acceptedPackets += 1;
        this.emit({ type: "buffering", acceptedPackets: this.acceptedPackets });
      }
      if (event.type === "complete") {
        this.acquisition?.stop();
        this.emit({ type: "session_summary", result: event.result });
        this.emit({ type: "status", status: "stopped" });
      }
      if (event.type === "error" && (event.code === "websocket_closed" || event.code === "websocket_error")) {
        this.acquisition?.stop();
        this.emit({ type: "warning", message: event.code });
        this.emit({ type: "status", status: "stopped" });
      }
      this.emit({ type: "backend_event", event });
      onBackendEvent?.(event);
    });
    this.emit({ type: "status", status: "streaming" });
  }

  startAcquisition(): void {
    if (!this.acquisition) {
      throw new Error("Acquisition has not been configured");
    }
    this.acquisition.start((frame) => this.ingestFrame(frame));
  }

  ingestFrame(frame: AcquisitionFrame): void {
    const quality = evaluateLocalQuality(frame);
    this.emit({ type: "quality_changed", quality });
    if (!isLocallyAcceptable(quality)) {
      this.emit({ type: "warning", message: "local_quality_gate_failed" });
      return;
    }
    const packet = toSummaryPacket(frame, this.seq);
    Object.assign(packet, {
      local_quality: {
        face_present: quality.facePresent,
        brightness: quality.brightness,
        motion_score: quality.motionScore,
        roi_coverage: quality.roiCoverage
      }
    });
    this.transport.sendPacket(packet);
    this.seq += 1;
  }

  async stopStreaming(): Promise<LivenessResult | null> {
    if (!this.session) {
      return null;
    }
    this.acquisition?.stop();
    const result = await this.transport.stop(this.session.session_id);
    this.emit({ type: "status", status: "stopped" });
    this.emit({ type: "session_summary", result });
    return result;
  }

  async fetchResult(): Promise<LivenessResult | null> {
    if (!this.session) {
      return null;
    }
    return this.transport.getResult(this.session.session_id);
  }

  dispose(): void {
    this.acquisition?.stop();
    this.preview?.detach();
    this.preview = null;
    this.emit({ type: "status", status: "disposed" });
  }

  private emit(event: SdkEvent): void {
    this.eventHandler?.(event);
  }
}
