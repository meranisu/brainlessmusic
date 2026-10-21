# Gson fills these by reflecting on field names; R8 renaming them would make every
# response parse to nulls. (Retrofit, OkHttp, Media3, Hilt and Coil ship their own consumer rules.)
-keepattributes Signature, *Annotation*
-keep class com.brainlessmusic.app.data.remote.dto.** { *; }
# The room snapshot from the Listen together socket, parsed the same way.
-keep class com.brainlessmusic.app.rooms.RoomState { *; }
-keep class com.brainlessmusic.app.rooms.RoomEntry { *; }
-keep class com.brainlessmusic.app.rooms.RoomMember { *; }
-keep class com.brainlessmusic.app.rooms.RoomPlayback { *; }
-keep class com.brainlessmusic.app.rooms.RoomSettings { *; }
-keep class com.brainlessmusic.app.rooms.RoomSkipVote { *; }
# GitHub's releases JSON for the in-app updater, parsed the same way.
-keep class com.brainlessmusic.app.update.GithubRelease { *; }
-keep class com.brainlessmusic.app.update.GithubAsset { *; }
