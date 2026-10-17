package com.brainlessmusic.app.playback

/** What a headset press can do (A203). */
enum class HeadsetAction(val label: String) {
    PLAY_PAUSE("Play or pause"),
    NEXT("Next song"),
    PREVIOUS("Previous song"),
    SEEK_FORWARD("Skip forward 10 seconds"),
    SEEK_BACK("Skip back 10 seconds"),
    NONE("Do nothing"),
}

/** The five things a headset can send. Earbuds that read taps themselves send next and previous, not raw presses. */
enum class HeadsetSlot(val title: String) {
    SINGLE("One press"),
    DOUBLE("Two presses"),
    TRIPLE("Three presses"),
    NEXT_BUTTON("Next button"),
    PREVIOUS_BUTTON("Previous button"),
}

data class HeadsetButtonPrefs(
    val single: HeadsetAction = HeadsetAction.PLAY_PAUSE,
    val double: HeadsetAction = HeadsetAction.NEXT,
    val triple: HeadsetAction = HeadsetAction.PREVIOUS,
    val nextButton: HeadsetAction = HeadsetAction.NEXT,
    val previousButton: HeadsetAction = HeadsetAction.PREVIOUS,
) {
    operator fun get(slot: HeadsetSlot): HeadsetAction = when (slot) {
        HeadsetSlot.SINGLE -> single
        HeadsetSlot.DOUBLE -> double
        HeadsetSlot.TRIPLE -> triple
        HeadsetSlot.NEXT_BUTTON -> nextButton
        HeadsetSlot.PREVIOUS_BUTTON -> previousButton
    }
}
