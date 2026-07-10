import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

val localProperties = Properties().apply {
    val localPropertiesFile = rootProject.file("local.properties")
    if (localPropertiesFile.isFile) {
        localPropertiesFile.inputStream().use(::load)
    }
}

val baseUrl = (
    providers.gradleProperty("BASE_URL").orNull
        ?: localProperties.getProperty("BASE_URL")
        ?: "http://10.0.2.2:3000"
).trim().trimEnd('/') + "/"

val generatedApiConfigDir = layout.buildDirectory.dir("generated/apiConfig/commonMain/kotlin")
val generatedApiConfigFile = generatedApiConfigDir.map {
    it.file("com/jetbrains/kmpapp/data/GeneratedApiConfig.kt")
}
val generateApiConfig by tasks.registering {
    inputs.property("baseUrl", baseUrl)
    outputs.file(generatedApiConfigFile)

    doLast {
        val outputFile = outputs.files.singleFile
        val configuredBaseUrl = inputs.properties["baseUrl"] as String
        val kotlinStringBaseUrl = configuredBaseUrl
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("$", "\\$")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
        outputFile.parentFile.mkdirs()
        outputFile.writeText(
            """
            package com.jetbrains.kmpapp.data

            /** Generated from BASE_URL in local.properties (or the Gradle property). */
            internal const val GENERATED_BASE_URL = "$kotlinStringBaseUrl"
            """.trimIndent() + "\n"
        )
    }
}

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidMultiplatformLibrary)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.kotlinxSerialization)
}

kotlin {
    listOf(
        iosArm64(),
        iosSimulatorArm64()
    ).forEach { iosTarget ->
        iosTarget.binaries.framework {
            baseName = "Shared"
            isStatic = true
        }
    }

    androidLibrary {
        namespace = "com.jetbrains.kmpapp.shared"
        compileSdk = libs.versions.android.compileSdk.get().toInt()
        minSdk = libs.versions.android.minSdk.get().toInt()

        compilerOptions {
            jvmTarget = JvmTarget.JVM_11
        }
        androidResources {
            enable = true
        }
    }

    sourceSets {
        commonMain {
            kotlin.srcDir(generatedApiConfigDir)
        }

        androidMain.dependencies {
            implementation(libs.compose.uiToolingPreview)
            implementation(libs.androidx.activity.compose)
            implementation(libs.ktor.client.okhttp)
            implementation(project.dependencies.platform("com.google.firebase:firebase-bom:34.15.0"))
            implementation(libs.firebase.messaging)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
        }
        commonMain.dependencies {
            implementation(libs.compose.runtime)
            implementation(libs.compose.foundation)
            implementation(libs.compose.material3)
            implementation(libs.compose.ui)
            implementation(libs.compose.components.resources)
            implementation(libs.compose.uiToolingPreview)

            implementation(libs.navigation.compose)
            implementation(libs.androidx.lifecycle.runtimeCompose)
            implementation(libs.compose.material.icons.core)
            implementation(libs.compose.material.icons.extended)

            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.content.negotiation)
            implementation(libs.ktor.serialization.kotlinx.json)

            implementation(libs.coil.compose)
            implementation(libs.coil.network.ktor)
            implementation(libs.koin.core)
            implementation(libs.koin.compose.viewmodel)
        }
    }
}

tasks.configureEach {
    if (name.startsWith("compile") && name.contains("Kotlin")) {
        dependsOn(generateApiConfig)
    }
}

dependencies {
    androidRuntimeClasspath(libs.compose.uiTooling)
}
