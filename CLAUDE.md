# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Anonymous feedback platform (package name `anonymous-feedback`, branded **Feedbacker.io**, repo **SignalHQ**). Users sign up, get a shareable link, and receive anonymous messages — optionally tied to specific feedback "questions".

## Commands

```bash
npm run dev        # Next.js dev server with Turbopack (http://localhost:3000)
npm run build      # Production build
npm run start      # Serve production build
npm run lint       # ESLint (eslint-config-next)
npm run analyze    # Build with bundle analyzer (ANALYZE=true)
```

There is no test runner configured. `npm run lighthouse` and `npm run seo-check` are SEO helper scripts (require a running prod server).

## Stack

- **Next.js 15 App Router** (`app/`), **React 19**, **TypeScript** (strict), **Tailwind CSS v4** (via `@tailwindcss/postcss`, no `tailwind.config` — config is CSS-first in `app/globals.css`).
- **MongoDB via Mongoose**, **NextAuth** (credentials + JWT), **Resend** for transactional email, **Zod** + **react-hook-form** for validation, **shadcn/Radix UI** primitives in `components/ui/`, **sonner** for toasts.
- Path alias: `@/*` maps to repo root (e.g. `@/lib/connectDB`, `@/models/user.model`).

## Architecture

### Data layer (`models/`, `lib/connectDB.ts`)
- Every API route handler must call `await connectDB()` before any DB access. `connectDB` is a singleton guarded by a module-level `connection.isConnected` flag — do not create connections elsewhere.
- All models follow the pattern `mongoose.models.X || mongoose.model("X", schema)` to survive hot-reload/serverless re-imports. Keep this guard when adding models.
- **Mongoose `populate` gotcha:** a route that populates a ref must ensure the referenced model is registered in that module. See `app/api/getMessages/route.ts` which does a bare `import "@/models/message.model"` purely to register the `Message` model before populating `User.messages`. Replicate this when populating.
- Core models: `User` (auth, `messages` array of ObjectId refs, `isAcceptingMessages`, verify/reset OTP fields), `Message` (`createdFor` → User, optional `questionId` → Question), `Question` (per-user feedback prompt with unique `nanoid(8)` `slug`, `responseCount`).
- **Multi-tenant migration (in progress — SignalHQ):** the app is evolving from `User`-owned data to `Organization`-owned data (`Organization` → Members/Teams/Questions/Messages). `Organization` (editable `name`, immutable unique `slug`, `createdBy`) and `Membership` (`organizationId` + `userId` + `role: OWNER|ADMIN|MEMBER`, unique compound index, roles live on the membership) are the new owners. `Question` and `Message` now carry an **optional `organizationId`** ref — additive and nullable during migration, to be backfilled (personal org per existing user) and made required later. Switch reads to org-scoping only **after** backfill. Naming is American ("Organization", collection `organizations`); active org currently resolves to the user's personal org (switcher comes later).

### Auth (`lib/nextAuthOptions.tsx`, `app/api/auth/[...nextauth]/route.ts`)
- Credentials provider only; login by email **or** username (`$or` query), bcrypt password compare, blocks unverified users.
- JWT session strategy. Custom fields (`_id`, `username`, `isVerified`, `isAcceptingMessages`, `name`) are threaded through the `jwt` and `session` callbacks and typed in `types/next-auth.d.ts` — update all three when adding a session field.
- Server-side: gate routes/pages with `getServerSession(authOptions)`.
- Note: `pages.signIn` is `/Login` but the actual route is `app/login/` — be careful with casing on redirects.

### API conventions (`app/api/`)
- Route handlers return `NextResponse.json(...)`. Many existing handlers return `{ success, error/message }` with a **200 status even on logical failure** (e.g. `sendMessage`, `getMessages`) — newer handlers (`questions/`) use proper status codes (401/400/500). Prefer the status-code style for new code, but check what the calling client expects.
- Input validation uses Zod schemas from `schemas/` (`createQuestionSchema.safeParse(body)`, etc.).
- `app/api/suggestMessages/route.ts` is currently **stubbed** — returns a hardcoded string; the real OpenAI/`ai`-SDK implementation is commented out.

### Email (`lib/mailService.ts`, `emailTemplates/`)
- `sendEmail({ email, mailType, otpCode })` uses Resend with React email templates (`emailTemplates/*.tsx`). `mailType` is `"VERIFY"` or reset-password; sender/domain are hardcoded.

### Frontend
- `app/layout.tsx` is the root: wraps everything in `SessionWrapper` (NextAuth provider), injects Navbar/Footer/Toaster, JSON-LD scripts, and Google Analytics + Microsoft Clarity (gated on `NEXT_PUBLIC_GA_ID` / `NEXT_PUBLIC_CLARITY_ID`). Use the `useAnalytics()` hook's `trackEvent` for custom events.
- Public feedback pages: `app/u/[username]/` and `app/q/[slug]/` (question-specific). Authed area: `app/dashboard/` (`old-page.tsx` is a superseded version).
- **SEO is a first-class concern:** `lib/seo.ts` (`seoConfig`), `lib/metadata.ts` (`generateMetadata`, `generateJsonLd`), plus `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts`. Update these together when changing site identity/routes.

## Environment variables

Required at runtime (no `.env.example` committed): `MONGODB_URI`, `NEXTAUTH_SECRET`, `RESEND_API_KEY`, `NEXT_PUBLIC_BASE_URL`, and optional analytics IDs `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_CLARITY_ID`. External image hosts must be whitelisted in `next.config.ts` `images.domains`.
