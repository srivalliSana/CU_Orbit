import java.net.HttpURLConnection
import java.net.URL

plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.example.cu_orbit"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.example.cu_orbit"
        minSdk = 24
        targetSdk = 36
        versionCode = 23
        versionName = "1.0.22"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

// AUTOMATION: Copy built APK to server downloads folder and register version
tasks.register("publishApkToServer") {
    group = "distribution"
    description = "Builds the APK, copies it to server, and registers the release"
    dependsOn("assembleDebug")

    // Capture values during configuration to be compatible with Configuration Cache
    val versionName = android.defaultConfig.versionName ?: "1.0.0"
    val versionCode = android.defaultConfig.versionCode ?: 1
    val sourceApk = layout.buildDirectory.file("outputs/apk/debug/app-debug.apk")
    val destDirectory = layout.projectDirectory.dir("../server/downloads")

    doLast {
        val version = versionName
        val build = versionCode
        val fileName = "cu_orbit_v$version.apk"
        val sourceFile = sourceApk.get().asFile
        val destDir = destDirectory.asFile
        
        if (!destDir.exists()) destDir.mkdirs()
        
        // 1. Copy the file
        sourceFile.copyTo(File(destDir, fileName), overwrite = true)
        sourceFile.copyTo(File(destDir, "cu_orbit.apk"), overwrite = true)
        
        println("✅ APK copied as $fileName and cu_orbit.apk")
        
        // 2. Register via API
        try {
            val url = URL("https://cumess.cutm.ac.in/api/system/register-release")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.doOutput = true
            
            val json = """{"version": "$version", "build_number": $build, "filename": "$fileName"}"""
            conn.outputStream.use { it.write(json.toByteArray(Charsets.UTF_8)) }
            
            if (conn.responseCode == 200) {
                println("🚀 Release v$version registered on server!")
            } else {
                println("⚠️ Server returned code: ${conn.responseCode}")
            }
        } catch (e: Exception) {
            println("❌ Failed to register release: ${e.message}")
        }
    }
}

dependencies {
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.constraintlayout)
    implementation(libs.androidx.core.ktx)
    implementation(libs.material)
    implementation(libs.androidx.navigation.fragment.ktx)
    implementation(libs.androidx.navigation.ui.ktx)
    implementation(libs.retrofit)
    implementation(libs.converter.gson)
    implementation(libs.okhttp)
    implementation(libs.logging.interceptor)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.androidx.lifecycle.livedata.ktx)
    implementation("com.google.android.gms:play-services-auth:21.2.0")
    implementation("io.coil-kt:coil:2.5.0")
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
}
