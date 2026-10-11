package com.brainlessmusic.app.data.remote

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
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

    private val _refused = MutableSharedFlow<String>(extraBufferCapacity = 8)

    /** Tokens the server answered 401 to, from any request. AuthRepository decides whether that ends the session. */
    val refused: SharedFlow<String> = _refused.asSharedFlow()

    fun reportRefused(token: String) {
        _refused.tryEmit(token)
    }

    /** Whether the session is a guest's (A37: listen-only). Set on every way in, including the restore from `/auth/me`. */
    @Volatile
    var isGuest: Boolean = false
}
