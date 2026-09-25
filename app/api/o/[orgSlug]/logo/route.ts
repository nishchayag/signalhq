import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import OrganizationModel from "@/models/organization.model";
import OrgAssetModel from "@/models/orgAsset.model";
import { hasFeature } from "@/lib/plans";
import { withErrorHandling } from "@/lib/apiHandler";

// One uniform body/status for every "there's nothing to serve here" case —
// missing org, missing logo, and plan-gated-away logo all look identical, so
// this never becomes an oracle for enumerating orgs or plans.
const notFound = () =>
  NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

// GET /api/o/:orgSlug/logo — public, unauthenticated. `?v=` is a pure
// client-side cache-buster (bump it and the URL changes, which is what
// makes the `immutable` Cache-Control below safe); only one logo is ever
// stored per org, so the server doesn't branch on it or validate it against
// the stored logoVersion.
async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  await connectDB();
  const { orgSlug } = await params;

  const organization = await OrganizationModel.findOne({ slug: orgSlug })
    .select("plan")
    .lean();
  // Downgrade: the org (and its OrgAsset row) can still exist, but branding
  // — including the logo — must stop being served the moment the plan no
  // longer allows it. No bytes are ever inspected in this branch.
  if (!organization || !hasFeature(organization.plan, "branding")) return notFound();

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
      // Immutable: safe because a changed logo always gets a new `v` and
      // therefore a new URL — this exact URL's bytes never change.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export const GET = withErrorHandling(handleGET);
