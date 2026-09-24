import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import MessageModel from "@/models/message.model";
import { questionResponseSchema } from "@/schemas/questionSchema";
import { checkRateLimit } from "@/lib/rateLimit";
import { hashedIp } from "@/lib/getClientIp";
import { moderateContent } from "@/lib/contentModeration";
import { notifyMessageEvent } from "@/lib/notifications";
import { threadOf } from "@/lib/thread";
import { runAfter } from "@/lib/background";
import { MAX_THREAD_TURNS, RECEIPT_FIELDS, loadReceipt, tokenKey } from "@/lib/receipt";

// The anonymous sender's side of a thread. The replyToken in the URL is the
// sender's only credential: no session, no account. Responses carry the
// thread turns and `awaitingOrg` only — never ai/embedding/ids — and are
// never cached. Unknown tokens and member-thread tokens get the same 404.

const IP_LIMIT = 5;
const IP_WINDOW_MS = 10 * 60 * 1000;
const TOKEN_LIMIT = 20;
const TOKEN_WINDOW_MS = 24 * 60 * 60 * 1000;

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}
const notFound = () => json({ message: "Not found" }, 404);

// GET /api/r/:replyToken → { turns, awaitingOrg }
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ replyToken: string }> }
) {
  await connectDB();
  try {
    const { replyToken } = await params;
    const msg = await loadReceipt(replyToken);
    if (!msg) return notFound();
    return json({ turns: threadOf(msg), awaitingOrg: Boolean(msg.awaitingOrg) });
  } catch (error) {
    console.error("Error loading receipt thread:", error instanceof Error ? error.name : typeof error);
    return json({ message: "Internal server error" }, 500);
  }
}

// POST /api/r/:replyToken {content} → { turns, awaitingOrg: true }
// The sender follows up. Not AI-enriched; notifies the recipient, the org's
// admins and the assignee (after the response). Rate limits run before any
// lookup so known and unknown tokens cost the same.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ replyToken: string }> }
) {
  await connectDB();
  try {
    const { replyToken } = await params;

    const ipOk = await checkRateLimit(`followup:ip:${hashedIp(request)}`, IP_LIMIT, IP_WINDOW_MS);
    const tokOk = await checkRateLimit(
      `followup:tok:${tokenKey(String(replyToken))}`,
      TOKEN_LIMIT,
      TOKEN_WINDOW_MS
    );
    if (!ipOk || !tokOk) {
      return json({ message: "Too many follow-ups. Please try again later." }, 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ message: "Invalid request body" }, 400);
    }
    const parsed = questionResponseSchema.safeParse(body);
    if (!parsed.success) {
      return json({ message: "Invalid input", errors: parsed.error.format() }, 400);
    }
    const { content } = parsed.data;
    const moderation = moderateContent(content);
    if (!moderation.allowed) return json({ message: moderation.reason }, 400);

    const current = await loadReceipt(replyToken);
    if (!current) return notFound();

    // Turns so far = 1 + replies.
    const maxReplies = MAX_THREAD_TURNS - 1;
    if ((current.replies?.length ?? 0) >= maxReplies) {
      return json({ message: "This conversation has reached its limit" }, 409);
    }

    const now = new Date();
    // Conditional on the array still having room, so parallel posts can't
    // push the thread past the cap.
    const updated = await MessageModel.findOneAndUpdate(
      {
        replyToken,
        authorType: { $ne: "member" },
        [`replies.${maxReplies - 1}`]: { $exists: false },
      },
      {
        $push: { replies: { authorRole: "sender", content, createdAt: now } },
        $set: { awaitingOrg: true, lastActivityAt: now, lastInboundAt: now },
        // New inbound activity reopens the message for everyone.
        $unset: { readBy: "", archivedAt: "", archivedBy: "" },
      },
      { new: true, projection: `${RECEIPT_FIELDS} createdFor organizationId` }
    ).lean<{ _id: unknown; createdFor?: unknown; organizationId?: unknown } & Parameters<typeof threadOf>[0]>();
    if (!updated) return json({ message: "This conversation has reached its limit" }, 409);

    // After the response. "followup" also reaches the message's assignee.
    const { _id: messageId, createdFor, organizationId } = updated;
    runAfter(() =>
      notifyMessageEvent({
        organizationId: organizationId ? String(organizationId) : null,
        primaryUserIds: createdFor ? [String(createdFor)] : [],
        event: "followup",
        messageId: String(messageId),
      })
    );

    return json({ turns: threadOf(updated), awaitingOrg: true }, 201);
  } catch (error) {
    console.error("Error saving follow-up:", error instanceof Error ? error.name : typeof error);
    return json({ message: "Internal server error" }, 500);
  }
}
