import { AcquisitionFrame } from "./types";

export function toSummaryPacket(frame: AcquisitionFrame, seq: number): Record<string, unknown> {
  return {
    type: "sample_summary_chunk",
    seq,
    timestamp_ms: frame.timestampMs,
    patches: frame.patches.map((patch) => ({
      patch_id: patch.patchId,
      patch_group: patch.patchGroup,
      mean_rgb: patch.meanRgb,
      weight: patch.weight ?? 1
    })),
    passive_artifacts: frame.passiveArtifacts
      ? {
          moire_score: frame.passiveArtifacts.moireScore,
          brightness_banding_score: frame.passiveArtifacts.brightnessBandingScore,
          reflectance_variation: frame.passiveArtifacts.reflectanceVariation,
          flat_contrast_score: frame.passiveArtifacts.flatContrastScore,
          global_brightness_drift: frame.passiveArtifacts.globalBrightnessDrift
        }
      : undefined
  };
}
