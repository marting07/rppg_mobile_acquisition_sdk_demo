import { AcquisitionFrame, LocalQualitySnapshot } from "./types";

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function evaluateLocalQuality(frame: AcquisitionFrame): LocalQualitySnapshot {
  const patchBrightness = frame.patches.map((patch) => average([patch.meanRgb[0], patch.meanRgb[1], patch.meanRgb[2]]) / 255);
  const brightness = frame.localQuality?.brightness ?? average(patchBrightness);
  const motionScore = frame.localQuality?.motionScore ?? 0;
  const roiCoverage = frame.localQuality?.roiCoverage ?? (frame.patches.length > 0 ? 1 : 0);
  const facePresent = frame.localQuality?.facePresent ?? frame.patches.length > 0;
  return {
    facePresent,
    brightness,
    motionScore,
    roiCoverage
  };
}

export function isLocallyAcceptable(quality: LocalQualitySnapshot): boolean {
  return quality.facePresent && quality.brightness >= 0.12 && quality.brightness <= 0.95 && quality.motionScore <= 0.2 && quality.roiCoverage >= 0.6;
}
