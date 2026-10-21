package com.brainlessmusic.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.theme.LocalSkin
import com.brainlessmusic.app.ui.theme.SlantShape

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

/**
 * [SkinFab] with its words beside the icon, for an action that should be found without guessing (Listen together on
 * Home, A183): Standard's extended button, a pill for Hit circle and Ring, Lane's slanted plate, Gear's FX key.
 */
@Composable
fun SkinExtendedFab(icon: ImageVector, text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val skin = LocalSkin.current
    if (skin == Skin.STANDARD) {
        ExtendedFloatingActionButton(
            onClick = onClick,
            icon = { Icon(icon, contentDescription = null) },
            text = { Text(text) },
            modifier = modifier,
        )
        return
    }
    val scheme = MaterialTheme.colorScheme
    val shape = when (skin) {
        Skin.LANE -> SlantShape(14.dp)
        Skin.GEAR -> CutCornerShape(8.dp)
        else -> RoundedCornerShape(50)
    }
    val face = when (skin) {
        Skin.LANE -> Modifier.background(scheme.primary).border(1.5.dp, scheme.onSurface, shape)
        Skin.GEAR -> Modifier.background(GearFx)
        Skin.HIT_CIRCLE -> Modifier.background(scheme.primary).border(3.dp, scheme.onSurface, shape)
        else -> Modifier.background(scheme.primary).border(4.dp, scheme.surface, shape)
    }
    val ink = if (skin == Skin.GEAR) GearInk else scheme.onPrimary
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .height(56.dp)
            .clip(shape)
            .then(face)
            .clickable(role = Role.Button, onClick = onClick)
            // The slant eats into Lane's ends, so its words sit further in.
            .padding(horizontal = if (skin == Skin.LANE) 28.dp else 20.dp),
    ) {
        Icon(icon, contentDescription = null, tint = ink, modifier = Modifier.size(24.dp))
        Spacer(Modifier.width(12.dp))
        Text(text, style = MaterialTheme.typography.labelLarge, color = ink)
    }
}
