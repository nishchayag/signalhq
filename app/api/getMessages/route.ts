import connectDB from "@/lib/connectDB";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import MessageModel from "@/models/message.model";
import { resolveActiveContext } from "@/lib/orgContext";
import { can } from "@/lib/permissions";
import { parsePagination, paginate, parseSearchQuery } from "@/lib/pagination";
import { withAiView } from "@/lib/messageView";

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

    const { limit, before } = parsePagination(request);
    const search = parseSearchQuery(request);
    const filter: Record<string, unknown> = {
      organizationId: ctx.organizationId,
      questionId: null,
    };
    if (before) filter.createdAt = { $lt: before };
    if (search) filter.content = { $regex: search, $options: "i" };

    const fetched = await MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .select("+ai");
    const { page, hasMore, nextCursor } = paginate(fetched, limit);

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
