import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/connectDB";
import { can } from "@/lib/permissions";
import { withErrorHandling } from "@/lib/apiHandler";
import { loadAndAuthorize } from "@/lib/questionAccess";
import { checkRateLimit } from "@/lib/rateLimit";
import { questionType } from "@/lib/answers";
import {
  ANALYTICS_RATE_LIMIT,
  analyticsRateKey,
  capProgress,
  createdAtClause,
  parseStatsRange,
  questionAggregates,
  rangeJson,
} from "@/lib/responseStats";

type Ctx = { params: Promise<{ questionId: string }> };

// GET /api/analytics/questions/[questionId] — one question's response stats.
// Params and the response shape are documented at the top of
// lib/responseStats.ts.
export const GET = withErrorHandling(async (request: NextRequest, { params }: Ctx) => {
  await connectDB();
  const { questionId } = await params;
  // 401 / 404 (bad id, missing, not a member, other team) as the question GET.
  const authz = await loadAndAuthorize(questionId);
  if (!authz.ok) return authz.response;
  const { question, role } = authz;

  // Multi-tenant backfill is complete (0 org-less questions in prod); treat one as not-found rather than relying on the invariant.
  if (!question.organizationId || !role) {
    return NextResponse.json({ success: false, message: "Question not found" }, { status: 404 });
  }

  const internal = question.visibility === "internal";
  if (!can(role, "message:read") || (internal && !can(role, "question:viewAllReplies"))) {
    return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });
  }

  const { limit, windowMs } = ANALYTICS_RATE_LIMIT;
  if (!(await checkRateLimit(analyticsRateKey(authz.userId), limit, windowMs))) {
    return NextResponse.json(
      { success: false, message: "Too many analytics requests. Please try again later." },
      { status: 429 }
    );
  }

  const parsed = parseStatsRange(new URL(request.url).searchParams, {
    defaultFrom: question.createdAt,
  });
  if (!parsed.ok) {
    return NextResponse.json({ success: false, message: parsed.message }, { status: 400 });
  }
  const { range } = parsed;

  // organizationId + questionId + createdAt: the {organizationId, questionId,
  // createdAt} index (legacy org-less questions use {questionId, createdAt}).
  // An internal question's responses ARE members' private threads (only
  // OWNER/ADMIN get this far); a public question never includes them.
  const match: Record<string, unknown> = {};
  if (question.organizationId) {
    match.organizationId = new mongoose.Types.ObjectId(String(question.organizationId));
  }
  match.questionId = new mongoose.Types.ObjectId(String(question._id));
  Object.assign(match, createdAtClause(range));
  if (!internal) match.authorType = { $ne: "member" };

  const agg = await questionAggregates(question, match, range);

  return NextResponse.json({
    success: true,
    range: rangeJson(range),
    question: {
      id: String(question._id),
      questionText: question.questionText,
      type: questionType(question),
      visibility: question.visibility ?? "public",
    },
    ...agg,
    cap: capProgress(question),
  });
});
