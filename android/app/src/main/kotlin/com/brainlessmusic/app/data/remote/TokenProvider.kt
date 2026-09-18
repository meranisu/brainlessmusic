package com.brainlessmusic.app.data.remote

import kotlinx.coroutines.flow.MutableStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The bearer token, held in memory so [AuthInterceptor] can read it
 * synchronously on the OkHttp dispatcher thread — no DataStore (disk) I/O on
 * every outgoing request. [com.brainlessmusic.app.data.repository.AuthRepository]
 * is the only writer, keeping this in sync with the encrypted copy in
 * [com.brainlessmusic.app.data.local.SessionStore].
 */
@Singleton
class TokenProvider @Inject constructor() {
    private val _token = MutableStateFlow<String?>(null)

    var current: String?
        get() = _token.value
        set(value) {
            _token.value = value
        }
}
