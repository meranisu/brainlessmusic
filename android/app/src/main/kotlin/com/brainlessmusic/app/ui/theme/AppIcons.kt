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
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.PhotoCamera
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
 * uses) under Hit circle, Lucide line icons under Lane, Phosphor under Gear, MingCute under Ring. Screens use these instead of `Icons.*`, so a new skin swaps icons in one place.
 */
object AppIcons {
    val play: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.PlayArrow, OsuIcons.Play, LaneIcons.Play, GearIcons.Play, RingIcons.Play)
    val back: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.ArrowBack, OsuIcons.Back, LaneIcons.Back, GearIcons.Back, RingIcons.Back)
    val shuffle: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Shuffle, OsuIcons.Shuffle, LaneIcons.Shuffle, GearIcons.Shuffle, RingIcons.Shuffle)
    val download: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Download, OsuIcons.Download, LaneIcons.Download, GearIcons.Download, RingIcons.Download)
    val search: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Search, OsuIcons.Search, LaneIcons.Search, GearIcons.Search, RingIcons.Search)
    val pause: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Pause, OsuIcons.Pause, LaneIcons.Pause, GearIcons.Pause, RingIcons.Pause)
    val downloadDone: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.DownloadDone, OsuIcons.CircleCheck, LaneIcons.CircleCheck, GearIcons.CircleCheck, RingIcons.CircleCheck)
    val more: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.MoreVert, OsuIcons.More, LaneIcons.More, GearIcons.More, RingIcons.More)
    val favorite: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Favorite, OsuIcons.Heart, LaneIcons.Heart, GearIcons.Heart, RingIcons.Heart)
    val queue: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.QueueMusic, OsuIcons.Queue, LaneIcons.Queue, GearIcons.Queue, RingIcons.Queue)
    val previous: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.SkipPrevious, OsuIcons.Previous, LaneIcons.Previous, GearIcons.Previous, RingIcons.Previous)
    val next: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.SkipNext, OsuIcons.Next, LaneIcons.Next, GearIcons.Next, RingIcons.Next)
    val favoriteBorder: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.FavoriteBorder, OsuIcons.HeartOutline, LaneIcons.HeartOutline, GearIcons.HeartOutline, RingIcons.HeartOutline)
    val error: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.ErrorOutline, OsuIcons.Error, LaneIcons.Error, GearIcons.Error, RingIcons.Error)
    val downloads: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.DownloadForOffline, OsuIcons.CircleDown, LaneIcons.CircleDown, GearIcons.CircleDown, RingIcons.CircleDown)
    val close: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Close, OsuIcons.Close, LaneIcons.Close, GearIcons.Close, RingIcons.Close)
    val album: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Album, OsuIcons.Disc, LaneIcons.Disc, GearIcons.Disc, RingIcons.Disc)
    val lessOften: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.TrendingDown, OsuIcons.TrendDown, LaneIcons.TrendDown, GearIcons.TrendDown, RingIcons.TrendDown)
    val playlistAdd: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.PlaylistAdd, OsuIcons.AddToList, LaneIcons.AddToList, GearIcons.AddToList, RingIcons.AddToList)
    val person: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Person, OsuIcons.User, LaneIcons.User, GearIcons.User, RingIcons.User)
    val library: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.LibraryMusic, OsuIcons.Music, LaneIcons.Music, GearIcons.Music, RingIcons.Music)
    val headphones: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Headphones, OsuIcons.Headphones, LaneIcons.Headphones, GearIcons.Headphones, RingIcons.Headphones)
    val camera: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.PhotoCamera, OsuIcons.Camera, LaneIcons.Camera, GearIcons.Camera, RingIcons.Camera)
    val dragHandle: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.DragHandle, OsuIcons.Grip, LaneIcons.Grip, GearIcons.Grip, RingIcons.Grip)
    val delete: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Delete, OsuIcons.Trash, LaneIcons.Trash, GearIcons.Trash, RingIcons.Trash)
    val clear: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Clear, OsuIcons.CircleClose, LaneIcons.CircleClose, GearIcons.CircleClose, RingIcons.CircleClose)
    val add: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Add, OsuIcons.Plus, LaneIcons.Plus, GearIcons.Plus, RingIcons.Plus)
    val info: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Outlined.Info, OsuIcons.Info, LaneIcons.Info, GearIcons.Info, RingIcons.Info)
    val visibilityOff: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.VisibilityOff, OsuIcons.EyeSlash, LaneIcons.EyeSlash, GearIcons.EyeSlash, RingIcons.EyeSlash)
    val visibility: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Visibility, OsuIcons.Eye, LaneIcons.Eye, GearIcons.Eye, RingIcons.Eye)
    val touch: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.TouchApp, OsuIcons.Hand, LaneIcons.Hand, GearIcons.Hand, RingIcons.Hand)
    val update: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.SystemUpdate, OsuIcons.Update, LaneIcons.Update, GearIcons.Update, RingIcons.Update)
    val settings: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Settings, OsuIcons.Gear, LaneIcons.Gear, GearIcons.Gear, RingIcons.Gear)
    val repeatOne: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.RepeatOne, OsuIcons.RepeatOne, LaneIcons.RepeatOne, GearIcons.RepeatOne, RingIcons.RepeatOne)
    val repeat: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Repeat, OsuIcons.Repeat, LaneIcons.Repeat, GearIcons.Repeat, RingIcons.Repeat)
    val refresh: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Refresh, OsuIcons.Refresh, LaneIcons.Refresh, GearIcons.Refresh, RingIcons.Refresh)
    val playCircle: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.PlayCircle, OsuIcons.CirclePlay, LaneIcons.CirclePlay, GearIcons.CirclePlay, RingIcons.CirclePlay)
    val palette: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Palette, OsuIcons.Palette, LaneIcons.Palette, GearIcons.Palette, RingIcons.Palette)
    val arrowDown: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.KeyboardArrowDown, OsuIcons.ChevronDown, LaneIcons.ChevronDown, GearIcons.ChevronDown, RingIcons.ChevronDown)
    val home: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Home, OsuIcons.House, LaneIcons.House, GearIcons.House, RingIcons.House)
    val history: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.History, OsuIcons.History, LaneIcons.History, GearIcons.History, RingIcons.History)
    val dataSaverOn: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.DataSaverOn, OsuIcons.Leaf, LaneIcons.Leaf, GearIcons.Leaf, RingIcons.Leaf)
    val dataSaverOff: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.DataSaverOff, OsuIcons.Leaf, LaneIcons.Leaf, GearIcons.Leaf, RingIcons.Leaf)
    val cloudOff: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.CloudOff, OsuIcons.Cloud, LaneIcons.Cloud, GearIcons.Cloud, RingIcons.Cloud)
    val checkCircle: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.CheckCircle, OsuIcons.CircleCheck, LaneIcons.CircleCheck, GearIcons.CircleCheck, RingIcons.CircleCheck)
    val check: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.Check, OsuIcons.Check, LaneIcons.Check, GearIcons.Check, RingIcons.Check)
    val account: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.Filled.AccountCircle, OsuIcons.CircleUser, LaneIcons.CircleUser, GearIcons.CircleUser, RingIcons.CircleUser)
    val sort: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.Sort, OsuIcons.Sort, LaneIcons.Sort, GearIcons.Sort, RingIcons.Sort)
    val playlistPlay: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.PlaylistPlay, OsuIcons.ListPlay, LaneIcons.ListPlay, GearIcons.ListPlay, RingIcons.ListPlay)
    val logout: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.Logout, OsuIcons.Logout, LaneIcons.Logout, GearIcons.Logout, RingIcons.Logout)
    val arrowRight: ImageVector @Composable @ReadOnlyComposable get() = pick(Icons.AutoMirrored.Filled.KeyboardArrowRight, OsuIcons.ChevronRight, LaneIcons.ChevronRight, GearIcons.ChevronRight, RingIcons.ChevronRight)
}

@Composable
@ReadOnlyComposable
private fun pick(material: ImageVector, osu: ImageVector, lane: ImageVector, gear: ImageVector, ring: ImageVector): ImageVector = when (LocalSkin.current) {
    Skin.STANDARD -> material
    Skin.HIT_CIRCLE -> osu
    Skin.LANE -> lane
    Skin.GEAR -> gear
    Skin.RING -> ring
}
