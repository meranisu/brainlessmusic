package com.brainlessmusic.app.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.theme.LocalSkin
import com.brainlessmusic.app.ui.theme.rowShape

// The Library's header row is this tall, its round buttons too, so the tabs line up with them.
private val TabBarHeight = 48.dp

/**
 * Tabs in the skin's form: Standard's pill, Lane's slanted segments, Gear's difficulty boxes, Ring's genre chips. The
 * Library's, and your profile's Profile, Stats and Friends (owner, 2026-10-21). [selected] indexes [labels].
 */
@Composable
fun SkinTabBar(labels: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    if (LocalSkin.current == Skin.GEAR) {
        DifficultyTabs(labels, selected, onSelect, modifier)
        return
    }
    if (LocalSkin.current == Skin.RING) {
        GenreChips(labels, selected, onSelect, modifier)
        return
    }
    if (dockedHeader) {
        SlantTabs(labels, selected, onSelect, modifier)
        return
    }
    Surface(
        modifier = modifier.height(TabBarHeight),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Row(
            modifier = Modifier.padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            labels.forEachIndexed { i, label ->
                val isSelected = i == selected
                Surface(
                    shape = CircleShape,
                    color = if (isSelected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh,
                    contentColor = if (isSelected) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .fillMaxHeight()
                        .selectable(selected = isSelected, role = Role.Tab, onClick = { onSelect(i) }),
                ) {
                    Box(contentAlignment = Alignment.Center, modifier = Modifier.padding(horizontal = 14.dp)) {
                        Text(text = label, style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

/**
 * Lane's tabs: Arcaea's slanted segments side by side across the strip, the open one filled in the accent, the rest
 * outlined, as its difficulty selector reads.
 */
@Composable
private fun SlantTabs(labels: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val shape = MaterialTheme.rowShape
    Row(
        modifier = modifier.height(TabBarHeight),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        labels.forEachIndexed { i, label ->
            val isSelected = i == selected
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .weight(1f)
                    .height(38.dp)
                    .clip(shape)
                    .background(if (isSelected) scheme.primary else scheme.surfaceContainerHigh)
                    .border(1.dp, if (isSelected) scheme.primary else scheme.outline, shape)
                    .selectable(selected = isSelected, role = Role.Tab, onClick = { onSelect(i) }),
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (isSelected) scheme.onPrimary else scheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }
    }
}

/**
 * Gear's tabs: the game's difficulty boxes side by side, each in its colour, the open one filled with it and the rest
 * outlined in it, as the song select shows NOV, ADV, EXH and MXM.
 */
@Composable
private fun DifficultyTabs(labels: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val shape = MaterialTheme.shapes.small
    Row(
        modifier = modifier.height(TabBarHeight),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        labels.forEachIndexed { i, label ->
            val isSelected = i == selected
            val color = GearDifficultyColors[i % GearDifficultyColors.size]
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .weight(1f)
                    .height(38.dp)
                    .clip(shape)
                    .background(if (isSelected) color else scheme.surfaceContainerHigh)
                    .border(2.dp, color, shape)
                    .selectable(selected = isSelected, role = Role.Tab, onClick = { onSelect(i) }),
            ) {
                Text(
                    label.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isSelected) GearInk else scheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }
    }
}

/**
 * Ring's tabs: maimai's genre chips, a pill each in its own cabinet colour, the open one lit (filled, with a pale rim)
 * and the rest outlined in theirs.
 */
@Composable
private fun GenreChips(labels: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val colors = listOf(scheme.primary, RingSky, RingYellow, RingDifficulties[0].color)
    val inks = listOf(scheme.onPrimary, Color.White, RingInk, Color.White)
    Row(
        modifier = modifier.height(TabBarHeight),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        labels.forEachIndexed { i, label ->
            val isSelected = i == selected
            val color = colors[i % colors.size]
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .weight(1f)
                    .height(38.dp)
                    .clip(CircleShape)
                    .background(if (isSelected) color else scheme.surfaceContainerHigh)
                    .border(if (isSelected) 3.dp else 2.dp, if (isSelected) scheme.surfaceContainerHigh else color, CircleShape)
                    .selectable(selected = isSelected, role = Role.Tab, onClick = { onSelect(i) }),
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (isSelected) inks[i % inks.size] else scheme.onSurface,
                    maxLines = 1,
                )
            }
        }
    }
}
