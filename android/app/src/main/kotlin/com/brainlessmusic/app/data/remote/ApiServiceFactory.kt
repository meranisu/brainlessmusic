package com.brainlessmusic.app.data.remote

import com.google.gson.Gson
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Retrofit wants a fixed base URL at construction time, but the server
 * address is only known once the user types it into the server-config
 * screen — so instead of a Hilt-provided [ApiService] singleton, this is a
 * cached, rebuild-on-change factory. Rebuilding is cheap (no network I/O)
 * and only happens when the URL actually changes, so repeated calls with the
 * same URL — the common case, since it's typed once — reuse one instance.
 */
@Singleton
class ApiServiceFactory @Inject constructor(
    private val okHttpClient: OkHttpClient,
) {
    @Volatile
    private var cachedBaseUrl: String? = null

    @Volatile
    private var cachedService: ApiService? = null

    fun get(rawServerUrl: String): ApiService {
        val baseUrl = normalize(rawServerUrl)
        cachedService?.let { if (cachedBaseUrl == baseUrl) return it }

        synchronized(this) {
            cachedService?.let { if (cachedBaseUrl == baseUrl) return it }

            val service = Retrofit.Builder()
                .baseUrl(baseUrl)
                .client(okHttpClient)
                .addConverterFactory(GsonConverterFactory.create(Gson()))
                .build()
                .create(ApiService::class.java)

            cachedBaseUrl = baseUrl
            cachedService = service
            return service
        }
    }

    companion object {
        /**
         * `backend/src/app.ts` mounts everything under `/api` — the user
         * types the bare server address (e.g. `http://10.0.2.2:3000`, the
         * same form the backend's own dev docs use), this appends the
         * prefix Retrofit's relative `@GET`/`@POST` paths expect.
         */
        fun normalize(rawServerUrl: String): String {
            val trimmed = rawServerUrl.trim().trimEnd('/')
            return "$trimmed/api/"
        }
    }
}
