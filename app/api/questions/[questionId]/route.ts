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
  type PulseUpdateInput,
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
import { getOrgPlan } from "@/lib/aiQuota";
import { hasFeature } from "@/lib/plans";
import { pulseSummary, type QuestionPulseLike } from "@/lib/pulse";
import { resolveTimeZone, localYmd } from "@/lib/zonedDate";

const pulsePlanGate = () =>
  NextResponse.json(
    {
      success: false,
      message: "Recurring pulse surveys are available on the Pro plan and up.",
      code: "PLAN_UPGRADE_REQUIRED",
    },
    { status: 403 }
  );

/** Merge a (possibly partial) pulse update onto the question's current
 * pulse — same "resend only what changed, carry the rest over" pattern as
 * config edits. Null when the result is still missing a required field
 * (e.g. `remind` sent alone on a question with no existing pulse). */
function mergePulseInput(
  input: PulseUpdateInput,
  current: QuestionPulseLike | undefined
): { cadence: QuestionPulseLike["cadence"]; anchorDate: string; timeZone: string; remind: boolean } | null {
  const cadence = input.cadence ?? current?.cadence;
  const anchorDate = input.anchorDate ?? current?.anchorDate;
  const timeZone = input.timeZone ?? current?.timeZone;
  const remind = input.remind ?? current?.remind ?? true;
  if (!cadence || !anchorDate || !timeZone) return null;
  return { cadence, anchorDate, timeZone, remind };
}

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
    if (question.pulse) {
      question.pulse = pulseSummary(question.pulse as QuestionPulseLike);
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

    const {
      type: nextTypeInput,
      config: configInput,
      closesAt,
      maxResponses,
      pulse: pulseInput,
      ...plain
    } = result.data;
    const current = authz.question;
    const currentType = questionType(current);
    const $set: Record<string, unknown> = { ...plain };
    const $unset: Record<string, ""> = {};

    // Type/config: validate the merged, post-edit state, then check the lock.
    let typeStructural = false;
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
      typeStructural =
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

    const nextMaxResponses = maxResponses !== undefined ? maxResponses : current.maxResponses;

    // Recurring pulse: OWNER/ADMIN + PRO+ only, same gate as create. Any
    // touch to `pulse` (even just `remind`) needs it, not only a change to
    // the schedule itself — matches org:branding's "gate at write time".
    let pulseStructural = false;
    let pulseSet: {
      cadence: QuestionPulseLike["cadence"];
      anchorDate: string;
      timeZone: string;
      remind: boolean;
    } | undefined;
    if (pulseInput !== undefined) {
      if (!can(authz.role, "question:pulse")) {
        return NextResponse.json(
          { success: false, message: "Insufficient permissions" },
          { status: 403 }
        );
      }
      const plan = current.organizationId ? await getOrgPlan(current.organizationId) : "FREE";
      if (!hasFeature(plan, "pulse")) return pulsePlanGate();

      const currentPulse = current.pulse as QuestionPulseLike | undefined;
      const merged = mergePulseInput(pulseInput, currentPulse);
      if (!merged) {
        return NextResponse.json(
          {
            success: false,
            message: "A recurring schedule needs a cadence, start date and time zone",
          },
          { status: 400 }
        );
      }
      const tz = resolveTimeZone(merged.timeZone);
      if (!tz) {
        return NextResponse.json(
          { success: false, message: "Invalid time zone" },
          { status: 400 }
        );
      }
      // Only re-check "today or later" when the anchor is actually changing —
      // an untouched past anchor on an already-running pulse is fine.
      const anchorChanged = pulseInput.anchorDate !== undefined;
      if (anchorChanged && merged.anchorDate < localYmd(new Date(), tz)) {
        return NextResponse.json(
          { success: false, message: "Start date must be today or later" },
          { status: 400 }
        );
      }
      pulseSet = { cadence: merged.cadence, anchorDate: merged.anchorDate, timeZone: tz, remind: merged.remind };
      pulseStructural =
        !currentPulse ||
        (pulseInput.cadence !== undefined && pulseInput.cadence !== currentPulse.cadence) ||
        (pulseInput.anchorDate !== undefined && pulseInput.anchorDate !== currentPulse.anchorDate) ||
        (pulseInput.timeZone !== undefined && tz !== currentPulse.timeZone);
      // Dot-notation sets (not a whole-subdocument replace) so an edit that
      // only touches `remind` doesn't clobber lastRemindedRound/lastRemindedAt.
      // A genuinely new schedule (new pulse, or the cadence/anchor/zone
      // itself changing) resets the reminder claim — the old round numbers
      // no longer mean anything against the new schedule.
      $set["pulse.cadence"] = pulseSet.cadence;
      $set["pulse.anchorDate"] = pulseSet.anchorDate;
      $set["pulse.timeZone"] = pulseSet.timeZone;
      $set["pulse.remind"] = pulseSet.remind;
      if (pulseStructural) {
        $set["pulse.lastRemindedRound"] = -1;
        $unset["pulse.lastRemindedAt"] = "";
      }
    }

    const nextHasPulse = pulseInput !== undefined ? Boolean(pulseSet) : Boolean(current.pulse);
    if (nextHasPulse && nextMaxResponses != null) {
      return NextResponse.json(
        { success: false, message: "A recurring question can't have a response cap" },
        { status: 400 }
      );
    }
    if (nextHasPulse && current.visibility === "internal") {
      return NextResponse.json(
        { success: false, message: "A recurring question can't be internal" },
        { status: 400 }
      );
    }
    if (maxResponses !== undefined) {
      if (maxResponses === null) $unset.maxResponses = "";
      else $set.maxResponses = maxResponses;
    }

    const structural = typeStructural || pulseStructural;

    // Changing the type/options, or the pulse schedule, after the first
    // answer would orphan stored answers or make past rounds meaningless.
    // responseCount is the fast check; the message probe covers legacy
    // counts that drifted. The update is also conditional on the count
    // still being 0, so an answer landing in between can't slip past.
    const lockedResponse = () =>
      NextResponse.json(
        pulseStructural && !typeStructural
          ? {
              success: false,
              code: "PULSE_LOCKED",
              message: "This question already has responses, so its recurring schedule can't change.",
            }
          : {
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

    const questionObj = question.toObject() as unknown as Record<string, unknown>;
    if (questionObj.pulse) {
      questionObj.pulse = pulseSummary(questionObj.pulse as QuestionPulseLike);
    }

    return NextResponse.json(
      { success: true, message: "Question updated successfully", question: questionObj },
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

    // Reactivating a pulse question is gated the same as creating one — a
    // downgraded org's existing pulse keeps collecting responses while
    // active, but can't be turned back on once paused.
    if (isActive && authz.question.pulse) {
      const plan = authz.question.organizationId
        ? await getOrgPlan(authz.question.organizationId)
        : "FREE";
      if (!hasFeature(plan, "pulse")) return pulsePlanGate();
    }

    const question = await QuestionModel.findByIdAndUpdate(
      questionId,
      { isActive },
      { new: true }
    );

    const questionObj = question?.toObject() as Record<string, unknown> | undefined;
    if (questionObj?.pulse) {
      questionObj.pulse = pulseSummary(questionObj.pulse as QuestionPulseLike);
    }

    return NextResponse.json(
      {
        success: true,
        message: `Question ${isActive ? "activated" : "deactivated"} successfully`,
        question: questionObj,
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
