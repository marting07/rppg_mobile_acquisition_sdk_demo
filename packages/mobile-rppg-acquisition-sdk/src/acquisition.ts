import { AcquisitionFrame, PreviewAttachment } from "./types";

export type FrameListener = (frame: AcquisitionFrame) => void;

export interface CameraAdapter {
  attachPreview(preview: PreviewAttachment): void;
  start(listener: FrameListener): void;
  stop(): void;
}

export interface FaceTrackingAdapter {
  start(): void;
  stop(): void;
}

export type AcquisitionModules = {
  camera: CameraAdapter;
  faceTracking?: FaceTrackingAdapter;
};

export class AcquisitionController {
  private readonly modules: AcquisitionModules;
  private listener: FrameListener | null = null;

  constructor(modules: AcquisitionModules) {
    this.modules = modules;
  }

  attachPreview(preview: PreviewAttachment): void {
    this.modules.camera.attachPreview(preview);
  }

  start(listener: FrameListener): void {
    this.listener = listener;
    this.modules.faceTracking?.start();
    this.modules.camera.start((frame) => {
      this.listener?.(frame);
    });
  }

  stop(): void {
    this.modules.camera.stop();
    this.modules.faceTracking?.stop();
  }
}
