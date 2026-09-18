package com.brainlessmusic.app.data.repository

import retrofit2.HttpException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/** The four failure modes Phase 0 asks to be surfaced distinctly, plus a catch-all. */
sealed interface ConnectionError {
    data object Unreachable : ConnectionError
    data object Unauthorized : ConnectionError
    data object TlsError : ConnectionError
    data object InvalidUrl : ConnectionError
    data class Unknown(val detail: String?) : ConnectionError
}

/** Shared by every repository that talks to the API — one place decides what a given failure means. */
fun classifyError(t: Throwable): ConnectionError = when (t) {
    is HttpException -> if (t.code() == 401) ConnectionError.Unauthorized else ConnectionError.Unknown("HTTP ${t.code()}")
    // SSLException is an IOException subtype — must be checked before the generic IOException branch below.
    is SSLException -> ConnectionError.TlsError
    is UnknownHostException, is ConnectException, is SocketTimeoutException -> ConnectionError.Unreachable
    is IOException -> ConnectionError.Unreachable
    else -> ConnectionError.Unknown(t.message)
}

fun ConnectionError.toMessage(): String = when (this) {
    ConnectionError.Unreachable ->
        "Can't reach that server. Check the address and that you're on the right network."
    ConnectionError.Unauthorized ->
        "Incorrect username or password."
    ConnectionError.TlsError ->
        "The server's certificate couldn't be verified."
    ConnectionError.InvalidUrl ->
        "That doesn't look like a valid server address — try something like http://10.0.2.2:3000."
    is ConnectionError.Unknown ->
        "Something went wrong" + (detail?.let { ": $it" } ?: ".")
}
