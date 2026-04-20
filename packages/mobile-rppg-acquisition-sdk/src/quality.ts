import { AcquisitionFrame, LocalQualitySnapshot, PassiveArtifactSnapshot } from "./types";

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

export function evaluatePassiveArtifacts(frame: AcquisitionFrame): PassiveArtifactSnapshot {
  const patchBrightness = frame.patches.map((patch) => average([patch.meanRgb[0], patch.meanRgb[1], patch.meanRgb[2]]) / 255);
  const reflectanceVariation =
    frame.passiveArtifacts?.reflectanceVariation ?? standardDeviation(patchBrightness);
  const flatContrastScore =
    frame.passiveArtifacts?.flatContrastScore ?? (1 - Math.min(1, reflectanceVariation / 0.08));
  const brightnessBandingScore =
    frame.passiveArtifacts?.brightnessBandingScore ?? estimateBrightnessBanding(patchBrightness);
  const moireScore =
    frame.passiveArtifacts?.moireScore ?? estimateMoireSuspicion(frame.patches.map((patch) => patch.meanRgb));
  const globalBrightnessDrift = frame.passiveArtifacts?.globalBrightnessDrift ?? 0;

  return {
    moireScore,
    brightnessBandingScore,
    reflectanceVariation,
    flatContrastScore,
    globalBrightnessDrift
  };
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function estimateBrightnessBanding(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const quantizedDistances = values.map((value) => {
    const quantized = Math.round(value * 16) / 16;
    return Math.abs(value - quantized);
  });
  const meanDistance = average(quantizedDistances);
  return 1 - Math.min(1, meanDistance / 0.02);
}

function estimateMoireSuspicion(rgbValues: Array<[number, number, number]>): number {
  if (rgbValues.length === 0) {
    return 0;
  }
  const channelDiffs = rgbValues.map(([r, g, b]) => Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b)) / 255);
  const meanDiff = average(channelDiffs);
  return Math.min(1, meanDiff / 0.25);
}
