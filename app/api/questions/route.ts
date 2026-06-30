import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import QuestionModel from "@/models/question.model";
import TeamModel from "@/models/team.model";
import { createQuestionSchema } from "@/schemas/questionSchema";
import { resolveActiveContext } from "@/lib/orgContext";
import { can } from "@/lib/permissions";
import { nanoid } from "nanoid";

// Team ids a member is allowed to see. OWNER/ADMIN see everything (returns null
// meaning "no team restriction").
async function teamScopeFilter(
  orgId: string,
  userId: string,
  role: string
): Promise<Record<string, unknown> | null> {
  if (role === "OWNER" || role === "ADMIN") return null;
  const teams = await TeamModel.find({
    organizationId: orgId,
    members: userId,
  }).select("_id");
  const teamIds = teams.map((t) => t._id);
  // Members see org-level questions plus their own teams' questions.
  return { $or: [{ teamId: null }, { teamId: { $in: teamIds } }] };
}

export async function POST(request: NextRequest) {
  await connectDB();
  try {
    const session = await getServerSession(authOptions);
    const ctx = await resolveActiveContext(session);
    if (!ctx) {
      return NextResponse.json(
        { success: false, message: "No active organization" },
        { status: 401 }
      );
    }
    if (!can(ctx.role, "question:create")) {
      return NextResponse.json(
        { success: false, message: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = createQuestionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: "Invalid input", errors: result.error.format() },
        { status: 400 }
      );
    }

    const { questionText, description, teamId } = result.data;

    // Validate the team (if any) belongs to this org.
    if (teamId) {
      const team = await TeamModel.findOne({
        _id: teamId,
        organizationId: ctx.organizationId,
      });
      if (!team) {
        return NextResponse.json(
          { success: false, message: "Team not found in this organization" },
          { status: 400 }
        );
      }
    }

    // Unique slug across all questions.
    let slug = nanoid(8);
    while (await QuestionModel.findOne({ slug })) {
      slug = nanoid(8);
    }

    const question = await QuestionModel.create({
      questionText,
      description,
      userId: session!.user._id,
      organizationId: ctx.organizationId,
      teamId: teamId || undefined,
      slug,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Question created successfully",
        question: {
          _id: question._id,
          questionText: question.questionText,
          description: question.description,
          slug: question.slug,
          isActive: question.isActive,
          teamId: question.teamId,
          responseCount: question.responseCount,
          createdAt: question.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating question:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  await connectDB();
  try {
    const session = await getServerSession(authOptions);
    const ctx = await resolveActiveContext(session);
    if (!ctx) {
      return NextResponse.json(
        { success: false, message: "No active organization" },
        { status: 401 }
      );
    }

    const scope = await teamScopeFilter(
      ctx.organizationId,
      String(session!.user._id),
      ctx.role
    );
    const filter: Record<string, unknown> = {
      organizationId: ctx.organizationId,
      ...(scope || {}),
    };

    const questions = await QuestionModel.find(filter)
      .sort({ createdAt: -1 })
      .select(
        "questionText description slug isActive teamId responseCount createdAt"
      );

    return NextResponse.json({ success: true, questions }, { status: 200 });
  } catch (error) {
    console.error("Error fetching questions:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
