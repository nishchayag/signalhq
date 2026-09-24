import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import OrganizationModel from "@/models/organization.model";
import MessageModel from "@/models/message.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiHandler";
import { logActivity } from "@/lib/auditLog";
import { isValidObjectId } from "@/lib/objectId";
import { updateLabelSchema } from "@/schemas/triageSchema";
import { exactNameRegex, labelView } from "@/lib/labels";

type Ctx = { params: Promise<{ orgId: string; labelId: string }> };

const notFound = () =>
  NextResponse.json({ success: false, message: "Label not found" }, { status: 404 });

// PATCH /api/organizations/:orgId/labels/:labelId {name?, color?}
//   → { success, label }; 404 unknown label; 409 name taken by another
//   label (case-insensitive; renaming a label to a new casing of its own
//   name is fine).
async function handlePATCH(request: NextRequest, { params }: Ctx) {
  const { orgId, labelId } = await params;
  const auth = await requireOrgAccess(orgId, "org:labels");
  if (!auth.ok) return auth.response;
  if (!isValidObjectId(labelId)) return notFound();

  const parsed = updateLabelSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid input", errors: parsed.error.format() },
      { status: 400 }
    );
  }
  const { name, color } = parsed.data;
  const lid = new mongoose.Types.ObjectId(labelId);

  const and: Record<string, unknown>[] = [{ labels: { $elemMatch: { _id: lid } } }];
  if (name !== undefined) {
    and.push({
      labels: { $not: { $elemMatch: { _id: { $ne: lid }, name: exactNameRegex(name) } } },
    });
  }
  const set: Record<string, unknown> = {};
  if (name !== undefined) set["labels.$[l].name"] = name;
  if (color !== undefined) set["labels.$[l].color"] = color;

  const before = await OrganizationModel.findById(orgId).select("labels");
  const prev = before?.labels?.find((l) => String(l._id) === labelId);
  if (!prev) return notFound();

  const updated = await OrganizationModel.findOneAndUpdate(
    { _id: orgId, $and: and },
    { $set: set },
    { new: true, arrayFilters: [{ "l._id": lid }], projection: { labels: 1 } }
  );
  const label = updated?.labels?.find((l) => String(l._id) === labelId);
  if (!label) {
    const still = await OrganizationModel.exists({ _id: orgId, "labels._id": lid });
    if (!still) return notFound();
    return NextResponse.json(
      { success: false, message: "A label with that name already exists" },
      { status: 409 }
    );
  }

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "label.updated",
    metadata: {
      labelId,
      name: label.name,
      ...(name !== undefined && prev.name !== label.name && { from: prev.name }),
      color: label.color,
    },
  });

  return NextResponse.json({ success: true, label: labelView(label) });
}

// DELETE /api/organizations/:orgId/labels/:labelId → { success, removedFrom }
// Removes the label from the org, then $pulls it from every message in the
// org (`removedFrom` = messages that carried it); unsets an emptied array
// so those messages leave the labels partial index.
async function handleDELETE(_request: NextRequest, { params }: Ctx) {
  const { orgId, labelId } = await params;
  const auth = await requireOrgAccess(orgId, "org:labels");
  if (!auth.ok) return auth.response;
  if (!isValidObjectId(labelId)) return notFound();
  const lid = new mongoose.Types.ObjectId(labelId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const before = await OrganizationModel.findOneAndUpdate(
    { _id: orgId, "labels._id": lid },
    { $pull: { labels: { _id: lid } } },
    { new: false, projection: { labels: 1 } }
  );
  const label = before?.labels?.find((l) => String(l._id) === labelId);
  if (!label) return notFound();

  const pulled = await MessageModel.updateMany(
    { organizationId: orgOid, labels: lid },
    { $pull: { labels: lid } }
  );
  await MessageModel.updateMany(
    { organizationId: orgOid, labels: { $size: 0 } },
    { $unset: { labels: "" } }
  );

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "label.deleted",
    metadata: { labelId, name: label.name },
  });

  return NextResponse.json({ success: true, removedFrom: pulled.modifiedCount });
}

export const PATCH = withErrorHandling(handlePATCH);
export const DELETE = withErrorHandling(handleDELETE);
