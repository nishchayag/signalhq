import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import MessageModel from "@/models/message.model";
import { resolveActiveContext } from "@/lib/orgContext";
import { can } from "@/lib/permissions";
import { buildMessageListFilter, type MessageListViewer } from "@/lib/messageListQuery";
import { messagesToCsv } from "@/lib/csv";
import type { ThreadSource } from "@/lib/thread";
import { loadAndAuthorize } from "@/lib/questionAccess";
import { effectiveReadSince } from "@/lib/readState";

// Hard cap so a single export can't pull in an unbounded number of documents.
const MAX_ROWS = 10_000;

// GET /api/messages/export[?questionId=][&q=][&status=&unread=&label=&assignee=] — CSV download of either the
// active org's general messages (questionId omitted, mirrors
// app/api/getMessages/route.ts's filter) or one question's public responses
// (questionId given, mirrors app/api/questions/[questionId]/route.ts's
// filter and auth, reused directly rather than duplicated).
export async function GET(request: NextRequest) {
  await connectDB();
  try {
    const questionId = request.nextUrl.searchParams.get("questionId");

    let base: Record<string, unknown>;
    let viewer: MessageListViewer;
    let filenameHint: string;

    if (questionId) {
      const authz = await loadAndAuthorize(questionId);
      if (!authz.ok) return authz.response;
      base = { questionId, authorType: { $ne: "member" } };
      viewer = {
        userId: authz.userId,
        role: authz.role,
        readSince: authz.membership ? effectiveReadSince(authz.membership) : null,
      };
      filenameHint = authz.question.slug;
    } else {
      const session = await getServerSession(authOptions);
      const ctx = await resolveActiveContext(session);
      if (!ctx) {
        return NextResponse.json(
          { success: false, error: "No active organization" },
          { status: 401 }
        );
      }
      if (!can(ctx.role, "message:read")) {
        return NextResponse.json(
          { success: false, error: "Insufficient permissions" },
          { status: 403 }
        );
      }
      base = { organizationId: ctx.organizationId, questionId: null };
      viewer = {
        userId: String(ctx.membership.userId),
        role: ctx.role,
        readSince: effectiveReadSince(ctx.membership),
      };
      filenameHint = ctx.organization.slug;
    }
    const filter = buildMessageListFilter({
      base,
      searchParams: request.nextUrl.searchParams,
      viewer,
      mode: "export",
    });

    const messages = await MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(MAX_ROWS)
      .select("content createdAt authorType replies")
      .lean<ThreadSource[]>();

    const csv = messagesToCsv(messages);
    const filename = `messages-${filenameHint}-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error exporting messages:", error);
    return NextResponse.json(
      { success: false, error: "Error exporting messages" },
      { status: 500 }
    );
  }
}
