package com.brainlessmusic.app.rooms

import android.os.SystemClock
import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/**
 * The live half of a room: one WebSocket to `/api/rooms/ws`, the server's clock and reconnecting. The Android twin of the
 * web's `lib/roomClient.ts`, with the same timings (spec, "Clock sync" and "The 30-second test"). Main thread only:
 * OkHttp's callbacks hop onto [scope] (a main-thread scope) before touching anything.
 */
class RoomSocket(
    private val code: String,
    private val url: String,
    private val client: OkHttpClient,
    private val token: () -> String?,
    private val scope: CoroutineScope,
    private val events: Events,
    /** Monotonic ms; a parameter so the socket can be driven from a JVM test. */
    private val now: () -> Long = SystemClock::elapsedRealtime,
) {
    interface Events {
        /** [you] comes with the first state after each (re)connect. */
        fun onState(room: RoomState, you: Int?)
        fun onConnection(connection: RoomConnection)
        /** Final: the socket has stopped and won't reconnect. */
        fun onClosed(reason: RoomClosedReason)
        fun onRejected(op: String, reason: String)
    }

    private val gson = Gson()
    private val clock = ClockEstimator()
    @Volatile private var socket: WebSocket? = null
    private var stopped = false
    private var attempt = 0
    private var lastHeard = 0L
    private var cmdCounter = 0
    // Ops remembered for naming a rejection. Accepted commands get no reply, so only the newest few are kept.
    private val pendingOps = object : LinkedHashMap<String, String>() {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?) = size > PENDING_OPS_KEPT
    }

    /**
     * The current socket has had `welcome`. Before that the server takes nothing but `hello`, and OkHttp would flush
     * anything sent while connecting ahead of it (the hello goes out after a hop to the main thread): the server would
     * close the socket as `no-hello` and drop us from the room. So every other message waits for this.
     */
    @Volatile private var joined = false

    /** The socket to talk on, or null before `welcome`. */
    private val live: WebSocket? get() = socket?.takeIf { joined }
    private var reconnectJob: Job? = null
    private var pingJob: Job? = null

    /** True once the first clock samples are in; positions before then would be guesses. */
    val synced: Boolean get() = clock.offset != null

    /** The server clock now, in ms. */
    fun serverNow(): Long = now() + (clock.offset ?: 0L)

    fun connect() = open()

    fun send(command: RoomCommand) {
        val ws = live ?: return
        val id = "c${++cmdCounter}"
        pendingOps[id] = command.op
        val body = JsonObject().apply {
            addProperty("type", "cmd")
            addProperty("clientCmdId", id)
            addProperty("op", command.op)
            when (command) {
                is RoomCommand.Seek -> { addProperty("entryId", command.entryId); addProperty("positionMs", command.positionMs) }
                is RoomCommand.Next -> addProperty("entryId", command.entryId)
                is RoomCommand.Previous -> addProperty("entryId", command.entryId)
                is RoomCommand.Jump -> addProperty("entryId", command.entryId)
                is RoomCommand.Add -> {
                    add("trackIds", JsonArray().apply { command.trackIds.forEach(::add) })
                    command.after?.let { addProperty("after", it) }
                }
                is RoomCommand.Remove -> addProperty("entryId", command.entryId)
                is RoomCommand.Move -> { addProperty("entryId", command.entryId); addProperty("toIndex", command.toIndex) }
                is RoomCommand.Kick -> addProperty("userId", command.userId)
                is RoomCommand.Settings -> add("settings", JsonObject().apply {
                    command.changes.forEach { (key, value) ->
                        when (value) {
                            is Boolean -> addProperty(key, value)
                            else -> addProperty(key, value.toString())
                        }
                    }
                })
                RoomCommand.Play, RoomCommand.Pause, RoomCommand.End -> Unit
            }
        }
        ws.send(body.toString())
    }

    /** For the Control Center monitor: how far this phone is from the room, every 5 s. */
    fun status(driftMs: Long?, buffering: Boolean) {
        live?.send(JsonObject().apply {
            addProperty("type", "status")
            addProperty("driftMs", driftMs)
            addProperty("buffering", buffering)
        }.toString())
    }

    /** Leaves the room for good. */
    /**
     * Leaves the room for good. Returns false when the socket couldn't carry it (reconnecting): the caller then leaves
     * over REST, or the server would keep us for its away grace and a restart would put us straight back in.
     */
    fun leave(): Boolean {
        val sent = live?.send("""{"type":"leave"}""") == true
        stop()
        return sent
    }

    /** Stops without telling the server (a sign-out): it marks us away and drops us after its grace period. */
    fun stop() {
        stopped = true
        joined = false
        clearTimers()
        val ws = socket
        socket = null
        ws?.close(1000, null)
    }

    private fun clearTimers() {
        reconnectJob?.cancel()
        pingJob?.cancel()
    }

    private fun open() {
        if (stopped) return
        events.onConnection(RoomConnection.CONNECTING)
        val request = Request.Builder().url(url).build()
        lateinit var ws: WebSocket
        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                scope.launch {
                    if (ws !== socket) return@launch
                    lastHeard = now()
                    val hello = JsonObject().apply {
                        addProperty("type", "hello")
                        addProperty("token", token())
                        addProperty("code", code)
                    }
                    webSocket.send(hello.toString())
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                // The arrival time, before the hop to the main thread, so a busy main thread doesn't skew the clock.
                val arrivedAt = now()
                scope.launch {
                    if (ws !== socket) return@launch
                    lastHeard = arrivedAt
                    val message = runCatching { JsonParser.parseString(text).asJsonObject }.getOrNull() ?: return@launch
                    handle(message, arrivedAt)
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = dropped(webSocket)

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = dropped(webSocket)

            private fun dropped(webSocket: WebSocket) {
                scope.launch {
                    if (webSocket !== socket) return@launch
                    socket = null
                    joined = false
                    clearTimers()
                    scheduleReconnect()
                }
            }
        })
        socket = ws
    }

    private fun handle(message: JsonObject, arrivedAt: Long) {
        when (message.get("type")?.asString) {
            "welcome" -> {
                joined = true
                attempt = 0
                startClockSync()
                parseRoom(message)?.let { events.onState(it, message.get("you")?.asInt) }
            }
            "state" -> parseRoom(message)?.let { events.onState(it, null) }
            "pong" -> {
                val t0 = message.get("t0")?.asLong ?: return
                val ts = message.get("ts")?.asLong ?: return
                clock.add(t0, ts, arrivedAt)
            }
            "rejected" -> {
                val id = message.get("clientCmdId")?.asString
                val op = pendingOps.remove(id) ?: "command"
                events.onRejected(op, message.get("reason")?.asString.orEmpty())
            }
            "closed" -> {
                stopped = true
                clearTimers()
                // Detach first, as stop() does, so the close callback finds no current socket and doesn't reconnect.
                val ws = socket
                socket = null
                joined = false
                ws?.close(1000, null)
                events.onClosed(RoomClosedReason.from(message.get("reason")?.asString))
            }
        }
    }

    private fun parseRoom(message: JsonObject): RoomState? =
        runCatching { gson.fromJson(message.getAsJsonObject("room"), RoomState::class.java) }.getOrNull()

    /** 8 quick pings on every (re)connect, one every 3 s for half a minute, then one every 20 s. */
    private fun startClockSync() {
        clock.reset()
        pingJob?.cancel()
        pingJob = scope.launch {
            repeat(SYNC_PINGS) {
                ping()
                delay(SYNC_PING_GAP_MS)
            }
            delay(200)
            events.onConnection(RoomConnection.LIVE)
            val startedAt = now()
            while (isActive) {
                val early = now() - startedAt < EARLY_PHASE_MS
                delay(if (early) EARLY_PING_EVERY_MS else PING_EVERY_MS)
                if (now() - lastHeard > SILENT_LIMIT_MS) {
                    // Half-open (signal lost without a close): drop it ourselves and reconnect.
                    socket?.cancel()
                    return@launch
                }
                ping()
            }
        }
    }

    private fun ping() {
        live?.send("""{"type":"ping","t0":${now()}}""")
    }

    private fun scheduleReconnect() {
        if (stopped) return
        events.onConnection(RoomConnection.CONNECTING)
        val wait = RECONNECT_STEPS_MS[minOf(attempt, RECONNECT_STEPS_MS.lastIndex)]
        attempt++
        reconnectJob = scope.launch {
            delay(wait)
            open()
        }
    }

    private companion object {
        const val PENDING_OPS_KEPT = 50
        const val SYNC_PINGS = 8
        const val SYNC_PING_GAP_MS = 100L
        const val EARLY_PING_EVERY_MS = 3_000L
        const val EARLY_PHASE_MS = 30_000L
        /** Also keeps the socket inside Cloudflare's ~100 s idle limit. */
        const val PING_EVERY_MS = 20_000L
        const val SILENT_LIMIT_MS = PING_EVERY_MS + 10_000L
        val RECONNECT_STEPS_MS = longArrayOf(1_000, 2_000, 4_000, 8_000, 10_000)
    }
}
