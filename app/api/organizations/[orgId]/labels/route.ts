import { NextRequest, NextResponse } from "next/server";
import OrganizationModel, { ORG_MAX_LABELS } from "@/models/organization.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiHandler";
import { logActivity } from "@/lib/auditLog";
import { createLabelSchema } from "@/schemas/triageSchema";
import { exactNameRegex, labelView } from "@/lib/labels";

const notFound = () =>
  NextResponse.json({ success: false, message: "Organization not found" }, { status: 404 });

// GET /api/organizations/:orgId/labels — the org's triage labels (any member).
//   → { success, labels: [{ _id, name, color }] }
async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "message:read");
  if (!auth.ok) return auth.response;

  const org = await OrganizationModel.findById(orgId).select("labels");
  if (!org) return notFound();
  return NextResponse.json({ success: true, labels: (org.labels ?? []).map(labelView) });
}

// POST /api/organizations/:orgId/labels {name, color} → 201 { success, label }
// 409 when the org already has ORG_MAX_LABELS labels or one with that name
// (case-insensitive). One atomic $push whose filter carries both guards.
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "org:labels");
  if (!auth.ok) return auth.response;

  const parsed = createLabelSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid input", errors: parsed.error.format() },
      { status: 400 }
    );
  }
  const { name, color } = parsed.data;

  const updated = await OrganizationModel.findOneAndUpdate(
    {
      _id: orgId,
      [`labels.${ORG_MAX_LABELS - 1}`]: { $exists: false },
      "labels.name": { $not: exactNameRegex(name) },
    },
    { $push: { labels: { name, color } } },
    { new: true, projection: { labels: 1 } }
  );
  if (!updated) {
    const org = await OrganizationModel.findById(orgId).select("labels");
    if (!org) return notFound();
    const full = (org.labels?.length ?? 0) >= ORG_MAX_LABELS;
    return NextResponse.json(
      {
        success: false,
        message: full
          ? `An organization can have at most ${ORG_MAX_LABELS} labels`
          : "A label with that name already exists",
      },
      { status: 409 }
    );
  }
  const label = updated.labels![updated.labels!.length - 1];

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "label.created",
    metadata: { labelId: String(label._id), name: label.name, color: label.color },
  });

  return NextResponse.json({ success: true, label: labelView(label) }, { status: 201 });
}

export const GET = withErrorHandling(handleGET);
export const POST = withErrorHandling(handlePOST);
