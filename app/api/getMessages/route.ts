import connectDB from "@/lib/connectDB";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import MessageModel from "@/models/message.model";
import { resolveActiveContext } from "@/lib/orgContext";
import { can } from "@/lib/permissions";

// General (non-question) anonymous messages for the active organization.
export async function GET() {
  await connectDB();

  try {
    const session = await getServerSession(authOptions);
    const ctx = await resolveActiveContext(session);

    if (!ctx) {
      return NextResponse.json({
        success: false,
        error: "No active organization",
      });
    }
    if (!can(ctx.role, "message:read")) {
      return NextResponse.json({
        success: false,
        error: "Insufficient permissions",
      });
    }

    const messages = await MessageModel.find({
      organizationId: ctx.organizationId,
      questionId: null,
    }).sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      messages,
    });
  } catch (error: unknown) {
    console.error("Error in getMessages route:", error);
    return NextResponse.json({
      success: false,
      error: "Error fetching messages: " + (error as Error).message,
    });
  }
}
