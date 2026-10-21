# 🍏 Corporate iOS Industrial Development Standards

This document defines enterprise architectural standards, Apple Human Interface Guidelines (HIG), and App Store Review compliance rules for iOS development within the Atabey ecosystem.

## 1. Apple Human Interface Guidelines (HIG) & Typography
- **Minimum Touch Targets:** Every tappable button or interactive element MUST have a minimum hit target area of `44pt × 44pt`.
- **Dynamic Type Support:** Layouts must dynamically expand and adjust when users scale system font sizes for accessibility. Fixed container heights that truncate text are forbidden.
- **Safe Area Insets:** Interfaces must account for the Dynamic Island, home indicator, and status bar using standard safe area guides.
- **Dark Mode Compliance:** All color palettes and UI components must provide seamless semantic dark mode support.

## 2. App Store Review Guidelines & Privacy Compliance
- **Guideline 5.1.1 (Data Privacy):** Every capability requesting user data must include explicit, user-friendly descriptions in `Info.plist` (e.g. `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`).
- **App Tracking Transparency (ATT):** If user activity is tracked across third-party apps or websites, `requestTrackingAuthorization()` must be requested with clear rationale.
- **Sign in with Apple:** Any app offering third-party social login (Google, Facebook, Twitter) MUST also offer "Sign in with Apple" with equivalent prominence.
- **Account Deletion (Guideline 5.1.1v):** Apps allowing account creation must provide an easily accessible, in-app mechanism to permanently delete the account and associated data.

## 3. Apple Privacy Manifest (PrivacyInfo.xcprivacy)
- **Mandatory Privacy Manifest:** iOS apps must bundle a root `PrivacyInfo.xcprivacy` declaring:
  - All collected data types and their business purposes.
  - Required Reason APIs used (including `NSPrivacyAccessedAPICategoryUserDefaults`, `NSPrivacyAccessedAPICategoryFileTimestamp`, `NSPrivacyAccessedAPICategoryDiskSpace`).
- **Third-Party SDK Tracking:** Ensure all third-party CocoaPods/SPM dependencies include compliant privacy manifests.

## 4. Memory Management & Jetsam Termination Protection
- **Jetsam Kill Avoidance:** iOS aggressively terminates applications exceeding strict memory thresholds via the Jetsam daemon.
- **Image Cache Boundaries:** High-resolution bitmaps must be downsampled and strictly capped in memory cache size. Evict image caches upon receiving `UIApplicationDidReceiveMemoryWarningNotification`.
- **Autoreleasepool Discipline:** Heavy iterative loops processing media or files must wrap processing in autorelease pools.

## 5. Security & Keychain Storage
- **No Plaintext Tokens:** Storing authentication tokens, JWTs, or passwords in `UserDefaults` or unencrypted `AsyncStorage` is strictly forbidden.
- **Keychain & Secure Enclave:** Sensitive credentials must be encrypted and persisted using the iOS Keychain services with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.

## 6. Apple Push Notification service (APNs)
- **APNs Auth Key (.p8):** Use token-based `.p8` authentication keys with indefinite validity rather than expiring `.p12` certificates.
- **UNUserNotificationCenter Handling:** Implement foreground presentation options (`.banner`, `.sound`, `.badge`) and user response handling centrally.
- **Silent Push Constraints:** Silent background notifications (`content-available: 1`) must set `apns-priority: 5` and observe Apple's background power budget.
- **Notification Service Extension:** Rich media push attachments and end-to-end encrypted notification payloads must be decrypted within a 30-second isolated Notification Service Extension.
- **dSYM & Crash Analytics:** Upload unstripped dSYM symbol archives to crash tracking backends (Crashlytics/Sentry) for every release build.
