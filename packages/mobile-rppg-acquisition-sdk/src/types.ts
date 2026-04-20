export type CaptureConfig = {
  fps: number;
  patch_rows: number;
  patch_cols: number;
  min_duration_seconds: number;
  max_duration_seconds: number;
  transport_format: string;
};

export type SessionCreateResponse = {
  session_id: string;
  stream_url: string;
  access_token: string;
  expires_at_unix: number;
  capture_config: CaptureConfig;
};

export type LivenessResult = {
  session_id: string;
  status: string;
  run_id?: string;
  decision?: "live" | "not_live" | "inconclusive";
  liveness_score?: number;
  confidence?: number;
  selected_method?: string;
  corroboration_method?: string | null;
  coherence_summary?: Record<string, unknown>;
  replay_summary?: Record<string, unknown>;
  method_scores?: Record<string, number>;
  quality_summary?: Record<string, number>;
  operational_metrics?: Record<string, number | null>;
  method_summary?: Record<string, Record<string, number>>;
  failure_reasons?: string[];
};

export type FeedbackEvent =
  | { type: "ack"; seq: number; accepted: number; timestamp_ms: number }
  | { type: "quality_feedback"; seq: number; message: string; brightness?: number; motion_score?: number; roi_coverage?: number }
  | { type: "provisional_result"; bpm: number; confidence: number; selected_method: string; corroboration_method?: string | null; timestamp_ms: number; method_state: Record<string, { bpm: number; confidence: number }> }
  | { type: "stable_result"; bpm: number; confidence: number; selected_method: string; corroboration_method?: string | null; timestamp_ms: number; method_state: Record<string, { bpm: number; confidence: number }> }
  | { type: "complete"; result: LivenessResult }
  | { type: "error"; code: string; detail?: string };

export type PatchObservation = {
  patchId: string;
  patchGroup?: string;
  meanRgb: [number, number, number];
  weight?: number;
};

export type LocalQualitySnapshot = {
  facePresent: boolean;
  brightness: number;
  motionScore: number;
  roiCoverage: number;
};

export type PassiveArtifactSnapshot = {
  moireScore: number;
  brightnessBandingScore: number;
  reflectanceVariation: number;
  flatContrastScore: number;
  globalBrightnessDrift: number;
};

export type AcquisitionFrame = {
  timestampMs: number;
  patches: PatchObservation[];
  localQuality?: Partial<LocalQualitySnapshot>;
  passiveArtifacts?: Partial<PassiveArtifactSnapshot>;
};

export type SessionOptions = {
  deviceId: string;
  appVersion?: string;
  preferredMethod?: string;
};

export type SdkEvent =
  | { type: "status"; status: "idle" | "initialized" | "session_created" | "streaming" | "stopped" | "disposed" }
  | { type: "quality_changed"; quality: LocalQualitySnapshot }
  | { type: "buffering"; acceptedPackets: number }
  | { type: "warning"; message: string }
  | { type: "backend_event"; event: FeedbackEvent }
  | { type: "session_summary"; result: LivenessResult };

export type SdkEventHandler = (event: SdkEvent) => void;

export type PreviewAttachment = {
  attach: () => void;
  detach: () => void;
};
