# ⚛️ Corporate Next.js Standards

This document defines the architectural and coding standards for Next.js (App Router) applications.

## 1. Architecture Standards
- **App Router First:** Use the App Router (`app/` directory) exclusively. Page router is deprecated.
- **Server Component Default:** All components are React Server Components (RSC) by default. Add `"use client"` only when client-side interactivity, state, or effects are strictly required.
- **Route Handlers:** Place API routes under `app/api/` and follow route handler signatures (`GET`, `POST`, etc.).

## 2. Performance & SEO
- **Metadata API:** Use the static or dynamic Metadata API for title/SEO tag definition.
- **Image Optimization:** Always use next/image `<Image>` with explicit width/height or fluid placeholders.
- **Layouts & Suspense:** Implement structured layouts and wrap slower fetching components in `<Suspense>` with skeleton UI fallbacks.
