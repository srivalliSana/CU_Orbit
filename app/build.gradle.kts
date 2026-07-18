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
        versionCode = 14
        versionName = "1.0.13"

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

// AUTOMATION: Copy built APK to server downloads folder
tasks.register<Copy>("publishApkToServer") {
    dependsOn("assembleDebug") // Change to assembleRelease if building for production
    from("build/outputs/apk/debug/app-debug.apk")
    into("../server/downloads")
    rename { "cu_orbit.apk" }
    doLast {
        println("✅ APK successfully copied to server/downloads/cu_orbit.apk")
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
