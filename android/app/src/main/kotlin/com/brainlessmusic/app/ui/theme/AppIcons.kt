package com.brainlessmusic.app.ui.theme

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.PlaylistAdd
import androidx.compose.material.icons.automirrored.filled.PlaylistPlay
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.DataSaverOff
import androidx.compose.material.icons.filled.DataSaverOn
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.DownloadDone
import androidx.compose.material.icons.filled.DownloadForOffline
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.TouchApp
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.outlined.Info
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.vector.ImageVector
import com.brainlessmusic.app.data.local.Skin

/**
 * Every icon the app draws, by what it means, in the skin's set: Material under Standard, Font Awesome (as osu!
 * uses) under Hit circle. Screens use these instead of `Icons.*`, so a new skin swaps icons in one place.
 */
object AppIcons {
    val play: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.PlayArrow, OsuIcons.Play)
    val back: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.ArrowBack, OsuIcons.Back)
    val shuffle: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Shuffle, OsuIcons.Shuffle)
    val download: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Download, OsuIcons.Download)
    val search: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Search, OsuIcons.Search)
    val pause: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Pause, OsuIcons.Pause)
    val downloadDone: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.DownloadDone, OsuIcons.CircleCheck)
    val more: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.MoreVert, OsuIcons.More)
    val favorite: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Favorite, OsuIcons.Heart)
    val queue: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.QueueMusic, OsuIcons.Queue)
    val previous: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.SkipPrevious, OsuIcons.Previous)
    val next: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.SkipNext, OsuIcons.Next)
    val favoriteBorder: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.FavoriteBorder, OsuIcons.HeartOutline)
    val error: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.ErrorOutline, OsuIcons.Error)
    val downloads: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.DownloadForOffline, OsuIcons.CircleDown)
    val close: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Close, OsuIcons.Close)
    val album: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Album, OsuIcons.Disc)
    val lessOften: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.TrendingDown, OsuIcons.TrendDown)
    val playlistAdd: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.PlaylistAdd, OsuIcons.AddToList)
    val person: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Person, OsuIcons.User)
    val library: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.LibraryMusic, OsuIcons.Music)
    val groups: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Groups, OsuIcons.Users)
    val dragHandle: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.DragHandle, OsuIcons.Grip)
    val delete: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Delete, OsuIcons.Trash)
    val clear: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Clear, OsuIcons.CircleClose)
    val add: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Add, OsuIcons.Plus)
    val info: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Outlined.Info, OsuIcons.Info)
    val visibilityOff: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.VisibilityOff, OsuIcons.EyeSlash)
    val visibility: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Visibility, OsuIcons.Eye)
    val touch: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.TouchApp, OsuIcons.Hand)
    val update: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.SystemUpdate, OsuIcons.Update)
    val settings: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Settings, OsuIcons.Gear)
    val repeatOne: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.RepeatOne, OsuIcons.RepeatOne)
    val repeat: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Repeat, OsuIcons.Repeat)
    val refresh: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Refresh, OsuIcons.Refresh)
    val playCircle: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.PlayCircle, OsuIcons.CirclePlay)
    val palette: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Palette, OsuIcons.Palette)
    val arrowDown: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.KeyboardArrowDown, OsuIcons.ChevronDown)
    val home: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Home, OsuIcons.House)
    val history: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.History, OsuIcons.History)
    val dataSaverOn: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.DataSaverOn, OsuIcons.Leaf)
    val dataSaverOff: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.DataSaverOff, OsuIcons.Leaf)
    val cloudOff: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.CloudOff, OsuIcons.Cloud)
    val checkCircle: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.CheckCircle, OsuIcons.CircleCheck)
    val check: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Check, OsuIcons.Check)
    val account: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.AccountCircle, OsuIcons.CircleUser)
    val sort: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.Sort, OsuIcons.Sort)
    val playlistPlay: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.PlaylistPlay, OsuIcons.ListPlay)
    val logout: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.Logout, OsuIcons.Logout)
    val arrowRight: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.KeyboardArrowRight, OsuIcons.ChevronRight)
}

@Composable
@ReadOnlyComposable
private fun pick(material: ImageVector, osu: ImageVector): ImageVector = when (LocalSkin.current) {
    Skin.STANDARD -> material
    Skin.HIT_CIRCLE -> osu
}
