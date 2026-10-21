# 🤖 Corporate Android Industrial Development Standards

This document establishes enterprise-grade engineering standards, operating system lifecycle rules, and Google Play Store compliance mandates for Android development within the Atabey ecosystem.

## 1. Operating System Lifecycle & Process Death
- **Process Death Resilience:** The Android OS terminates background app processes under memory pressure without warning. All view models and screens MUST survive process termination using `SavedStateHandle` or deterministic local storage (DataStore / SQLite).
- **No In-Memory Singletons for State:** Crucial session or wizard progress state must never rely exclusively on in-memory static variables.
- **Configuration Change Handling:** Screen rotation and fold/unfold events must not trigger redundant network refetches or state loss.

## 2. Background Execution & WorkManager
- **Foreground Service Restrictions (Android 12+):** Uncontrolled background threads and unprompted foreground services are forbidden.
- **Deferrable Work via WorkManager:** All background sync, upload, and batch processing tasks MUST use `WorkManager` with explicit constraints (`NetworkType.CONNECTED`, `RequiresCharging`).
- **Exact Alarms Policy:** Use exact alarms only when building calendar or alarm applications requiring `SCHEDULE_EXACT_ALARM`.

## 3. Granular Runtime Permissions (Android 13 / 14 / 15)
- **POST_NOTIFICATIONS (Android 13+):** Runtime permission must be requested contextually before sending push messages. If denied, the app must continue functioning smoothly.
- **Selected Photos Access (Android 14+):** Support `READ_MEDIA_VISUAL_USER_SELECTED` alongside `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO`. Never demand broad `READ_EXTERNAL_STORAGE`.
- **Just-In-Time Prompts:** Never ask for permissions at app launch. Explain the purpose immediately prior to the user action.

## 4. Packaging, Build Optimization & Security
- **Mandatory Android App Bundle (AAB):** All release builds distributed to Google Play must be packaged as `.aab`. Raw APK distribution is restricted to internal sideload testing using `bundletool`.
- **R8 / ProGuard Minification:** Release builds MUST enable `minifyEnabled true` and `shrinkResources true`.
- **Keep Rules Integrity:** All serialization models (Zod, Moshi, Kotlinx, Gson) and reflection targets must be annotated with `@Keep` or specified in `proguard-rules.pro`.
- **Keystore Protection:** `.keystore` and `upload-keystore.jks` files must NEVER be committed to Git. Store signing credentials in the secure vault or CI/CD environment secrets.
- **16 KB Memory Page Size Support (Android 15+):** All C/C++ native libraries (NDK binaries, SQLite drivers) must be built with 16 KB page-alignment (`-Wl,-z,max-page-size=16384`).
- **Play Integrity API:** Enforce application authenticity and tamper protection via Play Integrity (`MEETS_DEVICE_INTEGRITY`) for high-security endpoints.

## 5. Firebase Cloud Messaging (FCM) Standards
- **Firebase HTTP v1 API Only:** The deprecated Legacy FCM Server Key is forbidden. All push requests must authenticate using short-lived OAuth2 tokens via Firebase HTTP v1 API.
- **Notification Channels (Android 8.0+):** Every push notification must target an explicit `NotificationChannel` with defined importance, vibration, and audio traits.
- **Notification Trampoline Ban (Android 12+):** Tapping notifications must directly launch target Activities via explicit `PendingIntent`. Launching intermediary broadcast receivers or services is prohibited.
- **Isolated Background Task:** The `onBackgroundMessage` handler must run in an isolated headless thread and never block the main UI thread.
