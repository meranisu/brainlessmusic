package com.brainlessmusic.app.downloads

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.brainlessmusic.app.playback.QueueItem
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** What a downloaded song is called, so it can be listed and played with no signal. The file itself is Media3's. */
@Entity(tableName = "downloaded_track")
data class DownloadedTrack(
    @PrimaryKey val trackId: Int,
    val title: String,
    val artist: String?,
    val album: String?,
    val albumId: Int?,
    val trackNumber: Int?,
    val durationSec: Double?,
    val format: String?,
    /** Levelling gain as it was when downloaded, so an offline song is levelled too. Null before version 5. */
    val gainDb: Double? = null,
)

/** The song as a queue entry; [coverUrl] is its group's saved cover, or its own art when there's signal. */
fun DownloadedTrack.toQueueItem(coverUrl: String?) = QueueItem(
    trackId = trackId,
    title = title,
    artist = artist,
    album = album,
    durationSec = durationSec,
    coverUrl = coverUrl,
    format = format,
    albumId = albumId,
    trackNumber = trackNumber,
    gainDb = gainDb,
)

/** An album or playlist someone tapped download on. [id] is `album:<id>` or `playlist:<id>`. */
@Entity(tableName = "download_group")
data class DownloadGroup(
    @PrimaryKey val id: String,
    val kind: String,
    val name: String,
    val subtitle: String?,
    /** The cover saved next to the downloads; Coil's own cache can be cleared, so it can't be relied on offline. */
    val coverPath: String?,
    val addedAt: Long,
)

/** Which songs a group holds, in order. A song in two groups is downloaded once. */
@Entity(
    tableName = "download_group_track",
    primaryKeys = ["groupId", "trackId"],
    indices = [Index("trackId")],
)
data class DownloadGroupTrack(val groupId: String, val trackId: Int, val position: Int)

/** A downloaded song with the cover of a group that holds it, for lists that mix groups. */
data class DownloadedTrackWithCover(
    @Embedded val track: DownloadedTrack,
    val coverPath: String?,
)

@Dao
abstract class DownloadDao {
    /**
     * Every downloaded song once, newest group first and in each group's order; a song in two groups appears where
     * its newest group puts it.
     */
    @Query(
        "SELECT t.*, g.coverPath AS coverPath FROM downloaded_track t " +
            "JOIN download_group_track l ON l.trackId = t.trackId JOIN download_group g ON g.id = l.groupId " +
            "ORDER BY g.addedAt DESC, l.position",
    )
    protected abstract fun allTracksWithDuplicates(): Flow<List<DownloadedTrackWithCover>>

    fun allTracks(): Flow<List<DownloadedTrackWithCover>> =
        allTracksWithDuplicates().map { rows -> rows.distinctBy { it.track.trackId } }

    @Query("SELECT * FROM download_group WHERE id = :groupId")
    abstract fun groupFlow(groupId: String): Flow<DownloadGroup?>

    @Query(
        "SELECT t.* FROM downloaded_track t JOIN download_group_track g ON g.trackId = t.trackId " +
            "WHERE g.groupId = :groupId ORDER BY g.position",
    )
    abstract fun tracksOfFlow(groupId: String): Flow<List<DownloadedTrack>>

    @Query("SELECT * FROM download_group ORDER BY addedAt DESC")
    abstract fun groups(): Flow<List<DownloadGroup>>

    @Query("SELECT * FROM download_group_track ORDER BY groupId, position")
    abstract fun groupTracks(): Flow<List<DownloadGroupTrack>>

    @Query("SELECT COUNT(*) FROM download_group")
    abstract suspend fun groupCount(): Int

    @Query("SELECT * FROM download_group WHERE id = :groupId")
    abstract suspend fun group(groupId: String): DownloadGroup?

    @Query(
        "SELECT t.* FROM downloaded_track t JOIN download_group_track g ON g.trackId = t.trackId " +
            "WHERE g.groupId = :groupId ORDER BY g.position",
    )
    abstract suspend fun tracksOf(groupId: String): List<DownloadedTrack>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    protected abstract suspend fun putGroup(group: DownloadGroup)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    protected abstract suspend fun putTracks(tracks: List<DownloadedTrack>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    protected abstract suspend fun putLinks(links: List<DownloadGroupTrack>)

    @Query("DELETE FROM download_group WHERE id = :groupId")
    protected abstract suspend fun deleteGroupRow(groupId: String)

    @Query("DELETE FROM download_group_track WHERE groupId = :groupId")
    protected abstract suspend fun deleteLinks(groupId: String)

    @Query("SELECT trackId FROM downloaded_track WHERE trackId NOT IN (SELECT trackId FROM download_group_track)")
    protected abstract suspend fun unlinkedTrackIds(): List<Int>

    @Query("SELECT DISTINCT trackId FROM download_group_track")
    protected abstract suspend fun linkedTrackIds(): List<Int>

    @Query("DELETE FROM downloaded_track WHERE trackId IN (:trackIds)")
    protected abstract suspend fun deleteTracks(trackIds: List<Int>)

    /**
     * Saves [group] with exactly [tracks], in order; downloading it again replaces its old song list, as when a
     * playlist changed. Returns songs that dropped out of every group: those files are no longer wanted.
     */
    @Transaction
    open suspend fun saveGroup(group: DownloadGroup, tracks: List<DownloadedTrack>): List<Int> {
        putGroup(group)
        putTracks(tracks)
        deleteLinks(group.id)
        putLinks(tracks.mapIndexed { i, t -> DownloadGroupTrack(group.id, t.trackId, i) })
        return dropUnlinked()
    }

    @Query("SELECT COALESCE(MAX(position), -1) FROM download_group_track WHERE groupId = :groupId")
    protected abstract suspend fun lastPosition(groupId: String): Int

    @Query("DELETE FROM download_group_track WHERE groupId = :groupId AND trackId = :trackId")
    protected abstract suspend fun deleteLink(groupId: String, trackId: Int)

    @Query("SELECT COUNT(*) FROM download_group_track WHERE groupId = :groupId")
    protected abstract suspend fun linkCount(groupId: String): Int

    /** Adds one song to the end of [group], creating it the first time (the single-songs group). */
    @Transaction
    open suspend fun addToGroup(group: DownloadGroup, track: DownloadedTrack) {
        if (group(group.id) == null) putGroup(group)
        putTracks(listOf(track))
        putLinks(listOf(DownloadGroupTrack(group.id, track.trackId, lastPosition(group.id) + 1)))
    }

    /** Takes one song out of [groupId], dropping the group once it is empty, and the song's row if no group holds it. */
    @Transaction
    open suspend fun removeFromGroup(groupId: String, trackId: Int) {
        deleteLink(groupId, trackId)
        if (linkCount(groupId) == 0) deleteGroupRow(groupId)
        dropUnlinked()
    }

    @Query("SELECT * FROM download_group_track WHERE groupId = :groupId ORDER BY position")
    protected abstract suspend fun linksOf(groupId: String): List<DownloadGroupTrack>

    @Query("UPDATE downloaded_track SET albumId = :newId WHERE albumId = :oldId")
    protected abstract suspend fun moveTrackAlbum(oldId: Int, newId: Int)

    /**
     * The server merged album [oldId] into [newId] on a rescan (v0.4): the downloaded album becomes the new one, its
     * songs joining the end of it if that is downloaded too, and songs point at the new album. Nothing is deleted from
     * the phone; the files are keyed by song, which didn't change.
     */
    @Transaction
    open suspend fun moveAlbum(oldId: Int, newId: Int) {
        moveTrackAlbum(oldId, newId)
        val oldGroupId = "album:$oldId"
        val newGroupId = "album:$newId"
        val old = group(oldGroupId) ?: return
        if (group(newGroupId) == null) putGroup(old.copy(id = newGroupId))
        val start = lastPosition(newGroupId) + 1
        val held = linksOf(newGroupId).map { it.trackId }.toSet()
        putLinks(
            linksOf(oldGroupId).filter { it.trackId !in held }
                .mapIndexed { i, link -> DownloadGroupTrack(newGroupId, link.trackId, start + i) },
        )
        deleteLinks(oldGroupId)
        deleteGroupRow(oldGroupId)
    }

    @Query("DELETE FROM download_group")
    protected abstract suspend fun deleteAllGroups()

    @Query("DELETE FROM download_group_track")
    protected abstract suspend fun deleteAllLinks()

    @Query("DELETE FROM downloaded_track")
    protected abstract suspend fun deleteAllTracks()

    @Transaction
    open suspend fun deleteAll() {
        deleteAllLinks()
        deleteAllGroups()
        deleteAllTracks()
    }

    private suspend fun dropUnlinked(): List<Int> {
        val orphans = unlinkedTrackIds()
        if (orphans.isNotEmpty()) deleteTracks(orphans)
        return orphans
    }

    /**
     * Forgets [groupId] and returns the songs no other group still holds: those are the files to delete. [alsoCheck]
     * adds songs with no row of their own, such as an album downloaded before this database existed.
     */
    @Transaction
    open suspend fun deleteGroup(groupId: String, alsoCheck: List<Int> = emptyList()): List<Int> {
        deleteGroupRow(groupId)
        deleteLinks(groupId)
        val orphans = dropUnlinked()
        val stillHeld = linkedTrackIds().toSet()
        return (orphans + alsoCheck.filter { it !in stillHeld }).distinct()
    }
}

/** A play made with no signal, waiting to be sent with the time it happened (A87). */
@Entity(tableName = "pending_play")
data class PendingPlay(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val trackId: Int,
    val msPlayed: Long,
    /** ISO 8601, UTC. */
    val playedAt: String,
    /** Sent with the play so a resend is counted once (C10). Null on rows queued before version 3. */
    val clientPlayId: String? = null,
    /** A song cut short before the threshold (A113). Since version 4. */
    @ColumnInfo(defaultValue = "0") val skipped: Boolean = false,
)

@Dao
interface PendingPlayDao {
    @Insert
    suspend fun add(play: PendingPlay): Long

    @Query("UPDATE pending_play SET msPlayed = :msPlayed WHERE id = :id")
    suspend fun setMsPlayed(id: Long, msPlayed: Long)

    @Query("SELECT * FROM pending_play ORDER BY id")
    suspend fun all(): List<PendingPlay>

    @Query("DELETE FROM pending_play WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("DELETE FROM pending_play")
    suspend fun clear()
}

/** Downloads and, since version 2, plays waiting for signal: both are what the phone keeps for offline use. */
@Database(
    entities = [DownloadedTrack::class, DownloadGroup::class, DownloadGroupTrack::class, PendingPlay::class],
    version = 5,
    exportSchema = false,
)
abstract class DownloadDatabase : RoomDatabase() {
    abstract fun dao(): DownloadDao

    abstract fun pendingPlays(): PendingPlayDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `pending_play` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, " +
                        "`trackId` INTEGER NOT NULL, `msPlayed` INTEGER NOT NULL, `playedAt` TEXT NOT NULL)",
                )
            }
        }

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `pending_play` ADD COLUMN `clientPlayId` TEXT")
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `pending_play` ADD COLUMN `skipped` INTEGER NOT NULL DEFAULT 0")
            }
        }

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `downloaded_track` ADD COLUMN `gainDb` REAL")
            }
        }
    }
}
