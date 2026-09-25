import mongoose from "mongoose";
import QuestionModel from "@/models/question.model";
import { questionType, type QuestionType } from "@/lib/answers";

// Atomic response-slot claim for the submit routes. No transactions (the
// test DB is a standalone mongod, and the claim must be safe there too): one
// conditional `$inc` either takes a slot or doesn't, and a failed save gives
// it back with a compensating decrement.

/**
 * Take one response slot on a question, or return false when it's closed
 * (past `closesAt`, or `responseCount` already at `maxResponses`), inactive,
 * or its type changed since the caller parsed the body against it.
 * Parallel callers can't overshoot the cap: the check and the increment are
 * one document update.
 */
export async function claimResponseSlot(
  questionId: string | mongoose.Types.ObjectId,
  expectedType: QuestionType,
  now: Date = new Date()
): Promise<boolean> {
  const claimed = await QuestionModel.findOneAndUpdate(
    {
      _id: questionId,
      isActive: true,
      // Missing type reads as text (pre-typed-questions documents).
      ...(expectedType === "text"
        ? { type: { $in: ["text", null] } }
        : { type: expectedType }),
      $and: [
        { $or: [{ closesAt: null }, { closesAt: { $gt: now } }] },
        {
          $or: [
            { maxResponses: null },
            { $expr: { $lt: [{ $ifNull: ["$responseCount", 0] }, "$maxResponses"] } },
          ],
        },
      ],
    },
    { $inc: { responseCount: 1 } },
    { new: true, projection: { _id: 1 } }
  ).lean();
  return Boolean(claimed);
}

/** Give a claimed slot back (the message save failed). Never below 0. */
export async function releaseResponseSlot(
  questionId: string | mongoose.Types.ObjectId
): Promise<void> {
  await QuestionModel.updateOne(
    { _id: questionId, responseCount: { $gt: 0 } },
    { $inc: { responseCount: -1 } }
  );
}

/**
 * claim → save → (release on failure). Returns null when the question is
 * closed; rethrows the save's error after releasing.
 */
export async function withResponseSlot<T>(
  question: { _id: unknown; type?: QuestionType | null },
  save: () => Promise<T>
): Promise<T | null> {
  const id = question._id as mongoose.Types.ObjectId;
  if (!(await claimResponseSlot(id, questionType(question)))) return null;
  try {
    return await save();
  } catch (err) {
    await releaseResponseSlot(id);
    throw err;
  }
}

/** The uniform 410 body for a closed question's POST. */
export const QUESTION_CLOSED = {
  success: false,
  code: "QUESTION_CLOSED",
  message: "This question is no longer accepting responses.",
} as const;
