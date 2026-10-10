package com.brainlessmusic.app.data.remote

import kotlinx.coroutines.flow.MutableStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** The `<server>/api/` base in memory, so screens can build cover-art URLs. Kept in sync by AuthRepository. */
@Singleton
class MediaUrlProvider @Inject constructor() {
    private val _baseUrl = MutableStateFlow<String?>(null)

    var current: String?
        get() = _baseUrl.value
        set(value) {
            _baseUrl.value = value
        }
}
