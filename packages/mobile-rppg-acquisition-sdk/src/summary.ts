import { AcquisitionFrame } from "./types";

export function toSummaryPacket(frame: AcquisitionFrame, seq: number): Record<string, unknown> {
  return {
    type: "sample_summary_chunk",
    seq,
    timestamp_ms: frame.timestampMs,
    patches: frame.patches.map((patch) => ({
      patch_id: patch.patchId,
      mean_rgb: patch.meanRgb,
      weight: patch.weight ?? 1
    }))
  };
}
