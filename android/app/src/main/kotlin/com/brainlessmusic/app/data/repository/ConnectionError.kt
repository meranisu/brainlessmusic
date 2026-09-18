package com.brainlessmusic.app.data.repository

/** The four failure modes Phase 0 asks to be surfaced distinctly, plus a catch-all. */
sealed interface ConnectionError {
    data object Unreachable : ConnectionError
    data object Unauthorized : ConnectionError
    data object TlsError : ConnectionError
    data object InvalidUrl : ConnectionError
    data class Unknown(val detail: String?) : ConnectionError
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
