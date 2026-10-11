package com.brainlessmusic.app.rooms

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Two [RoomSocket]s (an account and a guest) against a real backend: joining, the clock, a double skip, queue edits,
 * host-only commands, kick, a dropped socket coming back, and ending the room. Skipped unless `ROOM_TEST_URL` is set,
 * so it never runs in CI. Point it at a scratch server (its own DB_PATH and LIBRARY_PATH, never the real library) with
 * at least four tracks:
 * `ROOM_TEST_URL=http://localhost:3191 ROOM_TEST_TOKEN_A=<account token> ROOM_TEST_TOKEN_B=<guest token>
 * ./gradlew :app:testDebugUnitTest --tests '*RoomSocketLiveTest*'`
 */
class RoomSocketLiveTest {
    private val base = System.getenv("ROOM_TEST_URL")
    private val tokenA: String = System.getenv("ROOM_TEST_TOKEN_A").orEmpty()
    private val tokenB: String = System.getenv("ROOM_TEST_TOKEN_B").orEmpty()
    private val http = OkHttpClient.Builder().readTimeout(0, TimeUnit.MILLISECONDS).build()
    private val main = Executors.newSingleThreadExecutor().asCoroutineDispatcher()
    private val scope = CoroutineScope(SupervisorJob() + main)
    private val clock = { System.nanoTime() / 1_000_000 }

    class Recorder : RoomSocket.Events {
        val states = CopyOnWriteArrayList<RoomState>()
        val connections = CopyOnWriteArrayList<RoomConnection>()
        val closed = CopyOnWriteArrayList<RoomClosedReason>()
        val rejected = CopyOnWriteArrayList<String>()
        @Volatile var you: Int? = null
        override fun onState(room: RoomState, you: Int?) { println("state v${room.version} cur=${room.current}"); states += room; if (you != null) this.you = you }
        override fun onConnection(connection: RoomConnection) { println("conn $connection"); connections += connection }
        override fun onClosed(reason: RoomClosedReason) { println("closed $reason"); closed += reason }
        override fun onRejected(op: String, reason: String) { rejected += "$op:$reason" }
        val last get() = states.last()
    }

    private fun waitFor(what: String, ms: Long = 5_000, check: () -> Boolean) {
        val until = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < until) { if (check()) return; Thread.sleep(20) }
        throw AssertionError("timed out waiting for $what")
    }

    private fun socket(code: String, token: String, rec: Recorder) =
        RoomSocket(code, "$base/api/rooms/ws", http, { token }, scope, rec, clock)

    private fun onMain(block: () -> Unit) { scope.launch { block() } }

    @Test
    fun twoClientsFollowOneRoom() {
        assumeTrue(base != null)
        val body = """{"trackIds":[1,2,3],"current":0,"positionMs":5000,"playing":true}"""
        val created = http.newCall(
            Request.Builder().url("$base/api/rooms").header("Authorization", "Bearer $tokenA")
                .post(body.toRequestBody("application/json".toMediaType())).build(),
        ).execute().use { it.body!!.string() }
        val code = Regex("\"code\":\"([A-Z]+)\"").find(created)!!.groupValues[1]
        println("room $code")

        val a = Recorder(); val b = Recorder()
        val sa = socket(code, tokenA, a); val sb = socket(code, tokenB, b)
        onMain { sa.connect() }
        onMain { sb.connect() }
        waitFor("both live") { a.connections.lastOrNull() == RoomConnection.LIVE && b.connections.lastOrNull() == RoomConnection.LIVE }
        waitFor("b seen by a") { a.states.isNotEmpty() && a.last.members.size == 2 }
        assertEquals(3, b.last.queue.size)
        assertEquals("guest", b.last.members.first { it.userId == b.you }.kind)
        assertTrue(sa.synced && sb.synced)

        // Both clocks against the machine's own: same machine as the server, so the offset should be near-exact.
        val drift = sa.serverNow() - System.currentTimeMillis()
        val between = sa.serverNow() - sb.serverNow()
        println("server-clock error a=${drift}ms, a-b=${between}ms")
        assertTrue("clock a off by $drift", kotlin.math.abs(drift) < 50)
        assertTrue("clocks disagree by $between", kotlin.math.abs(between) < 50)

        // The room's position from the formula: 5 s, less the 1.5 s start lead, plus the time since creation.
        val pos = a.last.expectedPositionMs(sa.serverNow())
        println("expected position ${pos}ms")
        assertTrue(pos in 3_500..8_000)

        // Two skips at once move one song.
        val first = a.last.queue[0].entryId
        onMain { sa.send(RoomCommand.Next(first)); sb.send(RoomCommand.Next(first)) }
        waitFor("one skip") { a.last.current == 1 && b.last.current == 1 }
        waitFor("one stale") { (a.rejected + b.rejected).any { it == "next:stale" } }
        Thread.sleep(300)
        assertEquals(1, a.last.current)
        // A new song starts 1.5 s ahead.
        val lead = a.last.expectedPositionMs(sa.serverNow())
        println("after skip expected ${lead}ms (negative = lead)")
        assertTrue(lead in -1_600..-1_000)

        // The guest adds a song after the current one.
        val cur = b.last.queue[1].entryId
        onMain { sb.send(RoomCommand.Add(listOf(4), after = cur)) }
        waitFor("add") { a.last.queue.size == 4 }
        assertEquals(4, a.last.queue[2].trackId)
        assertEquals(b.you, a.last.queue[2].addedBy)

        onMain { sb.send(RoomCommand.Pause) }
        waitFor("paused") { !a.last.playback.playing }
        onMain { sa.send(RoomCommand.Seek(a.last.queue[1].entryId, 30_000)) }
        waitFor("seek") { b.last.playback.positionMs == 30_000L }
        onMain { sa.send(RoomCommand.Move(a.last.queue[2].entryId, 3)) }
        waitFor("move") { b.last.queue[3].trackId == 4 }
        onMain { sb.send(RoomCommand.End) }
        waitFor("host-only") { b.rejected.contains("end:host-only") }
        onMain { sa.status(42, false) }

        // The host removes the guest; the guest's socket stops for good.
        onMain { sa.send(RoomCommand.Kick(b.you!!)) }
        waitFor("kicked") { b.closed.contains(RoomClosedReason.KICKED) }
        waitFor("a sees one member") { a.last.members.size == 1 }

        // A dropped socket comes back by itself.
        onMain { sa.javaClass.getDeclaredField("socket").apply { isAccessible = true }.let { (it.get(sa) as okhttp3.WebSocket).cancel() } }
        val before = a.connections.size
        waitFor("reconnecting") { a.connections.drop(before).contains(RoomConnection.CONNECTING) }
        waitFor("back live", 8_000) { a.connections.drop(before).lastOrNull() == RoomConnection.LIVE }
        println("connections a: ${a.connections}")

        onMain { sa.send(RoomCommand.End) }
        waitFor("ended") { a.closed.contains(RoomClosedReason.ENDED) }
        println("rejected a=${a.rejected} b=${b.rejected}; closed a=${a.closed} b=${b.closed}")
    }
}
