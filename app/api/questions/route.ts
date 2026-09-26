import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import QuestionModel from "@/models/question.model";
import TeamModel from "@/models/team.model";
import { createQuestionSchema, normalizeQuestionConfig } from "@/schemas/questionSchema";
import { assignOptionIds } from "@/lib/answers";
import { resolveActiveContext } from "@/lib/orgContext";
import { can } from "@/lib/permissions";
import { nanoid } from "nanoid";
import { parsePagination, paginate } from "@/lib/pagination";
import { teamScopeFilter } from "@/lib/questionAccess";
import { isValidObjectId } from "@/lib/objectId";
import { checkRateLimit } from "@/lib/rateLimit";

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

    const allowed = await checkRateLimit(`createQuestion:${session!.user._id}`, 30, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, message: "Too many questions created. Please try again later." },
        { status: 429 }
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

    const { questionText, description, teamId, visibility, closesAt, maxResponses } = result.data;
    const type = result.data.type ?? "text";
    const normalized = normalizeQuestionConfig(type, result.data.config);
    const config = normalized && {
      ...normalized,
      ...(normalized.options && { options: assignOptionIds(normalized.options) }),
    };

    // Validate the team (if any) belongs to this org — and, for a MEMBER,
    // that they're actually on it (they can't see other teams' questions,
    // so they mustn't be able to create questions inside those teams).
    if (teamId) {
      if (!isValidObjectId(teamId)) {
        return NextResponse.json(
          { success: false, message: "Team not found in this organization" },
          { status: 400 }
        );
      }
      const team = await TeamModel.findOne({
        _id: teamId,
        organizationId: ctx.organizationId,
        ...(ctx.role === "MEMBER" ? { members: session!.user._id } : {}),
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
      type,
      ...(config && { config }),
      ...(closesAt && { closesAt: new Date(closesAt) }),
      ...(typeof maxResponses === "number" && { maxResponses }),
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
          type: question.type,
          config: question.config,
          closesAt: question.closesAt,
          maxResponses: question.maxResponses,
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
        "questionText description slug isActive teamId visibility responseCount type config closesAt maxResponses createdAt"
      );
    const { page, hasMore, nextCursor } = paginate(fetched, limit);

    // Members' answers to internal questions are private threads — exposing
    // responseCount would let a MEMBER infer how many colleagues answered.
    const canSeeAllReplies = can(ctx.role, "question:viewAllReplies");
    const payload = page.map((q) => {
      const obj = q.toObject() as unknown as Record<string, unknown>;
      if (!canSeeAllReplies && q.visibility === "internal") {
        delete obj.responseCount;
        // The cap would reveal the count once the question closes on it.
        delete obj.maxResponses;
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
