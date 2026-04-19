import { AcquisitionFrame, CameraAdapter, PreviewAttachment } from "mobile-rppg-acquisition-sdk";

function createSyntheticFrame(timestampMs: number): AcquisitionFrame {
  const t = timestampMs / 1000;
  const pulse = Math.sin(2 * Math.PI * 1.25 * t);
  return {
    timestampMs,
    patches: [
      { patchId: "left_cheek_r0c0", patchGroup: "left_cheek", meanRgb: [132 + pulse * 5, 118 + pulse * 3, 95], weight: 1 },
      { patchId: "forehead_r0c0", patchGroup: "forehead", meanRgb: [130 + pulse * 4, 117 + pulse * 2, 94], weight: 1 },
      { patchId: "right_cheek_r0c0", patchGroup: "right_cheek", meanRgb: [131 + pulse * 6, 119 + pulse * 3, 96], weight: 1 },
      { patchId: "left_cheek_r1c0", patchGroup: "left_cheek", meanRgb: [129 + pulse * 4, 116 + pulse * 2, 93], weight: 1 },
      { patchId: "forehead_r1c0", patchGroup: "forehead", meanRgb: [133 + pulse * 5, 120 + pulse * 3, 97], weight: 1 },
      { patchId: "right_cheek_r1c0", patchGroup: "right_cheek", meanRgb: [128 + pulse * 4, 115 + pulse * 2, 92], weight: 1 }
    ],
    localQuality: {
      facePresent: true,
      brightness: 0.5,
      motionScore: 0.04,
      roiCoverage: 0.95
    }
  };
}

export class SyntheticCameraAdapter implements CameraAdapter {
  private preview: PreviewAttachment | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly fps: number;

  constructor(fps = 12) {
    this.fps = fps;
  }

  attachPreview(preview: PreviewAttachment): void {
    this.preview = preview;
  }

  start(listener: (frame: AcquisitionFrame) => void): void {
    this.preview?.attach();
    const intervalMs = Math.round(1000 / this.fps);
    this.timer = setInterval(() => {
      listener(createSyntheticFrame(Date.now()));
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
