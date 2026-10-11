package com.brainlessmusic.app.data.remote

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Whether the phone has a working connection. It can't tell that the server is down, only that there's no usable
 * signal, which is what decides between streaming and the downloads.
 */
@Singleton
class NetworkMonitor @Inject constructor(@ApplicationContext context: Context) {
    private val connectivity = context.getSystemService(ConnectivityManager::class.java)

    private val _online = MutableStateFlow(hasInternet(connectivity.activeNetwork))
    val online: StateFlow<Boolean> = _online.asStateFlow()

    init {
        connectivity.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                _online.value = caps.usable()
            }

            override fun onLost(network: Network) {
                _online.value = false
            }
        })
    }

    private fun hasInternet(network: Network?): Boolean = connectivity.getNetworkCapabilities(network)?.usable() == true

    /**
     * Validated, not just connected: hotel Wi-Fi before its sign-in page, or a router with no uplink, claims internet
     * but carries nothing, and should count as offline so the downloads take over.
     */
    private fun NetworkCapabilities.usable(): Boolean =
        hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
}
