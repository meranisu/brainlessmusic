package com.brainlessmusic.app.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Lane's icons (A123): Lucide 0.460.0, thin line glyphs like Arcaea's sparse interface marks. ISC licence, Copyright
 * Lucide Contributors 2022 (portions Cole Bemis, Feather, MIT); credited in Settings → Licenses. Generated from the
 * SVGs and drawn at a 1.5 stroke instead of Lucide's 2, for Arcaea's lighter line. A liked heart, play and pause fill.
 */
object LaneIcons {
    val Play: ImageVector by lazy { lucide("Play", listOf("M6L3L20L12L6L21L6L3Z"), filled = true) }
    val Back: ImageVector by lazy { lucide("Back", listOf("m15 18-6-6 6-6")) }
    val Shuffle: ImageVector by lazy { lucide("Shuffle", listOf("M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22", "m18 2 4 4-4 4", "M2 6h1.9c1.5 0 2.9.9 3.6 2.2", "M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8", "m18 14 4 4-4 4")) }
    val Download: ImageVector by lazy { lucide("Download", listOf("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7L10L12L15L17L10", "M12 15L12 3")) }
    val Search: ImageVector by lazy { lucide("Search", listOf("M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0", "m21 21-4.3-4.3")) }
    val Pause: ImageVector by lazy { lucide("Pause", listOf("M15 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1Z", "M7 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1Z"), filled = true) }
    val CircleCheck: ImageVector by lazy { lucide("CircleCheck", listOf("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "m9 12 2 2 4-4")) }
    val More: ImageVector by lazy { lucide("More", listOf("M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0")) }
    val Heart: ImageVector by lazy { lucide("Heart", listOf("M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"), filled = true) }
    val HeartOutline: ImageVector by lazy { lucide("HeartOutline", listOf("M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z")) }
    val Queue: ImageVector by lazy { lucide("Queue", listOf("M21 15V6", "M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z", "M12 12H3", "M16 6H3", "M12 18H3")) }
    val Previous: ImageVector by lazy { lucide("Previous", listOf("M19L20L9L12L19L4L19L20Z", "M5 19L5 5")) }
    val Next: ImageVector by lazy { lucide("Next", listOf("M5L4L15L12L5L20L5L4Z", "M19 5L19 19")) }
    val Error: ImageVector by lazy { lucide("Error", listOf("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M12 8L12 12", "M12 16L12.01 16")) }
    val CircleDown: ImageVector by lazy { lucide("CircleDown", listOf("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M12 8v8", "m8 12 4 4 4-4")) }
    val Close: ImageVector by lazy { lucide("Close", listOf("M18 6 6 18", "m6 6 12 12")) }
    val Disc: ImageVector by lazy { lucide("Disc", listOf("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M6 12c0-1.7.7-3.2 1.8-4.2", "M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M18 12c0 1.7-.7 3.2-1.8 4.2")) }
    val TrendDown: ImageVector by lazy { lucide("TrendDown", listOf("M22L17L13.5L8.5L8.5L13.5L2L7", "M16L17L22L17L22L11")) }
    val AddToList: ImageVector by lazy { lucide("AddToList", listOf("M11 12H3", "M16 6H3", "M16 18H3", "M18 9v6", "M21 12h-6")) }
    val User: ImageVector by lazy { lucide("User", listOf("M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M8 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0")) }
    val Music: ImageVector by lazy { lucide("Music", listOf("M9 18V5l12-2v13", "M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M15 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0")) }
    val Users: ImageVector by lazy { lucide("Users", listOf("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75")) }
    val Grip: ImageVector by lazy { lucide("Grip", listOf("M11 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M18 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M4 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M11 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M18 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M4 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0")) }
    val Trash: ImageVector by lazy { lucide("Trash", listOf("M3 6h18", "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2", "M10 11L10 17", "M14 11L14 17")) }
    val CircleClose: ImageVector by lazy { lucide("CircleClose", listOf("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "m15 9-6 6", "m9 9 6 6")) }
    val Plus: ImageVector by lazy { lucide("Plus", listOf("M5 12h14", "M12 5v14")) }
    val Info: ImageVector by lazy { lucide("Info", listOf("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M12 16v-4", "M12 8h.01")) }
    val EyeSlash: ImageVector by lazy { lucide("EyeSlash", listOf("M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49", "M14.084 14.158a3 3 0 0 1-4.242-4.242", "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143", "m2 2 20 20")) }
    val Eye: ImageVector by lazy { lucide("Eye", listOf("M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0", "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0")) }
    val Hand: ImageVector by lazy { lucide("Hand", listOf("M22 14a8 8 0 0 1-8 8", "M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2", "M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1", "M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10", "M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15")) }
    val Update: ImageVector by lazy { lucide("Update", listOf("M12 13v8l-4-4", "m12 21 4-4", "M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284")) }
    val Gear: ImageVector by lazy { lucide("Gear", listOf("M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z", "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0")) }
    val Repeat: ImageVector by lazy { lucide("Repeat", listOf("m17 2 4 4-4 4", "M3 11v-1a4 4 0 0 1 4-4h14", "m7 22-4-4 4-4", "M21 13v1a4 4 0 0 1-4 4H3")) }
    val RepeatOne: ImageVector by lazy { lucide("RepeatOne", listOf("m17 2 4 4-4 4", "M3 11v-1a4 4 0 0 1 4-4h14", "m7 22-4-4 4-4", "M21 13v1a4 4 0 0 1-4 4H3", "M11 10h1v4")) }
    val Refresh: ImageVector by lazy { lucide("Refresh", listOf("M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5")) }
    val CirclePlay: ImageVector by lazy { lucide("CirclePlay", listOf("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M10L8L16L12L10L16L10L8Z")) }
    val Palette: ImageVector by lazy { lucide("Palette", listOf("M13 6.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0", "M17 10.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0", "M8 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0", "M6 12.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0", "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z")) }
    val ChevronDown: ImageVector by lazy { lucide("ChevronDown", listOf("m6 9 6 6 6-6")) }
    val House: ImageVector by lazy { lucide("House", listOf("M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8", "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z")) }
    val History: ImageVector by lazy { lucide("History", listOf("M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M12 7v5l4 2")) }
    val Leaf: ImageVector by lazy { lucide("Leaf", listOf("M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z", "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12")) }
    val Cloud: ImageVector by lazy { lucide("Cloud", listOf("m2 2 20 20", "M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193", "M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07")) }
    val Check: ImageVector by lazy { lucide("Check", listOf("M20 6 9 17l-5-5")) }
    val CircleUser: ImageVector by lazy { lucide("CircleUser", listOf("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662")) }
    val Sort: ImageVector by lazy { lucide("Sort", listOf("m3 16 4 4 4-4", "M7 20V4", "M11 4h10", "M11 8h7", "M11 12h4")) }
    val ListPlay: ImageVector by lazy { lucide("ListPlay", listOf("M12 12H3", "M16 6H3", "M12 18H3", "m16 12 5 3-5 3v-6Z")) }
    val Logout: ImageVector by lazy { lucide("Logout", listOf("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16L17L21L12L16L7", "M21 12L9 12")) }
    val ChevronRight: ImageVector by lazy { lucide("ChevronRight", listOf("m9 18 6-6-6-6")) }
}

private fun lucide(name: String, paths: List<String>, filled: Boolean = false): ImageVector =
    ImageVector.Builder(name = "lane.$name", defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
        .apply {
            paths.forEach { d ->
                addPath(
                    pathData = addPathNodes(d),
                    fill = if (filled) SolidColor(Color.Black) else null,
                    stroke = SolidColor(Color.Black),
                    strokeLineWidth = 1.5f,
                    strokeLineCap = StrokeCap.Round,
                    strokeLineJoin = StrokeJoin.Round,
                )
            }
        }
        .build()
