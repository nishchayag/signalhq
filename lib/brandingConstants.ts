// Branding limits and the curated accent palette, mongoose-free so client
// code, zod schemas, and the models can all share them (mirrors
// lib/triageConstants.ts).

// Accent keys map onto the same design-system brand tokens the triage
// labels use (app/globals.css --brand-*, exposed as bg-brand-*), so a
// branded public page reuses existing tokens instead of introducing
// arbitrary user-supplied colors.
export const BRANDING_ACCENTS = ["yellow", "pink", "mint", "blue"] as const;
export type BrandingAccent = (typeof BRANDING_ACCENTS)[number];
export const DEFAULT_BRANDING_ACCENT: BrandingAccent = "yellow";

// Organization.branding.welcomeText — moderated with the same blocklist as
// message content (lib/contentModeration.ts) before it's ever stored.
export const WELCOME_TEXT_MAX = 280;

// Logo uploads: raster only, and only ever trusted after magic-byte
// sniffing (lib/logoValidation.ts) — the client's Content-Type/extension is
// never trusted. SVG is deliberately excluded (it's script-capable).
export const ALLOWED_LOGO_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type LogoContentType = (typeof ALLOWED_LOGO_CONTENT_TYPES)[number];

// 100KB, enforced by streaming the request body capped at this limit
// (app/api/organizations/[orgId]/branding/logo/route.ts) before anything is
// buffered or parsed.
export const LOGO_MAX_BYTES = 100 * 1024;
