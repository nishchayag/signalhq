import connectDB from "@/lib/connectDB";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import MessageModel from "@/models/message.model";
import { resolveActiveContext } from "@/lib/orgContext";
import { can } from "@/lib/permissions";
import { parsePagination, paginate } from "@/lib/pagination";
import { buildMessageListFilter } from "@/lib/messageListQuery";
import { withAiView } from "@/lib/messageView";
import { scheduleLazySweep } from "@/lib/aiEnrichment";
import { isSemanticRequest, semanticListResponse } from "@/lib/semanticSearch";

// Room for the post-response lazy enrichment sweep (runAfter) on Vercel.
export const maxDuration = 30;

// General (non-question) anonymous messages for the active organization.
// Cursor-paginated via ?limit=&before= (see lib/pagination.ts).
export async function GET(request: NextRequest) {
  await connectDB();

  try {
    const session = await getServerSession(authOptions);
    const ctx = await resolveActiveContext(session);

    if (!ctx) {
      return NextResponse.json(
        {
          success: false,
          error: "No active organization",
        },
        { status: 401 }
      );
    }
    if (!can(ctx.role, "message:read")) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions",
        },
        { status: 403 }
      );
    }

    const base = { organizationId: ctx.organizationId, questionId: null };
    const { searchParams } = new URL(request.url);
    const viewer = { userId: String(ctx.membership.userId), role: ctx.role };

    // ?mode=semantic&q=… — ranked by meaning, no pagination (see
    // lib/semanticSearch.ts). Same scoped filter as the regex path.
    if (isSemanticRequest(request.url)) {
      return semanticListResponse({
        url: request.url,
        userId: String(ctx.membership.userId),
        role: ctx.role,
        orgId: ctx.organizationId,
        filter: buildMessageListFilter({ base, searchParams, viewer, mode: "semantic" }),
      });
    }

    const { limit } = parsePagination(request);
    const filter = buildMessageListFilter({ base, searchParams, viewer });
    const fetched = await MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .select("+ai");
    const { page, hasMore, nextCursor } = paginate(fetched, limit);
    scheduleLazySweep(ctx.organizationId);

    return NextResponse.json({
      success: true,
      messages: withAiView(page, ctx.role),
      hasMore,
      nextCursor,
    });
  } catch (error: unknown) {
    console.error("Error in getMessages route:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error fetching messages: " + (error as Error).message,
      },
      { status: 500 }
    );
  }
}
