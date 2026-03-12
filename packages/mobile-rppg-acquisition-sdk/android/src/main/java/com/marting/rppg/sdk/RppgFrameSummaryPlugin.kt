package com.marting.rppg.sdk

import android.graphics.RectF
import android.media.Image
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

class RppgFrameSummaryPlugin(private val options: Map<String, Any>?) : FrameProcessorPlugin() {
    private val patchRows = (options?.get("patchRows") as? Number)?.toInt() ?: 2
    private val patchCols = (options?.get("patchCols") as? Number)?.toInt() ?: 3
    private val detectionIntervalMs = (options?.get("detectionIntervalMs") as? Number)?.toDouble() ?: 200.0
    private val detectionTtlMs = 750.0
    private val faceDetector: FaceDetector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
            .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
            .build()
    )

    private var lastDetectionTimestampMs = Double.NEGATIVE_INFINITY
    private var lastFaceRect: RectF? = null
    private var lastFaceTimestampMs = Double.NEGATIVE_INFINITY
    private var lastMotionScore = 0.0

    override fun callback(frame: Frame, params: Map<String, Any>?): Any {
        val image = frame.image
        val timestampMs = frame.timestamp / 1_000_000.0
        val faceRect = trackedFaceRect(frame, image, timestampMs)
        val roi = faceRect?.let { foreheadRoi(it, image.width.toFloat(), image.height.toFloat()) }

        if (roi == null) {
            lastMotionScore = 1.0
            return emptyResult(timestampMs)
        }

        val patches = mutableListOf<Map<String, Any>>()
        val rowHeight = max(1, (roi.height() / patchRows).toInt())
        val colWidth = max(1, (roi.width() / patchCols).toInt())

        for (row in 0 until patchRows) {
            for (col in 0 until patchCols) {
                val x0 = roi.left.toInt() + col * colWidth
                val x1 = if (col == patchCols - 1) roi.right.toInt() else min(roi.right.toInt(), x0 + colWidth)
                val y0 = roi.top.toInt() + row * rowHeight
                val y1 = if (row == patchRows - 1) roi.bottom.toInt() else min(roi.bottom.toInt(), y0 + rowHeight)
                val rgb = meanRgbFromYuv420(image, x0, y0, x1, y1)
                patches.add(
                    mapOf(
                        "patchId" to "r${row}c${col}",
                        "meanRgb" to listOf(rgb[0], rgb[1], rgb[2]),
                        "weight" to max(1, (x1 - x0) * (y1 - y0))
                    )
                )
            }
        }

        val brightness = meanLuma(image, roi.left.toInt(), roi.top.toInt(), roi.right.toInt(), roi.bottom.toInt())
        // Coverage is defined as how complete the tracked ROI is, not how large it is relative to the full frame.
        val coverage = 1.0
        return mapOf(
            "timestampMs" to timestampMs,
            "patches" to patches,
            "localQuality" to mapOf(
                "facePresent" to true,
                "brightness" to brightness,
                "motionScore" to lastMotionScore,
                "roiCoverage" to coverage
            )
        )
    }

    private fun trackedFaceRect(frame: Frame, image: Image, timestampMs: Double): RectF? {
        if (lastFaceRect == null || timestampMs - lastDetectionTimestampMs >= detectionIntervalMs) {
            lastDetectionTimestampMs = timestampMs
            val detected = detectLargestFace(frame, image)
            if (detected != null) {
                val smoothed = smoothRect(lastFaceRect, detected)
                lastMotionScore = motionScore(lastFaceRect, smoothed, image.width.toFloat(), image.height.toFloat())
                lastFaceRect = smoothed
                lastFaceTimestampMs = timestampMs
            } else if (timestampMs - lastFaceTimestampMs > detectionTtlMs) {
                lastFaceRect = null
            }
        }
        return lastFaceRect
    }

    private fun detectLargestFace(frame: Frame, image: Image): RectF? {
        return try {
            val rotationDegrees = frame.imageProxy.imageInfo.rotationDegrees
            val detected = Tasks.await(faceDetector.process(InputImage.fromMediaImage(image, rotationDegrees)))
            val largest = detected.maxByOrNull { faceArea(it) } ?: return null
            uprightRectToBufferRect(
                upright = RectF(largest.boundingBox),
                rotationDegrees = rotationDegrees,
                bufferWidth = image.width.toFloat(),
                bufferHeight = image.height.toFloat(),
                mirrored = frame.isMirrored
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun faceArea(face: Face): Int = face.boundingBox.width() * face.boundingBox.height()

    private fun smoothRect(previous: RectF?, next: RectF): RectF {
        previous ?: return RectF(next)
        val alpha = 0.35f
        return RectF(
            previous.left * (1f - alpha) + next.left * alpha,
            previous.top * (1f - alpha) + next.top * alpha,
            previous.right * (1f - alpha) + next.right * alpha,
            previous.bottom * (1f - alpha) + next.bottom * alpha
        )
    }

    private fun motionScore(previous: RectF?, next: RectF, width: Float, height: Float): Double {
        previous ?: return 0.0
        val dx = next.centerX() - previous.centerX()
        val dy = next.centerY() - previous.centerY()
        val diagonal = sqrt((width * width + height * height).toDouble())
        if (diagonal <= 0.0) return 0.0
        return min(1.0, sqrt((dx * dx + dy * dy).toDouble()) / diagonal)
    }

    private fun foreheadRoi(faceRect: RectF, width: Float, height: Float): RectF? {
        val roi = RectF(
            faceRect.left + faceRect.width() * 0.18f,
            faceRect.top + faceRect.height() * 0.12f,
            faceRect.right - faceRect.width() * 0.18f,
            faceRect.top + faceRect.height() * 0.34f
        )
        roi.intersect(0f, 0f, width, height)
        return if (roi.width() > 4f && roi.height() > 4f) roi else null
    }

    private fun uprightRectToBufferRect(
        upright: RectF,
        rotationDegrees: Int,
        bufferWidth: Float,
        bufferHeight: Float,
        mirrored: Boolean
    ): RectF {
        val corners = listOf(
            Pair(upright.left, upright.top),
            Pair(upright.right, upright.top),
            Pair(upright.left, upright.bottom),
            Pair(upright.right, upright.bottom)
        )

        val rawPoints = corners.map { (x, y) ->
            val raw = when (((rotationDegrees % 360) + 360) % 360) {
                90 -> Pair(y, bufferHeight - x)
                180 -> Pair(bufferWidth - x, bufferHeight - y)
                270 -> Pair(bufferWidth - y, x)
                else -> Pair(x, y)
            }
            if (mirrored) {
                Pair(bufferWidth - raw.first, raw.second)
            } else {
                raw
            }
        }

        val xs = rawPoints.map { it.first }
        val ys = rawPoints.map { it.second }
        return RectF(
            max(0f, xs.minOrNull() ?: 0f),
            max(0f, ys.minOrNull() ?: 0f),
            min(bufferWidth, xs.maxOrNull() ?: bufferWidth),
            min(bufferHeight, ys.maxOrNull() ?: bufferHeight)
        )
    }

    private fun emptyResult(timestampMs: Double): Map<String, Any> =
        mapOf(
            "timestampMs" to timestampMs,
            "patches" to emptyList<Map<String, Any>>(),
            "localQuality" to mapOf(
                "facePresent" to false,
                "brightness" to 0.0,
                "motionScore" to lastMotionScore,
                "roiCoverage" to 0.0
            )
        )

    private fun meanLuma(image: Image, x0: Int, y0: Int, x1: Int, y1: Int): Double {
        val yPlane = image.planes[0]
        val rowStride = yPlane.rowStride
        val pixelStride = yPlane.pixelStride
        val buffer = yPlane.buffer
        var total = 0.0
        var count = 0
        val step = 4
        var y = y0
        while (y < y1) {
            var x = x0
            while (x < x1) {
                val index = y * rowStride + x * pixelStride
                total += (buffer.get(index).toInt() and 0xFF)
                count += 1
                x += step
            }
            y += step
        }
        return if (count == 0) 0.0 else (total / count.toDouble()) / 255.0
    }

    private fun meanRgbFromYuv420(image: Image, x0: Int, y0: Int, x1: Int, y1: Int): DoubleArray {
        val yPlane = image.planes[0]
        val uPlane = image.planes[1]
        val vPlane = image.planes[2]
        val yBuffer = yPlane.buffer
        val uBuffer = uPlane.buffer
        val vBuffer = vPlane.buffer
        var rTotal = 0.0
        var gTotal = 0.0
        var bTotal = 0.0
        var count = 0
        val step = 4
        var y = y0
        while (y < y1) {
            var x = x0
            while (x < x1) {
                val yIndex = y * yPlane.rowStride + x * yPlane.pixelStride
                val uvX = x / 2
                val uvY = y / 2
                val uIndex = uvY * uPlane.rowStride + uvX * uPlane.pixelStride
                val vIndex = uvY * vPlane.rowStride + uvX * vPlane.pixelStride

                val yy = yBuffer.get(yIndex).toInt() and 0xFF
                val uu = uBuffer.get(uIndex).toInt() and 0xFF
                val vv = vBuffer.get(vIndex).toInt() and 0xFF

                val c = yy - 16
                val d = uu - 128
                val e = vv - 128
                val r = clamp((298 * c + 409 * e + 128) shr 8)
                val g = clamp((298 * c - 100 * d - 208 * e + 128) shr 8)
                val b = clamp((298 * c + 516 * d + 128) shr 8)
                rTotal += r.toDouble()
                gTotal += g.toDouble()
                bTotal += b.toDouble()
                count += 1
                x += step
            }
            y += step
        }
        if (count == 0) return doubleArrayOf(0.0, 0.0, 0.0)
        return doubleArrayOf(rTotal / count.toDouble(), gTotal / count.toDouble(), bTotal / count.toDouble())
    }

    private fun clamp(value: Int): Int = min(255, max(0, value))
}
