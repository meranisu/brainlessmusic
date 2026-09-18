package com.brainlessmusic.app.ui.common

/** Shared by every screen that fetches one thing from [com.brainlessmusic.app.data.repository.LibraryRepository]. */
sealed interface LoadState<out T> {
    data object Loading : LoadState<Nothing>
    data class Content<T>(val data: T) : LoadState<T>
    data class Error(val message: String) : LoadState<Nothing>
}
