package com.brainlessmusic.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.theme.LocalSkin

/**
 * A floating action button in the skin's form (owner, 2026-10-12: the plain Material circle didn't match): Standard's
 * Material button, Hit circle's hit circle (the accent ringed in the ink), Lane's accent diamond, Gear's console keys
 * (an orange FX key, or a white BT key when [small]), Ring's lit cabinet button with its pale rim. Flat, no shadow,
 * like the rest of the skins. [small] is the secondary one stacked above, as Downloads' Play all.
 */
@Composable
fun SkinFab(icon: ImageVector, description: String, onClick: () -> Unit, modifier: Modifier = Modifier, small: Boolean = false) {
    val skin = LocalSkin.current
    if (skin == Skin.STANDARD) {
        if (small) {
            SmallFloatingActionButton(onClick = onClick, shape = CircleShape, modifier = modifier) {
                Icon(icon, contentDescription = description)
            }
        } else {
            FloatingActionButton(onClick = onClick, shape = CircleShape, modifier = modifier) {
                Icon(icon, contentDescription = description)
            }
        }
        return
    }
    val scheme = MaterialTheme.colorScheme
    val face = if (small) 40.dp else 56.dp
    val glyph = if (small) 18.dp else 24.dp
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(face)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
    ) {
        val ink = when (skin) {
            Skin.HIT_CIRCLE -> {
                Box(Modifier.size(face).background(scheme.primary, CircleShape).border(3.dp, scheme.onSurface, CircleShape))
                scheme.onPrimary
            }
            Skin.LANE -> {
                // A square turned on its corner fits the box at about 0.7 of its side.
                Box(Modifier.size(face * 0.72f).rotate(45f).background(scheme.primary).border(1.5.dp, scheme.onSurface))
                scheme.onPrimary
            }
            Skin.GEAR -> {
                val keyColor = if (small) scheme.onSurface else GearFx
                Box(Modifier.size(width = face, height = face * 0.78f).background(keyColor, CutCornerShape(if (small) 5.dp else 8.dp)))
                if (small) scheme.surface else GearInk
            }
            else -> {
                Box(Modifier.size(face).background(scheme.primary, CircleShape).border(if (small) 3.dp else 4.dp, scheme.surface, CircleShape))
                scheme.onPrimary
            }
        }
        Icon(icon, contentDescription = null, tint = ink, modifier = Modifier.size(glyph))
    }
}
