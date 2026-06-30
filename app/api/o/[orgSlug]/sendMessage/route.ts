import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import OrganizationModel from "@/models/organization.model";
import MessageModel from "@/models/message.model";
import { questionResponseSchema } from "@/schemas/questionSchema";

// POST /api/o/:orgSlug/sendMessage — anonymous general feedback to an org.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  await connectDB();
  try {
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

    const organization = await OrganizationModel.findOne({ slug: orgSlug });
    if (!organization) {
      return NextResponse.json(
        { success: false, message: "Organization not found" },
        { status: 404 }
      );
    }

    // `createdFor` is required and refs a User; org-level messages are owned by
    // the org (organizationId) and attributed to its creator for that field.
    await MessageModel.create({
      content: result.data.content,
      createdFor: organization.createdBy,
      organizationId: organization._id,
    });

    return NextResponse.json(
      { success: true, message: "Message sent successfully" },
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
