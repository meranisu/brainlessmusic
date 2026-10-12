package com.brainlessmusic.app.ui.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.navigation.NavBackStackEntry
import com.brainlessmusic.app.data.local.Skin

/** The bottom bar's tabs, left to right, so a switch knows which way it goes. */
private val Tabs = listOf(Routes.HOME, Routes.ARTISTS, Routes.SEARCH, Routes.DOWNLOADS, Routes.SETTINGS)

/** +1 when moving to a tab on the right, -1 to the left; null unless both ends are tabs. */
private fun AnimatedContentTransitionScope<NavBackStackEntry>.tabStep(): Int? {
    val from = Tabs.indexOf(initialState.destination.route)
    val to = Tabs.indexOf(targetState.destination.route)
    if (from < 0 || to < 0 || from == to) return null
    return if (to > from) 1 else -1
}

// NavHost's own default, kept for every move that isn't between two tabs (opening and closing pages).
private val DefaultEnter = fadeIn(tween(700))
private val DefaultExit = fadeOut(tween(700))

/**
 * How the screen arrives on a tab switch (owner, 2026-10-12: switches looked different by tab, since going to Home is
 * a pop and the rest pushes). Short and the same either way, in the skin's manner: Standard fades through, Hit circle
 * pops in like a hit circle, Lane slides along like Arcaea's panels, Gear slams in from the side, Ring bounces in.
 */
fun AnimatedContentTransitionScope<NavBackStackEntry>.tabEnter(skin: Skin): EnterTransition {
    val step = tabStep() ?: return DefaultEnter
    return when (skin) {
        Skin.STANDARD -> fadeIn(tween(210, delayMillis = 90, easing = LinearOutSlowInEasing)) +
            scaleIn(tween(210, delayMillis = 90, easing = LinearOutSlowInEasing), initialScale = 0.98f)
        Skin.HIT_CIRCLE -> fadeIn(tween(200)) + scaleIn(tween(240, easing = FastOutSlowInEasing), initialScale = 0.95f)
        Skin.LANE -> fadeIn(tween(220)) + slideInHorizontally(tween(260, easing = FastOutSlowInEasing)) { it * step / 12 }
        Skin.GEAR -> fadeIn(tween(90)) + slideInHorizontally(tween(160, easing = LinearOutSlowInEasing)) { it * step / 14 }
        Skin.RING -> fadeIn(tween(180)) +
            scaleIn(spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMediumLow), initialScale = 0.93f)
    }
}

/**
 * How the screen leaves on a tab switch: quickly, so the two never sit half-faded over each other for long. Every
 * motion here is small, since each tab draws its own bottom bar and the bar moves with its screen.
 */
fun AnimatedContentTransitionScope<NavBackStackEntry>.tabExit(skin: Skin): ExitTransition {
    val step = tabStep() ?: return DefaultExit
    return when (skin) {
        Skin.STANDARD -> fadeOut(tween(90))
        // Swells a little as it goes, the way a hit circle bursts.
        Skin.HIT_CIRCLE -> fadeOut(tween(150)) + scaleOut(tween(150), targetScale = 1.03f)
        Skin.LANE -> fadeOut(tween(160)) + slideOutHorizontally(tween(260, easing = FastOutSlowInEasing)) { -it * step / 12 }
        Skin.GEAR -> fadeOut(tween(80))
        Skin.RING -> fadeOut(tween(140)) + scaleOut(tween(140), targetScale = 0.97f)
    }
}
