package com.brainlessmusic.app.data.remote

import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

/** Adds the bearer token when one is held. Public routes ignore the header, so this needn't be route-aware. */
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
