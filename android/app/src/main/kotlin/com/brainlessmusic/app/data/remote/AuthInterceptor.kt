package com.brainlessmusic.app.data.remote

import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

/**
 * Adds the bearer token when one is held, and reports a 401 to it. Public routes ignore the header, so this needn't be
 * route-aware.
 */
class AuthInterceptor @Inject constructor(
    private val tokenProvider: TokenProvider,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider.current
        val request = chain.request()
        if (token == null) return chain.proceed(request)
        val response = chain.proceed(
            request.newBuilder()
                .header("Authorization", "Bearer $token")
                .build(),
        )
        // Streams and covers come through here too, so this catches a revoked session wherever it shows first.
        if (response.code == 401) tokenProvider.reportRefused(token)
        return response
    }
}
