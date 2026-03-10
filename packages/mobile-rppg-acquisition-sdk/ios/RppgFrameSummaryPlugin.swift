import CoreMedia
import CoreVideo
import Foundation
import ImageIO
import Vision
import VisionCamera

@objc(RppgFrameSummaryPlugin)
public class RppgFrameSummaryPlugin: FrameProcessorPlugin {
  private let patchRows: Int
  private let patchCols: Int
  private let detectionIntervalMs: Double
  private let detectionTtlMs: Double = 750.0

  private var lastDetectionTimestampMs: Double = -Double.greatestFiniteMagnitude
  private var lastFaceRect: CGRect?
  private var lastFaceTimestampMs: Double = -Double.greatestFiniteMagnitude
  private var lastMotionScore: Double = 0.0

  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]! = [:]) {
    self.patchRows = (options["patchRows"] as? NSNumber)?.intValue ?? 2
    self.patchCols = (options["patchCols"] as? NSNumber)?.intValue ?? 3
    self.detectionIntervalMs = (options["detectionIntervalMs"] as? NSNumber)?.doubleValue ?? 200.0
    super.init(proxy: proxy, options: options)
  }

  public override func callback(_ frame: Frame!, withArguments arguments: [AnyHashable: Any]!) -> Any! {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(frame.buffer) else {
      return emptyResult(timestampMs: frame.timestamp * 1000.0)
    }

    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    let timestampMs = frame.timestamp * 1000.0

    guard let faceRect = trackedFaceRect(frame: frame, pixelBuffer: pixelBuffer, timestampMs: timestampMs, bufferWidth: width, bufferHeight: height),
          let roi = foreheadRoi(from: faceRect, bufferWidth: width, bufferHeight: height) else {
      lastMotionScore = 1.0
      return emptyResult(timestampMs: timestampMs)
    }

    let rowHeight = max(1, Int(roi.height) / patchRows)
    let colWidth = max(1, Int(roi.width) / patchCols)
    var patches: [[String: Any]] = []

    for row in 0..<patchRows {
      for col in 0..<patchCols {
        let x0 = Int(roi.origin.x) + col * colWidth
        let x1 = col == patchCols - 1 ? Int(roi.maxX) : min(Int(roi.maxX), x0 + colWidth)
        let y0 = Int(roi.origin.y) + row * rowHeight
        let y1 = row == patchRows - 1 ? Int(roi.maxY) : min(Int(roi.maxY), y0 + rowHeight)
        let rgb = meanRgbFromNV12(pixelBuffer: pixelBuffer, x0: x0, y0: y0, x1: x1, y1: y1)
        patches.append([
          "patchId": "r\(row)c\(col)",
          "meanRgb": rgb,
          "weight": max(1, (x1 - x0) * (y1 - y0))
        ])
      }
    }

    let brightness = meanLuma(pixelBuffer: pixelBuffer, x0: Int(roi.minX), y0: Int(roi.minY), x1: Int(roi.maxX), y1: Int(roi.maxY))
    let coverage = min(1.0, max(0.0, (roi.width * roi.height) / CGFloat(width * height)))
    return [
      "timestampMs": timestampMs,
      "patches": patches,
      "localQuality": [
        "facePresent": true,
        "brightness": brightness,
        "motionScore": lastMotionScore,
        "roiCoverage": Double(coverage)
      ]
    ]
  }

  private func trackedFaceRect(frame: Frame, pixelBuffer: CVPixelBuffer, timestampMs: Double, bufferWidth: Int, bufferHeight: Int) -> CGRect? {
    if lastFaceRect == nil || timestampMs - lastDetectionTimestampMs >= detectionIntervalMs {
      lastDetectionTimestampMs = timestampMs
      if let detected = detectLargestFace(frame: frame, pixelBuffer: pixelBuffer, bufferWidth: bufferWidth, bufferHeight: bufferHeight) {
        let smoothed = smoothRect(previous: lastFaceRect, next: detected)
        lastMotionScore = motionScore(previous: lastFaceRect, next: smoothed, bufferWidth: bufferWidth, bufferHeight: bufferHeight)
        lastFaceRect = smoothed
        lastFaceTimestampMs = timestampMs
      } else if timestampMs - lastFaceTimestampMs > detectionTtlMs {
        lastFaceRect = nil
      }
    }

    return lastFaceRect
  }

  private func detectLargestFace(frame: Frame, pixelBuffer: CVPixelBuffer, bufferWidth: Int, bufferHeight: Int) -> CGRect? {
    let request = VNDetectFaceRectanglesRequest()
    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: exifOrientation(for: frame), options: [:])

    do {
      try handler.perform([request])
      guard let faces = request.results as? [VNFaceObservation], !faces.isEmpty else {
        return nil
      }
      let largest = faces.max { lhs, rhs in
        lhs.boundingBox.width * lhs.boundingBox.height < rhs.boundingBox.width * rhs.boundingBox.height
      }
      guard let face = largest else {
        return nil
      }

      let uprightSize = orientedSize(bufferWidth: bufferWidth, bufferHeight: bufferHeight, orientation: frame.orientation)
      let normalized = face.boundingBox
      let uprightRect = CGRect(
        x: normalized.origin.x * uprightSize.width,
        y: (1.0 - normalized.origin.y - normalized.height) * uprightSize.height,
        width: normalized.width * uprightSize.width,
        height: normalized.height * uprightSize.height
      )
      return uprightRectToBufferRect(
        uprightRect,
        bufferWidth: CGFloat(bufferWidth),
        bufferHeight: CGFloat(bufferHeight),
        orientation: frame.orientation,
        mirrored: frame.isMirrored
      )
    } catch {
      return nil
    }
  }

  private func foreheadRoi(from faceRect: CGRect, bufferWidth: Int, bufferHeight: Int) -> CGRect? {
    let x = faceRect.origin.x + faceRect.width * 0.18
    let y = faceRect.origin.y + faceRect.height * 0.12
    let width = faceRect.width * 0.64
    let height = faceRect.height * 0.22

    let roi = CGRect(x: x, y: y, width: width, height: height)
      .intersection(CGRect(x: 0, y: 0, width: bufferWidth, height: bufferHeight))
      .integral

    return roi.width > 4 && roi.height > 4 ? roi : nil
  }

  private func smoothRect(previous: CGRect?, next: CGRect) -> CGRect {
    guard let previous else {
      return next
    }

    let alpha: CGFloat = 0.35
    return CGRect(
      x: previous.origin.x * (1.0 - alpha) + next.origin.x * alpha,
      y: previous.origin.y * (1.0 - alpha) + next.origin.y * alpha,
      width: previous.width * (1.0 - alpha) + next.width * alpha,
      height: previous.height * (1.0 - alpha) + next.height * alpha
    )
  }

  private func motionScore(previous: CGRect?, next: CGRect, bufferWidth: Int, bufferHeight: Int) -> Double {
    guard let previous else {
      return 0.0
    }

    let dx = next.midX - previous.midX
    let dy = next.midY - previous.midY
    let diagonal = sqrt(Double(bufferWidth * bufferWidth + bufferHeight * bufferHeight))
    guard diagonal > 0 else {
      return 0.0
    }
    return min(1.0, sqrt(Double(dx * dx + dy * dy)) / diagonal)
  }

  private func exifOrientation(for frame: Frame) -> CGImagePropertyOrientation {
    switch frame.orientation {
    case .up:
      return frame.isMirrored ? .upMirrored : .up
    case .down:
      return frame.isMirrored ? .downMirrored : .down
    case .left:
      return frame.isMirrored ? .leftMirrored : .left
    case .right:
      return frame.isMirrored ? .rightMirrored : .right
    default:
      return frame.isMirrored ? .upMirrored : .up
    }
  }

  private func orientedSize(bufferWidth: Int, bufferHeight: Int, orientation: UIImage.Orientation) -> CGSize {
    switch orientation {
    case .left, .leftMirrored, .right, .rightMirrored:
      return CGSize(width: bufferHeight, height: bufferWidth)
    default:
      return CGSize(width: bufferWidth, height: bufferHeight)
    }
  }

  private func uprightRectToBufferRect(
    _ uprightRect: CGRect,
    bufferWidth: CGFloat,
    bufferHeight: CGFloat,
    orientation: UIImage.Orientation,
    mirrored: Bool
  ) -> CGRect {
    let corners = [
      CGPoint(x: uprightRect.minX, y: uprightRect.minY),
      CGPoint(x: uprightRect.maxX, y: uprightRect.minY),
      CGPoint(x: uprightRect.minX, y: uprightRect.maxY),
      CGPoint(x: uprightRect.maxX, y: uprightRect.maxY)
    ]

    let transformed = corners.map { point -> CGPoint in
      let raw: CGPoint
      switch orientation {
      case .right, .rightMirrored:
        raw = CGPoint(x: point.y, y: bufferHeight - point.x)
      case .left, .leftMirrored:
        raw = CGPoint(x: bufferWidth - point.y, y: point.x)
      case .down, .downMirrored:
        raw = CGPoint(x: bufferWidth - point.x, y: bufferHeight - point.y)
      default:
        raw = point
      }

      if mirrored {
        return CGPoint(x: bufferWidth - raw.x, y: raw.y)
      }
      return raw
    }

    let xs = transformed.map(\.x)
    let ys = transformed.map(\.y)
    let rect = CGRect(
      x: xs.min() ?? 0,
      y: ys.min() ?? 0,
      width: (xs.max() ?? 0) - (xs.min() ?? 0),
      height: (ys.max() ?? 0) - (ys.min() ?? 0)
    )
    return rect.intersection(CGRect(x: 0, y: 0, width: bufferWidth, height: bufferHeight))
  }

  private func emptyResult(timestampMs: Double) -> [String: Any] {
    [
      "timestampMs": timestampMs,
      "patches": [],
      "localQuality": [
        "facePresent": false,
        "brightness": 0.0,
        "motionScore": lastMotionScore,
        "roiCoverage": 0.0
      ]
    ]
  }

  private func meanLuma(pixelBuffer: CVPixelBuffer, x0: Int, y0: Int, x1: Int, y1: Int) -> Double {
    let yBase = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0)!.assumingMemoryBound(to: UInt8.self)
    let yStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
    var total = 0.0
    var count = 0
    let step = 4
    var y = y0
    while y < y1 {
      var x = x0
      while x < x1 {
        total += Double(yBase[y * yStride + x])
        count += 1
        x += step
      }
      y += step
    }
    return count == 0 ? 0.0 : (total / Double(count)) / 255.0
  }

  private func meanRgbFromNV12(pixelBuffer: CVPixelBuffer, x0: Int, y0: Int, x1: Int, y1: Int) -> [Double] {
    let yBase = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0)!.assumingMemoryBound(to: UInt8.self)
    let uvBase = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 1)!.assumingMemoryBound(to: UInt8.self)
    let yStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
    let uvStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 1)
    var rTotal = 0.0
    var gTotal = 0.0
    var bTotal = 0.0
    var count = 0
    let step = 4

    var y = y0
    while y < y1 {
      var x = x0
      while x < x1 {
        let yy = Int(yBase[y * yStride + x])
        let uvIndex = (y / 2) * uvStride + (x / 2) * 2
        let cb = Int(uvBase[uvIndex])
        let cr = Int(uvBase[uvIndex + 1])
        let c = yy - 16
        let d = cb - 128
        let e = cr - 128
        let r = clamp((298 * c + 409 * e + 128) >> 8)
        let g = clamp((298 * c - 100 * d - 208 * e + 128) >> 8)
        let b = clamp((298 * c + 516 * d + 128) >> 8)
        rTotal += Double(r)
        gTotal += Double(g)
        bTotal += Double(b)
        count += 1
        x += step
      }
      y += step
    }

    if count == 0 {
      return [0.0, 0.0, 0.0]
    }
    return [rTotal / Double(count), gTotal / Double(count), bTotal / Double(count)]
  }

  private func clamp(_ value: Int) -> Int {
    min(255, max(0, value))
  }
}
