package com.brainlessmusic.app.data.remote

import com.google.gson.Gson
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import javax.inject.Inject
import javax.inject.Singleton

/** Builds [ApiService] for a base URL and reuses it until the URL changes, since Retrofit fixes it at construction. */
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
        /** Appends the `/api/` prefix the backend mounts every route under (`backend/src/app.ts`). */
        fun normalize(rawServerUrl: String): String {
            val trimmed = rawServerUrl.trim().trimEnd('/')
            return "$trimmed/api/"
        }
    }
}
