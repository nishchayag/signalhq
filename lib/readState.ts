import mongoose from "mongoose";

// Per-person read state. The single definition shared by the `read` flag on
// list responses (lib/messageView.ts#withAiView) and the `unread` list
// filter / counts (lib/messageListQuery.ts), so a message the list shows as
// unread always renders unread.
//
// A message is READ for a viewer iff
//   the viewer is in `readBy`
//   OR its last inbound activity (lastInboundAt, else createdAt) is before
//      the viewer's readSince — the "before you joined counts as read" rule.
// Inbound activity rather than createdAt so a pre-join message that gets a
// sender/member follow-up after joining isn't silently hidden as read; but
// not lastActivityAt, so an org reply (outbound) doesn't resurface a
// pre-join message as unread for a member who joined in between.

export interface ReadViewer {
  userId: string;
  readSince?: Date | null;
}

/** Membership.readSince, falling back to the membership's createdAt. */
export function effectiveReadSince(membership: {
  readSince?: Date | null;
  createdAt?: Date | null;
}): Date | null {
  return membership.readSince ?? membership.createdAt ?? null;
}

type ReadSource = {
  readBy?: unknown;
  createdAt?: Date | string | null;
  lastInboundAt?: Date | string | null;
};

/** Is `doc` read for `viewer`? `doc` must have been loaded with "+readBy". */
export function isReadFor(doc: ReadSource, viewer: ReadViewer): boolean {
  const readBy = Array.isArray(doc.readBy) ? doc.readBy : [];
  if (readBy.some((id) => String(id) === viewer.userId)) return true;
  if (!viewer.readSince) return false;
  const activity = doc.lastInboundAt ?? doc.createdAt;
  if (!activity) return false;
  return new Date(activity).getTime() < viewer.readSince.getTime();
}

/** Mongo clause selecting exactly the messages `isReadFor` calls unread.
 * Missing `readBy` matches `$ne`. Combine via `$and` (it may carry `$or`). */
export function unreadClause(viewer: ReadViewer): Record<string, unknown> {
  const clause: Record<string, unknown> = {
    readBy: { $ne: new mongoose.Types.ObjectId(viewer.userId) },
  };
  if (viewer.readSince) {
    // activity = lastInboundAt when set, else createdAt (as in isReadFor).
    clause.$or = [
      { lastInboundAt: { $gte: viewer.readSince } },
      { lastInboundAt: null, createdAt: { $gte: viewer.readSince } },
    ];
  }
  return clause;
}
