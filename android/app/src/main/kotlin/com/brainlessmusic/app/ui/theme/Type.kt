package com.brainlessmusic.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.brainlessmusic.app.R

/** The wordmark only (`.font-brand` on the web). One variable file, so each weight is set on the axis. */
@OptIn(ExperimentalTextApi::class)
val BrandFontFamily = FontFamily(
    listOf(FontWeight.Medium, FontWeight.SemiBold, FontWeight.Bold).map { weight ->
        Font(R.font.fredoka, weight, variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)))
    },
)

/** Lane's one face (A122): Exo 2, thin and wide like Arcaea's interface. One variable file, weights on the axis. */
@OptIn(ExperimentalTextApi::class)
val LaneFontFamily = FontFamily(
    listOf(FontWeight.Light, FontWeight.Normal, FontWeight.Medium, FontWeight.SemiBold).map { weight ->
        Font(R.font.exo2, weight, variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)))
    },
)

/** Gear's display face (A125): Orbitron, wide and squared like SOUND VOLTEX's lettering. One variable file. */
@OptIn(ExperimentalTextApi::class)
val GearDisplayFontFamily = FontFamily(
    listOf(FontWeight.Medium, FontWeight.SemiBold, FontWeight.Bold, FontWeight.Black).map { weight ->
        Font(R.font.orbitron, weight, variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)))
    },
)

/** Gear's reading face (A125): Chakra Petch, squared and chamfered but narrow enough for long titles. */
val GearFontFamily = FontFamily(
    Font(R.font.chakrapetch_regular, FontWeight.Normal),
    Font(R.font.chakrapetch_medium, FontWeight.Medium),
    Font(R.font.chakrapetch_semibold, FontWeight.SemiBold),
    Font(R.font.chakrapetch_bold, FontWeight.Bold),
)

/** Track titles at display size (`.font-display`). Weight carries the title; never uppercase it, mixed-script titles break. */
val DisplayFontFamily = FontFamily(Font(R.font.barlow_condensed_extrabold, FontWeight.ExtraBold))

private val Base = Typography()

private fun TextStyle.display() = copy(fontFamily = DisplayFontFamily, fontWeight = FontWeight.ExtraBold)

// Display and headline sizes take Barlow Condensed; everything else stays the system sans, as on the web.
val Typography = Typography(
    displayLarge = Base.displayLarge.display(),
    displayMedium = Base.displayMedium.display(),
    displaySmall = Base.displaySmall.display(),
    headlineLarge = Base.headlineLarge.display(),
    headlineMedium = Base.headlineMedium.display(),
    headlineSmall = Base.headlineSmall.display(),
    bodyLarge = Base.bodyLarge.copy(fontSize = 16.sp, lineHeight = 24.sp),
)
