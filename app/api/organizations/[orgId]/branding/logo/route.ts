import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import OrganizationModel from "@/models/organization.model";
import OrgAssetModel from "@/models/orgAsset.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiHandler";
import { logActivity } from "@/lib/auditLog";
import { getOrgPlan } from "@/lib/aiQuota";
import { hasFeature } from "@/lib/plans";
import { LOGO_MAX_BYTES } from "@/lib/brandingConstants";
import { sniffLogoBytes } from "@/lib/logoValidation";

const notFound = () =>
  NextResponse.json({ success: false, message: "Organization not found" }, { status: 404 });

const planGate = () =>
  NextResponse.json(
    {
      success: false,
      message: "Branding is available on the Pro plan and up.",
      code: "PLAN_UPGRADE_REQUIRED",
    },
    { status: 403 }
  );

const oversize = () =>
  NextResponse.json(
    { success: false, message: `Logo must be ${LOGO_MAX_BYTES / 1024}KB or smaller` },
    { status: 413 }
  );

/**
 * Read the request body capped at `maxBytes`, never buffering more than
 * that — the size limit is enforced by aborting the read as soon as it's
 * exceeded, not by reading everything and checking `.length` afterward.
 * Content-Length is checked first as a fast path, but it's never trusted
 * alone (absent, wrong, or a chunked transfer with no length at all all
 * fall through to the streaming cap).
 */
async function readCappedBody(request: NextRequest, maxBytes: number): Promise<Buffer | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) return null;
  }

  const reader = request.body?.getReader();
  if (!reader) {
    // No streaming body available in this runtime — fall back to reading it
    // whole, but still enforce the cap before anything downstream sees it.
    const buf = Buffer.from(await request.arrayBuffer());
    return buf.length > maxBytes ? null : buf;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Pull the uploaded file's raw bytes out of an already-capped request body,
 * whether it was sent as multipart/form-data (a "file" field) or as a raw
 * binary body. Multipart is parsed from `body` (never re-read from the
 * request), so the size cap above still bounds a multipart upload too.
 */
async function extractLogoBytes(
  contentType: string,
  body: Buffer
): Promise<Buffer | null> {
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return body;
  }
  try {
    const form = await new Request("http://localhost/", {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    }).formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) return null;
    return Buffer.from(await file.arrayBuffer());
  } catch {
    // Malformed multipart (bad/missing boundary, truncated part, etc.) is a
    // 400 like any other bad upload, not an unhandled 500.
    return null;
  }
}

// POST /api/organizations/:orgId/branding/logo — multipart ("file" field) or
// a raw binary body. OWNER/ADMIN only, PRO/ENTERPRISE only, <=100KB,
// PNG/JPEG/WebP only (sniffed from the bytes, never the client's declared
// Content-Type). Replaces any existing logo and bumps branding.logoVersion.
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "org:branding");
  if (!auth.ok) return auth.response;

  const plan = await getOrgPlan(orgId);
  if (!hasFeature(plan, "branding")) return planGate();

  const body = await readCappedBody(request, LOGO_MAX_BYTES);
  if (body === null) return oversize();

  const bytes = await extractLogoBytes(request.headers.get("content-type") ?? "", body);
  if (!bytes || bytes.length === 0) {
    return NextResponse.json(
      { success: false, message: "No image file was uploaded" },
      { status: 400 }
    );
  }
  // The multipart envelope was capped above, but the extracted part itself
  // (the actual image payload) is what the 100KB limit is really about —
  // re-check it explicitly rather than relying on the envelope check alone.
  if (bytes.length > LOGO_MAX_BYTES) return oversize();

  const sniff = sniffLogoBytes(bytes);
  if (!sniff.ok) {
    return NextResponse.json({ success: false, message: sniff.reason }, { status: 400 });
  }

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const replacement = {
    organizationId: orgId,
    kind: "logo" as const,
    contentType: sniff.contentType,
    bytes,
    size: bytes.length,
    sha256,
  };
  try {
    await OrgAssetModel.findOneAndUpdate({ organizationId: orgId, kind: "logo" }, replacement, {
      upsert: true,
      setDefaultsOnInsert: true,
    });
  } catch (error) {
    // Two concurrent first-ever uploads for the same org can both try to
    // insert under the unique (organizationId, kind) index and one loses
    // the race with E11000 — the doc now exists, so retry as a plain
    // update rather than surfacing a 500 for what's really just a replace.
    if ((error as { code?: number })?.code === 11000) {
      await OrgAssetModel.updateOne({ organizationId: orgId, kind: "logo" }, replacement);
    } else {
      throw error;
    }
  }

  const organization = await OrganizationModel.findByIdAndUpdate(
    orgId,
    { $inc: { "branding.logoVersion": 1 } },
    { new: true }
  ).select("branding");
  if (!organization) return notFound();

  const logoVersion = organization.branding?.logoVersion ?? 1;

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "branding.logo_uploaded",
    metadata: { contentType: sniff.contentType, size: bytes.length, sha256, logoVersion },
  });

  return NextResponse.json({ success: true, logoVersion });
}

// DELETE /api/organizations/:orgId/branding/logo — removes the org's logo.
// Same auth/plan gate as POST.
async function handleDELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "org:branding");
  if (!auth.ok) return auth.response;

  const plan = await getOrgPlan(orgId);
  if (!hasFeature(plan, "branding")) return planGate();

  const deleted = await OrgAssetModel.findOneAndDelete({ organizationId: orgId, kind: "logo" });
  if (!deleted) {
    return NextResponse.json({ success: false, message: "No logo to remove" }, { status: 404 });
  }

  // Bumped even on delete: keeps future re-uploads on a version number the
  // deleted logo never used, so a client that cached the pre-delete
  // `?v=` URL doesn't collide with whatever gets uploaded next.
  await OrganizationModel.findByIdAndUpdate(orgId, { $inc: { "branding.logoVersion": 1 } });

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "branding.logo_removed",
  });

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandling(handlePOST);
export const DELETE = withErrorHandling(handleDELETE);
