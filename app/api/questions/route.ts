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
import { parsePagination, paginate } from "@/lib/pagination";
import { teamScopeFilter } from "@/lib/questionAccess";

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

    const { questionText, description, teamId, visibility } = result.data;

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
      visibility: visibility || "public",
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
          visibility: question.visibility,
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

export async function GET(request: NextRequest) {
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
    const { limit, before } = parsePagination(request);
    const filter: Record<string, unknown> = {
      organizationId: ctx.organizationId,
      ...(scope || {}),
    };
    if (before) filter.createdAt = { $lt: before };

    const fetched = await QuestionModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .select(
        "questionText description slug isActive teamId visibility responseCount createdAt"
      );
    const { page, hasMore, nextCursor } = paginate(fetched, limit);

    // Members' answers to internal questions are private threads — exposing
    // responseCount would let a MEMBER infer how many colleagues answered.
    const canSeeAllReplies = can(ctx.role, "question:viewAllReplies");
    const payload = page.map((q) => {
      const obj = q.toObject() as unknown as Record<string, unknown>;
      if (!canSeeAllReplies && q.visibility === "internal") {
        delete obj.responseCount;
      }
      return obj;
    });

    return NextResponse.json(
      { success: true, questions: payload, hasMore, nextCursor },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching questions:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
