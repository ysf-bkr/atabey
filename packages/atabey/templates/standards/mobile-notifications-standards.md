# 🔔 Corporate Mobile Push Notification Standards (FCM & APNs)

This document standardizes push notification architecture across Android, iOS, React Native, and Flutter codebases.

## 1. Firebase Cloud Messaging (FCM) HTTP v1 Protocol
- **OAuth2 Bearer Authentication:** The legacy FCM server key (`https://fcm.googleapis.com/fcm/send`) is completely banned. All notification dispatches must use the Firebase HTTP v1 REST API (`https://fcm.googleapis.com/v1/projects/{project_id}/messages:send`).
- **Service Account Security:** The Firebase private service account key must NEVER be stored in the source code repository or client application bundles. It must reside strictly in the Atabey Secret Vault or secure backend key management service.
- **Short-Lived Tokens:** Dispatchers must rotate Google OAuth2 Bearer tokens every 60 minutes using JWT self-signing.

## 2. Notification Payloads & Architecture
- **Data vs Notification Payloads:** Prefer `data` payloads over `notification` payloads when custom routing, silent background synchronization, or client-side UI rendering is required.
- **Payload Size Limits:** Total payload size must not exceed 4096 bytes (4 KB).
- **Token Lifecycle Management:** All client apps must implement `onNewToken` listeners to synchronize regenerated push tokens with the server database immediately upon token invalidation.

## 3. Platform Specific Mandates
- **Android Notification Channels:** Every notification must be categorized into a predefined `NotificationChannel` with appropriate importance (`IMPORTANCE_HIGH` for orders/alerts, `IMPORTANCE_LOW` for news/marketing).
- **iOS APNs Auth Key (.p8):** Server backends communicating with APNs must use single-key token authentication (`.p8`) rather than annual renewal `.p12` certificates.
- **Notification Service Extension (Rich Push / E2EE):** For end-to-end encrypted notifications or remote media attachments (images, audio), implement an isolated iOS Notification Service Extension with a strict 30-second execution window.
- **Silent Push Budgeting:** Silent notifications (`content-available: 1` on iOS, high-frequency data messages on Android) must be rate-limited to avoid system-level background execution throttling.
