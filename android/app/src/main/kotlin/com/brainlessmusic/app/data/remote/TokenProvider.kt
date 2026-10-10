package com.brainlessmusic.app.data.remote

import kotlinx.coroutines.flow.MutableStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** The bearer token in memory, so [AuthInterceptor] never does disk I/O per request. AuthRepository is the only writer. */
@Singleton
class TokenProvider @Inject constructor() {
    private val _token = MutableStateFlow<String?>(null)

    var current: String?
        get() = _token.value
        set(value) {
            _token.value = value
        }

    /** Whether the session is a guest's (A37: listen-only). Set on every way in, including the restore from `/auth/me`. */
    @Volatile
    var isGuest: Boolean = false
}
