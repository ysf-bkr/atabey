# 📱 Corporate Mobile Development Standards (React Native / Expo)

This document defines the strict rules and performance standards in mobile application development processes.

## 1. Technology Stack and Structure
- **Framework:** Expo (Managed Workflow) and React Native.
- **Styling:** `react-native-reanimated` and type-safe style objects or Tailwind (NativeWind).
- **Navigation:** Expo Router (File-based navigation) and Safe Link structures.

## 2. Design for Every Screen (Responsive Mobile Layout)
- **Screen Resolution Independence:** Fixed `px` widths and heights should never be used. Instead, flexbox ratios, percentage widths, and dynamic values from the `useWindowDimensions` hook should be used.
- **SafeArea Security:** All screen structures must be wrapped with `SafeAreaProvider` and `SafeAreaView` (or dynamic `insets` object) from `react-native-safe-area-context` to prevent collision with notched screens, status bars, and home indicators.
- **Font Sizes and Accessibility:** To prevent text truncation or overflow when system font sizes are changed (Accessibility Font Scaling), `numberOfLines` / `ellipsizeMode` should be used in `Text` components or containers providing dynamic height should be designed.
- **Orientation Adaptation:** Interfaces should be adaptable to both portrait and landscape usage scenarios; especially on tablets, double-column (Master-Detail) or Grid layouts should be adjusted based on dynamic screen aspect ratios.

## 3. Performance and Fluidity
- **Performant Lists:** To maintain performance in large data lists, `FlashList` (Shopify) must be used instead of `ScrollView` or `FlatList`.
- **Image Resources:** Images should be cached with `expo-image`, WebP formats should be preferred for fast loading, and aspect ratios (`contentFit`) should be preserved when scaling.
- **Touch Targets:** All touch interaction areas must be at least `44dp x 44dp`.

## 4. Hardware and Offline Operation
- **Permissions:** Sensitive permissions (location, camera, notifications) should only be requested when the feature is used, and the reason should be clearly shown to the user.
- **Offline First:** Network requests should be cached with `React Query`; MMKV (or SQLite) should be used for local persistent storage.
