import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import AiInsightModel from "@/models/aiInsight.model";
import {
  normalizeQuestionConfig,
  questionConfigIssues,
  updateQuestionSchema,
  type QuestionConfigInput,
} from "@/schemas/questionSchema";
import { assignOptionIds, isChoiceType, questionType, sameOptionIds } from "@/lib/answers";
import { can } from "@/lib/permissions";
import { loadAndAuthorize } from "@/lib/questionAccess";
import { parsePagination, paginate } from "@/lib/pagination";
import { buildMessageListFilter } from "@/lib/messageListQuery";
import { effectiveReadSince } from "@/lib/readState";
import { withAiView } from "@/lib/messageView";
import { scheduleLazySweep } from "@/lib/aiEnrichment";
import { isSemanticRequest, semanticListResponse } from "@/lib/semanticSearch";

// Room for the post-response lazy enrichment sweep (runAfter) on Vercel.
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();
  try {
    const { questionId } = await params;
    const authz = await loadAndAuthorize(questionId);
    if (!authz.ok) return authz.response;

    const base = {
      questionId,
      // Member-authored private threads (internal questions) are never
      // returned here — this general endpoint is org-membership-gated only,
      // not per-thread-owner-gated. They're only reachable through the
      // dedicated question:answer / question:viewAllReplies routes, which
      // enforce per-member thread privacy.
      authorType: { $ne: "member" },
    };
    const { searchParams } = new URL(request.url);
    const viewer = {
      userId: authz.userId,
      role: authz.role,
      readSince: authz.membership ? effectiveReadSince(authz.membership) : null,
    };

    // Same privacy rule as the list endpoint: a MEMBER must not learn how
    // many colleagues answered an internal question.
    const question = authz.question.toObject() as Record<string, unknown>;
    if (
      authz.question.visibility === "internal" &&
      authz.role &&
      !can(authz.role, "question:viewAllReplies")
    ) {
      delete question.responseCount;
      delete question.maxResponses;
    }

    // ?mode=semantic&q=… — ranked by meaning, no pagination (see
    // lib/semanticSearch.ts). Same scoped filter as the regex path.
    if (isSemanticRequest(request.url)) {
      if (!can(authz.role, "message:read")) {
        return NextResponse.json(
          { success: false, message: "Insufficient permissions" },
          { status: 403 }
        );
      }
      return semanticListResponse({
        url: request.url,
        userId: viewer.userId,
        readSince: viewer.readSince,
        role: authz.role,
        orgId: authz.question.organizationId,
        filter: buildMessageListFilter({ base, searchParams, viewer, mode: "semantic" }),
        extra: { question },
      });
    }

    const { limit } = parsePagination(request);
    const filter = buildMessageListFilter({ base, searchParams, viewer });
    const fetched = await MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .select("+ai +readBy");
    const { page, hasMore, nextCursor } = paginate(fetched, limit);
    scheduleLazySweep(authz.question.organizationId);

    return NextResponse.json(
      {
        success: true,
        question,
        messages: withAiView(page, authz.role, {
          viewerId: viewer.userId,
          readSince: viewer.readSince,
        }),
        hasMore,
        nextCursor,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching question:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();
  try {
    const { questionId } = await params;
    const authz = await loadAndAuthorize(questionId, "question:update");
    if (!authz.ok) return authz.response;

    const body = await request.json();
    const result = updateQuestionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: "Invalid input", errors: result.error.format() },
        { status: 400 }
      );
    }

    const { type: nextTypeInput, config: configInput, closesAt, maxResponses, ...plain } =
      result.data;
    const current = authz.question;
    const currentType = questionType(current);
    const $set: Record<string, unknown> = { ...plain };
    const $unset: Record<string, ""> = {};

    // Type/config: validate the merged, post-edit state, then check the lock.
    let structural = false;
    if (nextTypeInput !== undefined || configInput !== undefined) {
      const nextType = nextTypeInput ?? currentType;
      const currentConfig = current.config
        ? (JSON.parse(JSON.stringify(current.config)) as QuestionConfigInput)
        : undefined;
      // No config sent ⇒ carry the current one over (normalize drops keys the
      // new type doesn't use, so single ↔ multi keeps its options).
      const merged = configInput !== undefined ? configInput : currentConfig;
      const issues = questionConfigIssues(nextType, merged);
      if (issues.length > 0) {
        return NextResponse.json(
          { success: false, message: issues[0].message, errors: issues },
          { status: 400 }
        );
      }
      const normalized = normalizeQuestionConfig(nextType, merged);
      const options =
        normalized?.options &&
        assignOptionIds(normalized.options, (current.config?.options ?? []).map((o) => o.id));
      const config = normalized && { ...normalized, ...(options && { options }) };
      structural =
        nextType !== currentType ||
        (isChoiceType(nextType) && !sameOptionIds(options, current.config?.options));
      $set.type = nextType;
      if (config) $set.config = config;
      else $unset.config = "";
    }
    if (closesAt !== undefined) {
      if (closesAt === null) $unset.closesAt = "";
      else $set.closesAt = new Date(closesAt);
    }
    if (maxResponses !== undefined) {
      if (maxResponses === null) $unset.maxResponses = "";
      else $set.maxResponses = maxResponses;
    }

    // Changing the type or the option ids after the first answer would orphan
    // every stored answer. responseCount is the fast check; the message probe
    // covers legacy counts that drifted. The update is also conditional on the
    // count still being 0, so an answer landing in between can't slip past.
    const lockedResponse = () =>
      NextResponse.json(
        {
          success: false,
          code: "QUESTION_LOCKED",
          message: "This question already has responses, so its type and options can't change.",
        },
        { status: 409 }
      );
    if (structural) {
      if ((current.responseCount ?? 0) > 0 || (await MessageModel.exists({ questionId }))) {
        return lockedResponse();
      }
    }

    const update: Record<string, unknown> = {};
    if (Object.keys($set).length > 0) update.$set = $set;
    if (Object.keys($unset).length > 0) update.$unset = $unset;
    const question = await QuestionModel.findOneAndUpdate(
      structural
        ? { _id: questionId, responseCount: { $in: [0, null] } }
        : { _id: questionId },
      update,
      { new: true, runValidators: true }
    );
    if (!question) {
      if (structural) return lockedResponse();
      return NextResponse.json(
        { success: false, message: "Question not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: "Question updated successfully", question },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating question:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();
  try {
    const { questionId } = await params;
    const authz = await loadAndAuthorize(questionId, "question:update");
    if (!authz.ok) return authz.response;

    const { isActive } = await request.json();
    if (typeof isActive !== "boolean") {
      return NextResponse.json(
        { success: false, message: "isActive must be a boolean" },
        { status: 400 }
      );
    }

    const question = await QuestionModel.findByIdAndUpdate(
      questionId,
      { isActive },
      { new: true }
    );

    return NextResponse.json(
      {
        success: true,
        message: `Question ${isActive ? "activated" : "deactivated"} successfully`,
        question,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating question status:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();
  try {
    const { questionId } = await params;
    const authz = await loadAndAuthorize(questionId, "question:delete");
    if (!authz.ok) return authz.response;

    const deletedMessages = await MessageModel.deleteMany({ questionId });
    await AiInsightModel.deleteOne({ scope: "question", questionId });
    await QuestionModel.findByIdAndDelete(questionId);

    return NextResponse.json(
      {
        success: true,
        message: `Question and ${deletedMessages.deletedCount} response(s) deleted successfully`,
        deletedResponses: deletedMessages.deletedCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting question:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
