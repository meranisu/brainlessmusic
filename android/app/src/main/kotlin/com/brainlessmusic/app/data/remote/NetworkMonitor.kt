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
     * Hotel Wi-Fi before its sign-in page claims internet but carries nothing, so a detected captive portal counts as
     * offline and the downloads take over. Not "validated": a VPN, Private DNS or a network that blocks Android's check
     * never validates while smol is reachable, and would be offline for good. A router with no uplink still looks
     * online; songs then fail and skip one at a time, as before.
     */
    private fun NetworkCapabilities.usable(): Boolean =
        hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            !hasCapability(NetworkCapabilities.NET_CAPABILITY_CAPTIVE_PORTAL)
}
