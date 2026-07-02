import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import MessageModel from "@/models/message.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { questionResponseSchema } from "@/schemas/questionSchema";

// POST /api/messages/:messageId/reply — recipient replies to a message. The
// anonymous sender sees the reply later via their /r/[replyToken] link.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  await connectDB();
  try {
    const { messageId } = await params;

    const message = await MessageModel.findById(messageId);
    if (!message) {
      return NextResponse.json(
        { success: false, message: "Message not found" },
        { status: 404 }
      );
    }

    if (!message.organizationId) {
      return NextResponse.json(
        { success: false, message: "This message cannot be replied to" },
        { status: 400 }
      );
    }

    const access = await requireOrgAccess(
      String(message.organizationId),
      "message:reply"
    );
    if (!access.ok) return access.response;

    const body = await request.json();
    const result = questionResponseSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: "Invalid input", errors: result.error.format() },
        { status: 400 }
      );
    }

    message.reply = { content: result.data.content, repliedAt: new Date() };
    await message.save();

    return NextResponse.json(
      { success: true, message: "Reply saved", reply: message.reply },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error replying to message:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
