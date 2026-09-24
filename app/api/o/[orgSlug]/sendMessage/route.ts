import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import OrganizationModel from "@/models/organization.model";
import MessageModel from "@/models/message.model";
import { questionResponseSchema } from "@/schemas/questionSchema";
import { nanoid } from "nanoid";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import { moderateContent } from "@/lib/contentModeration";
import { notifyNewMessage } from "@/lib/notifications";
import { isAiEnabled } from "@/lib/ai";
import { runAfter } from "@/lib/background";
import { enrichMessage } from "@/lib/aiEnrichment";

// Room for the post-response AI enrichment (runAfter) on Vercel.
export const maxDuration = 30;

// POST /api/o/:orgSlug/sendMessage — anonymous general feedback to an org.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  await connectDB();
  try {
    const ip = getClientIp(request);
    const allowed = await checkRateLimit(`orgSendMessage:${ip}`, 5, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          message: "Too many messages sent from this location. Please try again in a few minutes.",
        },
        { status: 429 }
      );
    }

    const { orgSlug } = await params;
    const body = await request.json();

    // Reuse the response content schema (1–1000 chars, trimmed).
    const result = questionResponseSchema.safeParse({ content: body.content });
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: "Invalid input", errors: result.error.format() },
        { status: 400 }
      );
    }

    const moderation = moderateContent(result.data.content);
    if (!moderation.allowed) {
      return NextResponse.json(
        { success: false, message: moderation.reason },
        { status: 400 }
      );
    }

    const organization = await OrganizationModel.findOne({ slug: orgSlug });
    if (!organization) {
      return NextResponse.json(
        { success: false, message: "Organization not found" },
        { status: 404 }
      );
    }

    // `createdFor` is required and refs a User; org-level messages are owned by
    // the org (organizationId) and attributed to its creator for that field.
    const replyToken = nanoid(32);
    const aiOn = isAiEnabled();
    const message = await MessageModel.create({
      content: result.data.content,
      createdFor: organization.createdBy,
      organizationId: organization._id,
      replyToken,
      ...(aiOn && { ai: { status: "pending", attempts: 0 } }),
    });
    // After the response; never awaited, never fails the submission.
    if (aiOn) runAfter(() => enrichMessage(message._id));

    await notifyNewMessage(organization.createdBy);

    return NextResponse.json(
      { success: true, message: "Message sent successfully", replyToken },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in org sendMessage route:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
