import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import OrganizationModel from "@/models/organization.model";
import OrgAssetModel from "@/models/orgAsset.model";
import { hasFeature } from "@/lib/plans";
import { withErrorHandling } from "@/lib/apiHandler";

// One uniform body/status for every "there's nothing to serve here" case —
// missing org, missing logo, plan-gated-away logo, and a stale/missing/
// malformed `v` all look identical, so this never becomes an oracle for
// enumerating orgs, plans, or valid logo versions. `no-store` matters here
// specifically: unlike the 200 response, a 404 must never be cached, since
// `v` values that don't resolve today (a not-yet-uploaded version, a typo)
// could resolve later and must be re-checked on every request.
const notFound = () =>
  NextResponse.json(
    { success: false, message: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } }
  );

// GET /api/o/:orgSlug/logo — public, unauthenticated. `?v=` makes the URL
// content-addressed: the response is only served with the long-lived
// `immutable` Cache-Control when `v` is a positive integer that matches the
// org's current `branding.logoVersion` exactly. Any other `v` (missing,
// non-numeric, or stale after a re-upload/removal) is treated as a 404 —
// the caller's cached URL is no longer valid and must be re-fetched from
// the current branding data (which always embeds the current version).
async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  await connectDB();
  const { orgSlug } = await params;

  const requestedVersion = request.nextUrl.searchParams.get("v");
  const parsedVersion = requestedVersion === null ? NaN : Number(requestedVersion);
  const isValidVersion = Number.isInteger(parsedVersion) && parsedVersion > 0;
  if (!isValidVersion) return notFound();

  const organization = await OrganizationModel.findOne({ slug: orgSlug })
    .select("plan branding.logoVersion")
    .lean();
  // Downgrade: the org (and its OrgAsset row) can still exist, but branding
  // — including the logo — must stop being served the moment the plan no
  // longer allows it. No bytes are ever inspected in this branch.
  if (!organization || !hasFeature(organization.plan, "branding")) return notFound();
  if ((organization.branding?.logoVersion ?? 0) !== parsedVersion) return notFound();

  // select("+bytes"): the only place in the codebase allowed to read logo
  // bytes back out of OrgAsset. Every other org-scoped query must leave
  // this select:false field untouched.
  const asset = await OrgAssetModel.findOne({
    organizationId: organization._id,
    kind: "logo",
  }).select("+bytes");
  if (!asset) return notFound();

  return new NextResponse(new Uint8Array(asset.bytes), {
    status: 200,
    headers: {
      "Content-Type": asset.contentType,
      // Defense in depth for a route that serves user-uploaded bytes back
      // out publicly: nosniff stops a browser from re-sniffing the body as
      // something other than the declared (sniffed-at-upload) image type,
      // and the CSP blocks the response from ever executing as a document
      // even if something upstream mislabels it.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
      // Immutable: safe because we've just verified `v` equals the current
      // logoVersion, and a changed logo always bumps that version and
      // therefore the URL — this exact URL's bytes never change hereafter.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export const GET = withErrorHandling(handleGET);
