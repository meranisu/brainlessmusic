package com.brainlessmusic.app.ui.people

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.media.ExifInterface
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.brainlessmusic.app.ui.theme.coverShape
import java.io.ByteArrayOutputStream
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Crop before upload (profile page plan, Phase 6): the phone opens the picked photo, you move and zoom it in a frame
 * the shape of your avatar, and the phone sends a 512 px square JPEG. The server still checks and re-encodes it.
 */

/** Largest file opened. It's read as a stream and shrunk while decoding, so this is only a sanity limit. */
private const val MAX_PICK_BYTES = 50L * 1024 * 1024
/** Smaller than this on the short side looks blurry at the largest avatar size. */
private const val MIN_SIDE = 128
/** Pixels in the file. Phone cameras reach 200 MP; past that it's more likely a file built to exhaust memory. */
private const val MAX_PIXELS = 250_000_000L
/** The decoded picture is halved until it's under this, so even a 200 MP photo opens in about 16 MB. */
private const val DECODE_PIXELS = 4_000_000L
/** The size the server stores, so it never has to scale up. */
private const val OUTPUT_SIZE = 512
private const val MAX_ZOOM = 4f

/** What opening a picked photo gave: the upright picture, or why it can't be used. */
internal sealed interface PickedPicture {
    data class Ready(val bitmap: Bitmap) : PickedPicture
    data class Problem(val message: String) : PickedPicture
}

/**
 * Opens [uri] for cropping: checks its size and dimensions before decoding anything, decodes it shrunk, and turns it
 * upright from its EXIF orientation (BitmapFactory ignores it). Call off the main thread.
 */
internal fun openForCrop(resolver: ContentResolver, uri: Uri): PickedPicture {
    val bytes = runCatching {
        resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst() && !cursor.isNull(0)) cursor.getLong(0) else null
        }
    }.getOrNull()
    if (bytes != null && bytes > MAX_PICK_BYTES) {
        return PickedPicture.Problem("That picture is over ${MAX_PICK_BYTES / 1024 / 1024} MB. Pick a smaller one.")
    }

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    runCatching { resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } }
    val width = bounds.outWidth
    val height = bounds.outHeight
    if (width <= 0 || height <= 0) return PickedPicture.Problem("That file couldn't be opened as a picture.")
    if (min(width, height) < MIN_SIDE) {
        return PickedPicture.Problem("That picture is too small. It needs at least $MIN_SIDE px on each side.")
    }
    if (width.toLong() * height > MAX_PIXELS) {
        return PickedPicture.Problem("That picture has too many pixels to use. Pick a smaller one.")
    }

    var sample = 1
    while ((width.toLong() / (sample * 2)) * (height / (sample * 2)) >= DECODE_PIXELS) sample *= 2
    val decoded = runCatching {
        resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        }
    }.getOrNull() ?: return PickedPicture.Problem("That file couldn't be opened as a picture.")

    val orientation = runCatching {
        resolver.openInputStream(uri)?.use {
            ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }
    }.getOrNull() ?: ExifInterface.ORIENTATION_NORMAL
    return PickedPicture.Ready(upright(decoded, orientation))
}

private fun upright(bitmap: Bitmap, orientation: Int): Bitmap {
    val matrix = Matrix()
    when (orientation) {
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
        ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
        ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.postRotate(90f); matrix.postScale(-1f, 1f) }
        ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
        ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.postRotate(-90f); matrix.postScale(-1f, 1f) }
        ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
        else -> return bitmap
    }
    val turned = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    if (turned !== bitmap) bitmap.recycle()
    return turned
}

/**
 * The square at ([left], [top]) with sides [side], in [source]'s pixels, as a 512 px JPEG. A new JPEG carries no EXIF,
 * so the photo's location never leaves the phone. Call off the main thread.
 */
internal fun cropToJpeg(source: Bitmap, left: Float, top: Float, side: Float): ByteArray {
    val l = left.roundToInt().coerceIn(0, source.width - 1)
    val t = top.roundToInt().coerceIn(0, source.height - 1)
    val s = side.roundToInt().coerceIn(1, min(source.width - l, source.height - t))
    val out = Bitmap.createBitmap(OUTPUT_SIZE, OUTPUT_SIZE, Bitmap.Config.ARGB_8888)
    Canvas(out).apply {
        // A see-through PNG turns black as a JPEG anyway; this makes it black on purpose.
        drawColor(android.graphics.Color.BLACK)
        drawBitmap(source, Rect(l, t, l + s, t + s), Rect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE), Paint(Paint.FILTER_BITMAP_FLAG))
    }
    return ByteArrayOutputStream().use { stream ->
        out.compress(Bitmap.CompressFormat.JPEG, 90, stream)
        out.recycle()
        stream.toByteArray()
    }
}

/**
 * Move and zoom [bitmap] in a square shaped like the skin's avatar. Drag to move, pinch or the slider to zoom; the
 * picture always fills the square. [onUse] gets the square in the bitmap's pixels.
 */
@Composable
internal fun AvatarCropDialog(
    bitmap: Bitmap,
    saving: Boolean,
    onCancel: () -> Unit,
    onUse: (left: Float, top: Float, side: Float) -> Unit,
) {
    val image = remember(bitmap) { bitmap.asImageBitmap() }
    val width = bitmap.width.toFloat()
    val height = bitmap.height.toFloat()
    var frame by remember { mutableFloatStateOf(0f) }
    var zoom by remember(bitmap) { mutableFloatStateOf(1f) }
    // The picture's top-left corner relative to the frame's, in pixels. Always zero or negative.
    var offset by remember(bitmap) { mutableStateOf(Offset.Zero) }

    // At zoom 1 the short side just fills the frame.
    fun scaleFor(z: Float) = frame / min(width, height) * z
    fun clamp(o: Offset, s: Float) = Offset(o.x.coerceIn(frame - width * s, 0f), o.y.coerceIn(frame - height * s, 0f))
    fun zoomTo(next: Float, centre: Offset = Offset(frame / 2, frame / 2)) {
        val z = next.coerceIn(1f, MAX_ZOOM)
        val ratio = scaleFor(z) / scaleFor(zoom)
        offset = clamp(centre - (centre - offset) * ratio, scaleFor(z))
        zoom = z
    }

    Dialog(onDismissRequest = onCancel, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
            Column(
                Modifier.fillMaxSize().systemBarsPadding().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text("Crop your picture", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.weight(1f))
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    Canvas(
                        Modifier
                            .fillMaxWidth()
                            .aspectRatio(1f)
                            // The avatar's own shape, at the same proportions, so this is how it will look.
                            .clip(coverShape(maxWidth / 5))
                            .background(Color.Black)
                            .onSizeChanged { size ->
                                frame = size.width.toFloat()
                                val s = scaleFor(1f)
                                zoom = 1f
                                offset = Offset((frame - width * s) / 2, (frame - height * s) / 2)
                            }
                            .pointerInput(bitmap) {
                                detectTransformGestures { centroid, pan, gestureZoom, _ ->
                                    if (gestureZoom != 1f) zoomTo(zoom * gestureZoom, centroid)
                                    offset = clamp(offset + pan, scaleFor(zoom))
                                }
                            }
                            .semantics { contentDescription = "Picture to crop. Drag to move, pinch to zoom." },
                    ) {
                        if (frame > 0f) {
                            val s = scaleFor(zoom)
                            drawImage(
                                image,
                                dstOffset = IntOffset(offset.x.roundToInt(), offset.y.roundToInt()),
                                dstSize = IntSize((width * s).roundToInt(), (height * s).roundToInt()),
                                filterQuality = FilterQuality.Medium,
                            )
                        }
                    }
                }
                Slider(
                    value = zoom,
                    onValueChange = { zoomTo(it) },
                    valueRange = 1f..MAX_ZOOM,
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Zoom" },
                )
                Text(
                    "Drag to move, pinch or slide to zoom. What's in the frame is what people see.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.weight(1f))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = onCancel, enabled = !saving, modifier = Modifier.weight(1f)) { Text("Cancel") }
                    Button(
                        onClick = {
                            val s = scaleFor(zoom)
                            onUse(-offset.x / s, -offset.y / s, frame / s)
                        },
                        enabled = !saving && frame > 0f,
                        modifier = Modifier.weight(1f),
                    ) { Text(if (saving) "Uploading…" else "Use this picture") }
                }
            }
        }
    }
}
