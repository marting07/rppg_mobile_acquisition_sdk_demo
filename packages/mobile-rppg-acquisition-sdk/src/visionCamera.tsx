import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor, VisionCameraProxy } from "react-native-vision-camera";
import type { CameraProps, Frame, FrameProcessorPlugin } from "react-native-vision-camera";
import { Worklets } from "react-native-worklets-core";
import { CameraAdapter } from "./acquisition";
import { AcquisitionFrame, PreviewAttachment } from "./types";

type NativePatchSummary = {
  patchId: string;
  patchGroup?: string;
  meanRgb: [number, number, number];
  weight?: number;
};

type NativeSummaryResult = {
  timestampMs?: number;
  patches: NativePatchSummary[];
  localQuality?: {
    facePresent?: boolean;
    brightness?: number;
    motionScore?: number;
    roiCoverage?: number;
  };
};

export class VisionCameraAdapter implements CameraAdapter {
  private listener: ((frame: AcquisitionFrame) => void) | null = null;
  private running = false;
  private captureStartWallClockMs: number | null = null;
  private firstNativeTimestampMs: number | null = null;

  attachPreview(_: PreviewAttachment): void {
    // Preview is handled by the React component below.
  }

  start(listener: (frame: AcquisitionFrame) => void): void {
    this.listener = listener;
    this.running = true;
    this.captureStartWallClockMs = Date.now();
    this.firstNativeTimestampMs = null;
  }

  stop(): void {
    this.running = false;
    this.listener = null;
    this.captureStartWallClockMs = null;
    this.firstNativeTimestampMs = null;
  }

  ingestNativeSummary(summary: NativeSummaryResult): void {
    if (!this.running || !this.listener || !summary.patches.length) {
      return;
    }
    const normalizedTimestampMs = this.normalizeTimestamp(summary.timestampMs);
    this.listener({
      timestampMs: normalizedTimestampMs,
      patches: summary.patches.map((patch) => ({
        patchId: patch.patchId,
        patchGroup: patch.patchGroup ?? canonicalPatchGroup(patch.patchId),
        meanRgb: patch.meanRgb,
        weight: patch.weight ?? 1
      })),
      localQuality: {
        facePresent: summary.localQuality?.facePresent ?? true,
        brightness: summary.localQuality?.brightness,
        motionScore: summary.localQuality?.motionScore,
        roiCoverage: summary.localQuality?.roiCoverage
      }
    });
  }

  private normalizeTimestamp(nativeTimestampMs?: number): number {
    const wallClockStart = this.captureStartWallClockMs ?? Date.now();
    if (nativeTimestampMs == null || !Number.isFinite(nativeTimestampMs)) {
      return Date.now();
    }

    if (this.firstNativeTimestampMs == null) {
      this.firstNativeTimestampMs = nativeTimestampMs;
    }
    const relativeMs = nativeTimestampMs - this.firstNativeTimestampMs;
    if (!Number.isFinite(relativeMs) || relativeMs < 0) {
      return Date.now();
    }
    return Math.round(wallClockStart + relativeMs);
  }
}

function canonicalPatchGroup(patchId: string): string {
  const explicit = /^(forehead|left_cheek|right_cheek)/i.exec(patchId);
  if (explicit) {
    return explicit[1].toLowerCase();
  }
  const match = /^r(\d+)c(\d+)$/i.exec(patchId);
  if (!match) {
    if (/p0/i.test(patchId)) {
      return "left_cheek";
    }
    if (/p1/i.test(patchId)) {
      return "forehead";
    }
    if (/p2/i.test(patchId)) {
      return "right_cheek";
    }
    return "unknown";
  }
  const col = Number(match[2]);
  if (Number.isNaN(col)) {
    return "unknown";
  }
  if (col <= 0) {
    return "left_cheek";
  }
  if (col === 1) {
    return "forehead";
  }
  return "right_cheek";
}

export type VisionCameraCaptureViewProps = {
  adapter: VisionCameraAdapter;
  isActive: boolean;
  patchRows?: number;
  patchCols?: number;
  onPluginAvailabilityChange?: (available: boolean) => void;
  style?: CameraProps["style"];
};

export function VisionCameraCaptureView({
  adapter,
  isActive,
  patchRows = 2,
  patchCols = 3,
  onPluginAvailabilityChange,
  style
}: VisionCameraCaptureViewProps): JSX.Element {
  const device = useCameraDevice("front");
  const { hasPermission, requestPermission } = useCameraPermission();
  const plugin = useMemo(
    () =>
      VisionCameraProxy.initFrameProcessorPlugin("summarizeRppgFrame", {
        patchRows,
        patchCols
      }) as FrameProcessorPlugin | undefined,
    [patchCols, patchRows]
  );

  useEffect(() => {
    onPluginAvailabilityChange?.(plugin != null);
  }, [onPluginAvailabilityChange, plugin]);
  const pushSummary = useMemo(
    () =>
      Worklets.createRunOnJS((summary: NativeSummaryResult) => {
        adapter.ingestNativeSummary(summary);
      }),
    [adapter]
  );

  useEffect(() => {
    if (!hasPermission) {
      void requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      "worklet";
      if (!plugin) {
        return;
      }
      const summary = plugin.call(frame) as NativeSummaryResult | undefined;
      if (summary && summary.patches && summary.patches.length > 0) {
        pushSummary(summary);
      }
    },
    [plugin, pushSummary]
  );

  if (!hasPermission) {
    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.text}>Camera permission required</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.text}>Front camera unavailable</Text>
      </View>
    );
  }

  return (
    <Camera
      device={device}
      isActive={isActive}
      photo={false}
      video={false}
      audio={false}
      style={style}
      frameProcessor={frameProcessor}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    backgroundColor: "#1d2730",
    justifyContent: "center"
  },
  text: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600"
  }
});
