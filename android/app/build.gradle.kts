plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.kapt)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.brainlessmusic.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.brainlessmusic.app"
        minSdk = 26
        targetSdk = 34
        // The release workflow passes both from the git tag (v1.2.3 → 10203), so each release installs over the last.
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = (project.findProperty("versionName") as String?) ?: "0.1.0"

        // The one server this app talks to, baked in so login is just a username and password.
        // Override for a dev backend: ./gradlew assembleDebug -PserverUrl=http://10.0.2.2:3000
        val serverUrl = (project.findProperty("serverUrl") as String?) ?: "https://music.nobrainmusic.my"
        buildConfigField("String", "SERVER_URL", "\"$serverUrl\"")

        // Size: both target phones (POCO F5, Xperia 5 V) are arm64, and only English strings are
        // wanted. `-PallAbis` brings back the x86/32-bit libs for an emulator or an old phone.
        resourceConfigurations += "en"
        if (!project.hasProperty("allAbis")) {
            ndk { abiFilters += "arm64-v8a" }
        }
    }

    // The release key (A44) lives outside the repo, in ~/.brainlessmusic-signing and in Actions secrets.
    // Without these env vars a release build falls back to the debug key.
    val releaseKeystore = System.getenv("BRAINLESS_KEYSTORE_PATH")?.takeIf { file(it).exists() }
    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = System.getenv("BRAINLESS_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("BRAINLESS_KEY_ALIAS") ?: "brainlessmusic"
                keyPassword = System.getenv("BRAINLESS_KEY_PASSWORD") ?: System.getenv("BRAINLESS_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        // Its own package, name and file, so a test build sits beside the release app instead of fighting it: the two
        // are signed with different keys, so Android would refuse to install one over the other.
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            // R8 drops the unused ~99% of material-icons-extended, the bulk of the dex.
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    // brainlessmusic-debug.apk instead of app-debug.apk. The release APK keeps its name; the release workflow reads it.
    applicationVariants.all {
        if (buildType.name == "debug") {
            outputs.all {
                (this as com.android.build.gradle.internal.api.BaseVariantOutputImpl).outputFileName = "brainlessmusic-debug.apk"
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        // AGP 8+ defaults this off; NetworkModule reads BuildConfig.DEBUG to
        // gate verbose OkHttp logging.
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = libs.versions.composeCompiler.get()
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

kapt {
    correctErrorTypes = true
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.hilt.android)
    kapt(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    implementation(libs.retrofit.core)
    implementation(libs.retrofit.converter.gson)
    implementation(libs.okhttp.core)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.gson)

    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)

    implementation(libs.coil.compose)

    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.datasource.okhttp)
    implementation(libs.androidx.media3.session)

    implementation(libs.androidx.paging.compose)

    testImplementation(libs.junit)
}
