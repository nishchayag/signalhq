import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import { checkRateLimit } from "@/lib/rateLimit";
import connectDB from "@/lib/connectDB";
import { aiText, isAiEnabled, logAiError } from "@/lib/ai";

export const maxDuration = 30;

const PROMPT = [
  "Generate 3 concise and thoughtful questions that can be used to collect anonymous feedback from clients.",
  "Make them varied in tone and purpose (e.g., performance, collaboration, growth).",
  "Return them as a single string, separated by double pipe symbols: ||",
  "Example format:",
  "What can we improve on?||How effectively do we communicate during meetings?||What's one thing we could do to enhance your experience with us?",
  "Now generate a fresh set of 3 feedback questions in the same format.",
].join(" ");

// POST /api/suggestMessages — AI-generated feedback question suggestions for
// the "create question" dialog. Authenticated + rate-limited per user since
// every call spends provider quota.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?._id) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "AI suggestions are not configured on this server." },
      { status: 503 }
    );
  }

  try {
    // checkRateLimit is a Mongo query: connect first (a cold serverless
    // instance has no connection yet, so the query would buffer and time out
    // outside any try/catch).
    await connectDB();
    const allowed = await checkRateLimit(
      `suggestMessages:${session.user._id}`,
      20,
      60 * 60 * 1000
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many suggestion requests. Please try again later." },
        { status: 429 }
      );
    }

    const completion = await aiText({
      feature: "suggest",
      tier: "fast",
      prompt: PROMPT,
    });

    return NextResponse.json({ completion });
  } catch (error) {
    logAiError("suggest", error);
    return NextResponse.json(
      { error: "Failed to generate feedback suggestions." },
      { status: 500 }
    );
  }
}
