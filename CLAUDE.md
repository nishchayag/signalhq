# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Anonymous feedback platform (package name `anonymous-feedback`, branded **SignalHQ**, repo also **SignalHQ**). Users sign up, get a shareable link, and receive anonymous messages — optionally tied to specific feedback "questions". The app is mid-migration from single-user ownership to a multi-tenant Organization/Team model (see below).

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

- **Next.js 16 App Router** (`app/`, Turbopack by default for both `dev` and `build`), **React 19**, **TypeScript** (strict), **Tailwind CSS v4** (via `@tailwindcss/postcss`, no `tailwind.config` — config is CSS-first in `app/globals.css`).
- `next-auth@4` declares a peer range that excludes Next 16 (stale package.json, not a real incompatibility — verified via live login/session/proxy testing). `.npmrc` sets `legacy-peer-deps=true` so `npm install` doesn't fail on it; don't remove that without re-verifying auth end-to-end.
- **MongoDB via Mongoose**, **NextAuth** (credentials + JWT), **Resend** for transactional email, **Zod** + **react-hook-form** for validation, **shadcn/Radix UI** primitives in `components/ui/`, **sonner** for toasts.
- Path alias: `@/*` maps to repo root (e.g. `@/lib/connectDB`, `@/models/user.model`).

## Architecture

### Data layer (`models/`, `lib/connectDB.ts`)
- Every API route handler must call `await connectDB()` before any DB access. `connectDB` is a singleton guarded by a module-level `connection.isConnected` flag — do not create connections elsewhere.
- All models follow the pattern `mongoose.models.X || mongoose.model("X", schema)` to survive hot-reload/serverless re-imports. Keep this guard when adding models.
- **Mongoose `populate` gotcha:** a route that populates a ref must ensure the referenced model is registered in-process before the call (models register lazily via import side effects, and serverless bundles don't necessarily share registration). `lib/orgContext.ts`'s `listUserOrganizations` does this correctly — it imports `OrganizationModel` directly before `.populate("organizationId", ...)`. By contrast `app/api/questions/submit/[slug]/route.ts`'s `.populate("userId", "username")` does *not* import `user.model` itself; if you see populate silently return an unpopulated ObjectId, this is why — add the explicit import.
- Models: `User` (auth, `messages` array of ObjectId refs, verify/reset OTP fields), `Message` (`createdFor` → User, optional `questionId` → Question, optional `organizationId`/`teamId`), `Question` (per-user feedback prompt with unique `nanoid(8)` `slug`, `responseCount`, optional `organizationId`/`teamId`), `Organization` (editable `name`, immutable unique `slug`, `createdBy`), `Membership` (`organizationId` + `userId` + `role: OWNER|ADMIN|MEMBER`, unique compound index — **roles live on the membership, not the user**, so the same person can hold different roles across orgs), `Team` (`organizationId`-scoped, `slug` unique *per org* not globally, `members: ObjectId[]` — a user can belong to several teams), `Invitation` (`organizationId` + lower-cased `email` + `role` (never `OWNER`) + optional `teamId`, single-use `token`, `status: PENDING|ACCEPTED|REVOKED|EXPIRED`, at most one live pending invite per email/org via partial unique index).

### Multi-tenant model (Organization → Teams → Questions/Messages)
- **Active org resolution**: `lib/orgContext.ts#resolveActiveContext(session)` is the source of truth. It prefers `session.user.activeOrgId` (set by the org switcher) but always re-validates against `Membership` in the DB — a stale/forged `activeOrgId` can't escalate access — falling back to the user's oldest membership (their personal org) if the preferred one doesn't check out. `getActiveOrgForToken` is the JWT-side counterpart, called from the `jwt` callback both at sign-in and when the client fires `update({ activeOrgId })` (see `lib/nextAuthOptions.tsx`). The resolved `activeOrgId`/`activeOrgSlug`/`activeOrgRole` are threaded through JWT → session and typed in `types/next-auth.d.ts`.
- **`components/OrgSwitcher.tsx`** is a fully working switcher (lists orgs via `GET /api/organizations`, creates new ones, calls `update({ activeOrgId })` then reloads) — it is not a stub.
- **Permissions**: `lib/permissions.ts` defines the `OWNER > ADMIN > MEMBER` matrix (`can(role, permission)`, `outranks(actor, target)`). `lib/apiAuth.ts#requireOrgAccess(organizationId, permission?)` is the standard route guard — checks auth, membership, and optionally a specific permission, returning a discriminated `{ok:true,...} | {ok:false,response}`.
- **API surface**: `app/api/organizations/` (list/create orgs; `[orgId]` get/rename/delete-cascade; `[orgId]/teams`, `[orgId]/teams/[teamId]`; `[orgId]/members`, `[orgId]/members/[membershipId]` role change/remove/leave; `[orgId]/invitations` create/list, `[orgId]/invitations/[invitationId]` revoke). The invitee-facing accept flow lives separately at `app/api/invitations/[token]` (lookup) and `app/api/invitations/accept` (accept) — not nested under `organizations/`. `app/invite/[token]/page.tsx` is the accept UI, handling logged-out users via login/signup CTAs with `callbackUrl`.
- **Public org routes**: `app/o/[orgSlug]/` is a public feedback landing page for an org (lists active Questions, general feedback form), with `app/o/[orgSlug]/q/[slug]/` for question-specific responses and `app/api/o/[orgSlug]/sendMessage/route.ts` handling submission (creates a `Message` stamped with `organizationId`, no `userId`).
- **Multi-tenant migration is complete** — every route that creates a Question or Message stamps `organizationId`:
  - `app/api/questions/*` and `app/api/getMessages/route.ts` use `resolveActiveContext` + filter by `organizationId` (with team-scoped visibility for non-admin members via a `teamScopeFilter` helper — OWNER/ADMIN see everything, MEMBERs see org-level + their own teams' questions).
  - The legacy `/u/[username]` flow is gone as an intake path: that page is now a server-side redirect to the user's personal org page (`/o/[orgSlug]`), and its old API surface (`sendMessage`, `acceptMessages`, `isAcceptingMessagesForSender`, the `isAcceptingMessages` flag on `User`) has been removed — per-question `isActive` is the only intake toggle.
  - The one-time backfill route (`app/api/admin/migrate`) has been run and removed — all pre-existing Questions/Messages now have `organizationId` set.
- Naming is American ("Organization", collection `organizations`).

### Auth (`lib/nextAuthOptions.tsx`, `app/api/auth/[...nextauth]/route.ts`)
- Credentials provider only; login by email **or** username (`$or` query), bcrypt password compare, blocks unverified users.
- JWT session strategy. Custom fields (`_id`, `username`, `isVerified`, `name`, `activeOrgId`, `activeOrgSlug`, `activeOrgRole`) are threaded through the `jwt` and `session` callbacks and typed in `types/next-auth.d.ts` — update all three when adding a session field.
- Server-side: gate routes/pages with `getServerSession(authOptions)`, or for org-scoped API routes prefer `requireOrgAccess` (see above).
- Note: `pages.signIn` is `/Login` but the actual route is `app/login/` — be careful with casing on redirects.

### Proxy (`proxy.ts`, renamed from `middleware.ts` in Next 16 — the exported function is `proxy`, not `middleware`; runtime is always `nodejs`, edge is no longer an option)
- Redirects logged-out users away from protected pages to `/login`, and logged-in users away from `authPages` (`/`, `/login`, `/signup`, `/forgotPassword`, `/resetPassword`, `/verifyEmail`) to `/dashboard`.
- Public without a session: `/u/*`, `/o/*`, `/q/*`, `/invite/*` (invite pages are also viewable while logged in — that's how an invitee accepts).
- `getToken()` is called with an explicit `secureCookie` derived from the request's actual protocol, not left to next-auth's default heuristic (`NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL`) — a `NEXTAUTH_URL` set without a scheme (e.g. `signal.nishchayag.live` instead of `https://signal.nishchayag.live`) makes that heuristic resolve to `false` outright (the `??` never falls through, since `.startsWith()` returns a literal `false`, not `undefined`), so `getToken` looks for the wrong cookie name and silently treats every authenticated request as logged out — session data still looks fine client-side (`/api/auth/session` has its own correct cookie handling), but the proxy never sees it. `NEXTAUTH_URL` must always include the `https://` scheme in production regardless.

### API conventions (`app/api/`)
- Route handlers return `NextResponse.json(...)`. Many existing handlers return `{ success, error/message }` with a **200 status even on logical failure** (e.g. `getMessages`, `verifyEmail`) — newer handlers (`questions/`, `organizations/`) use proper status codes (401/400/403/500). Prefer the status-code style for new code, but check what the calling client expects.
- Input validation uses Zod schemas from `schemas/` (`createQuestionSchema.safeParse(body)`, etc.).
- `app/api/suggestMessages/route.ts` is currently **stubbed** — returns a hardcoded string; the real OpenAI/`ai`-SDK implementation is commented out.

### Email (`lib/mailService.ts`, `emailTemplates/`)
- `sendEmail({ email, mailType, otpCode })` uses Resend with React email templates (`emailTemplates/*.tsx`). `mailType` is `"VERIFY"` or reset-password. Sender address is `RESEND_FROM_EMAIL` (e.g. `SignalHQ <onboarding@resend.dev>` locally — Resend's shared sender needs no domain verification but only delivers to the email on your Resend account; switch to a verified domain address before deploying).
- Invitation emails go through a separate `sendInvitationEmail` path invoked from `app/api/organizations/[orgId]/invitations/route.ts`.

### Frontend
- `app/layout.tsx` is the root: wraps everything in `SessionWrapper` (NextAuth provider), injects Navbar/Footer/Toaster, JSON-LD scripts, and Google Analytics + Microsoft Clarity (gated on `NEXT_PUBLIC_GA_ID` / `NEXT_PUBLIC_CLARITY_ID`). Use the `useAnalytics()` hook's `trackEvent` for custom events.
- Public feedback pages: `app/u/[username]/` (legacy personal link, now a redirect to `/o/[orgSlug]`), `app/q/[slug]/` (question-specific, legacy), and the org-scoped equivalents `app/o/[orgSlug]/` and `app/o/[orgSlug]/q/[slug]/`. Authed area: `app/dashboard/` plus `app/dashboard/organization/` for org/team/member management.
- **SEO is a first-class concern:** `lib/seo.ts` (`seoConfig`), `lib/metadata.ts` (`generateMetadata`, `generateJsonLd`), plus `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts`. Update these together when changing site identity/routes.

### Design system (`app/globals.css`, `components/ui/`)
- Visual style is a bold, colorful "neobrutalist SaaS" look (Attio/Notion-inspired): warm cream background, thick 2px near-black borders, hard offset "sticker" shadows, and saturated accent colors — not the muted shadcn defaults. Light mode is the primary target; dark mode is a secondary palette in `.dark`.
- Custom tokens beyond the standard shadcn set: `--ink` (border/text color, exposed as `border-ink`/`text-ink`) and `--brand-yellow`/`--brand-pink`/`--brand-mint`/`--brand-blue` (exposed as `bg-brand-*`) for icon chips, badges, and color-blocked sections.
- Custom utilities in `@layer utilities`: `.shadow-solid`/`.shadow-solid-sm`/`.shadow-solid-lg` (hard offset shadow, no blur), `.pop` (the standard interactive treatment — offset shadow that grows on hover and flattens on click; used on nearly every button/card-as-button), `.highlight` (inline colored block for emphasized headline words), `.bg-dot-grid` (dot-pattern section background).
- `components/ui/*` primitives (`button`, `card`, `input`, `textarea`, `dialog`, `alert-dialog`, `accordion`) already bake in `border-2 border-ink` + a solid shadow, so most pages get the look for free just by composing them — avoid re-introducing thin `border`/`shadow-sm` styling when adding new UI, and reach for `bg-brand-*` + `border-ink` for any new colorful accent rather than inventing new colors.

## Environment variables

Required at runtime (no `.env.example` committed): `MONGODB_URI`, `NEXTAUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_BASE_URL`, and optional analytics IDs `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_CLARITY_ID`. External image hosts must be whitelisted in `next.config.ts` `images.domains`.
