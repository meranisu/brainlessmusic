package com.brainlessmusic.app.downloads

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

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

@Dao
abstract class DownloadDao {
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

    /** Saves [group] with exactly [tracks], in order; downloading it again replaces its old song list. */
    @Transaction
    open suspend fun saveGroup(group: DownloadGroup, tracks: List<DownloadedTrack>) {
        putGroup(group)
        putTracks(tracks)
        deleteLinks(group.id)
        putLinks(tracks.mapIndexed { i, t -> DownloadGroupTrack(group.id, t.trackId, i) })
    }

    /**
     * Forgets [groupId] and returns the songs no other group still holds: those are the files to delete. [alsoCheck]
     * adds songs with no row of their own, such as an album downloaded before this database existed.
     */
    @Transaction
    open suspend fun deleteGroup(groupId: String, alsoCheck: List<Int> = emptyList()): List<Int> {
        deleteGroupRow(groupId)
        deleteLinks(groupId)
        val orphans = unlinkedTrackIds()
        if (orphans.isNotEmpty()) deleteTracks(orphans)
        val stillHeld = linkedTrackIds().toSet()
        return (orphans + alsoCheck.filter { it !in stillHeld }).distinct()
    }
}

@Database(
    entities = [DownloadedTrack::class, DownloadGroup::class, DownloadGroupTrack::class],
    version = 1,
    exportSchema = false,
)
abstract class DownloadDatabase : RoomDatabase() {
    abstract fun dao(): DownloadDao
}
