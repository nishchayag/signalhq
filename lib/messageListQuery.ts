import mongoose from "mongoose";
import type { MembershipRole } from "@/models/membership.model";
import { parseBeforeCursor, parseEscapedSearch } from "@/lib/pagination";
import { isValidObjectId } from "@/lib/objectId";
import { unreadClause } from "@/lib/readState";
import { OPTION_ID_PATTERN, SCALES } from "@/lib/answers";

const SCORE_MAX = Math.max(SCALES.rating.max, SCALES.nps.max);

// The one place a message-list Mongo filter is built from query params, used
// by getMessages, questions/[id] GET, messages/export and semantic search,
// so the dashboard, the CSV and search can't drift apart.
//
// The route builds `base` (the authorization scope: org / question /
// general-vs-question / member-thread exclusion) and passes the request's
// searchParams; this adds the user-controlled narrowing on top. `base` keys
// are never overwritten by a param, so a param can only narrow the scope.
//
// Adding a filter param: parse it from `searchParams` inside
// buildMessageListFilter, push a clause onto `and` (or set a key that `base`
// can't contain), and decide which modes it applies to. Callers don't change.

/** Who is listing. `readSince` is the effective "before this counts as read"
 * cutoff (lib/readState.ts#effectiveReadSince) — for the `unread` filter. */
export interface MessageListViewer {
  userId: string;
  role: MembershipRole | null;
  readSince?: Date | null;
}

export const MESSAGE_STATUSES = ["open", "archived", "all"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

// A clause no document satisfies — an unsatisfiable narrowing param (e.g. a
// malformed label id) yields an empty list rather than a 400 or, worse, no
// narrowing at all.
const MATCH_NOTHING = { _id: { $in: [] } };

const oid = (id: string) => new mongoose.Types.ObjectId(id);

/**
 * - `page`: a dashboard list page — `q` regex search + `before` cursor.
 * - `export`: the CSV — `q` regex search, no cursor (it isn't paginated).
 * - `semantic`: `mode=semantic` — neither: `q` is the embedding query, and
 *   results are ranked by similarity, not paged by createdAt.
 */
export type MessageListMode = "page" | "export" | "semantic";

export interface BuildMessageListFilterOpts {
  base: Record<string, unknown>;
  searchParams: URLSearchParams;
  viewer: MessageListViewer;
  mode?: MessageListMode;
}

export function buildMessageListFilter({
  base,
  searchParams,
  viewer,
  mode = "page",
}: BuildMessageListFilterOpts): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...base };
  const and: Record<string, unknown>[] = [];

  if (mode !== "semantic") {
    const search = parseEscapedSearch(searchParams);
    if (search) filter.content = { $regex: search, $options: "i" };
  }
  if (mode === "page") {
    const before = parseBeforeCursor(searchParams);
    if (before) filter.createdAt = { $lt: before };
  }

  // Triage params. All modes: they're plain narrowing predicates, and the
  // semantic path re-applies the full filter when it hydrates results.
  //
  // status=open|archived|all — default (and any unknown value) is open.
  const status = searchParams.get("status");
  if (status === "archived") and.push({ archivedAt: { $ne: null } });
  else if (status !== "all") and.push({ archivedAt: null });

  // unread=1 — the viewer's own read state (lib/readState.ts).
  const unread = searchParams.get("unread");
  if (unread === "1" || unread === "true") {
    and.push(unreadClause({ userId: viewer.userId, readSince: viewer.readSince }));
  }

  // label=<Organization.labels _id>
  const label = searchParams.get("label");
  if (label !== null) {
    and.push(isValidObjectId(label) ? { labels: oid(label) } : MATCH_NOTHING);
  }

  // assignee=me|none|<userId>. `none` matches missing or null (unassign
  // always $unsets — see the partial index in models/message.model.ts — but
  // a stray null must still read as unassigned, as it does in the UI).
  const assignee = searchParams.get("assignee");
  if (assignee === "me") and.push({ assignedTo: oid(viewer.userId) });
  else if (assignee === "none") and.push({ assignedTo: null });
  else if (assignee !== null) {
    and.push(isValidObjectId(assignee) ? { assignedTo: oid(assignee) } : MATCH_NOTHING);
  }

  // Typed answers. score=N or score=N-M (inclusive; e.g. NPS detractors
  // 0-6), integers 0..10. choice=<option id> — any message whose answer
  // picked it. Malformed ⇒ empty list.
  const score = searchParams.get("score");
  if (score !== null) {
    const m = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(score);
    const lo = m ? Number(m[1]) : NaN;
    const hi = m ? Number(m[2] ?? m[1]) : NaN;
    and.push(
      m && lo <= hi && hi <= SCORE_MAX
        ? lo === hi
          ? { "answer.score": lo }
          : { "answer.score": { $gte: lo, $lte: hi } }
        : MATCH_NOTHING
    );
  }
  const choice = searchParams.get("choice");
  if (choice !== null) {
    and.push(OPTION_ID_PATTERN.test(choice) ? { "answer.choices": choice } : MATCH_NOTHING);
  }

  if (and.length > 0) {
    filter.$and = [...((base.$and as Record<string, unknown>[] | undefined) ?? []), ...and];
  }
  return filter;
}
