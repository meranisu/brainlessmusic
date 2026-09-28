# Gson fills these by reflecting on field names; R8 renaming them would make every
# response parse to nulls. (Retrofit, OkHttp, Media3, Hilt and Coil ship their own consumer rules.)
-keepattributes Signature, *Annotation*
-keep class com.brainlessmusic.app.data.remote.dto.** { *; }
