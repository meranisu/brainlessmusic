package com.brainlessmusic.app.data.remote

import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

/**
 * Attaches `Authorization: Bearer <token>` when one is held. `/health` and
 * `/auth/login` don't need it and ignore the header if present (confirmed
 * against backend/src/plugins/auth.ts — the decorator only runs on routes
 * that ask for it), so this stays unconditional rather than route-aware.
 */
class AuthInterceptor @Inject constructor(
    private val tokenProvider: TokenProvider,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider.current
        val request = chain.request()
        return if (token == null) {
            chain.proceed(request)
        } else {
            chain.proceed(
                request.newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build(),
            )
        }
    }
}
