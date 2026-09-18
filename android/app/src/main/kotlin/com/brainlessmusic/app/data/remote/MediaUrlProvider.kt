package com.brainlessmusic.app.data.remote

import kotlinx.coroutines.flow.MutableStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The normalized base URL (`<server>/api/`, same value [ApiServiceFactory]
 * builds Retrofit against), held in memory so Compose screens can build
 * absolute cover-art URLs for Coil without each one reaching into
 * [com.brainlessmusic.app.data.local.SessionStore]. Kept in sync by
 * [com.brainlessmusic.app.data.repository.AuthRepository], the same way
 * [TokenProvider] is.
 */
@Singleton
class MediaUrlProvider @Inject constructor() {
    private val _baseUrl = MutableStateFlow<String?>(null)

    var current: String?
        get() = _baseUrl.value
        set(value) {
            _baseUrl.value = value
        }
}
