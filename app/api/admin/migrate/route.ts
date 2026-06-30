import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import UserModel from "@/models/user.model";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";

/**
 * TEMPORARY one-time migration route (SignalHQ Phase 1 backfill).
 *
 * For every existing user it ensures a personal Organization + OWNER
 * Membership, then stamps `organizationId` on that user's existing Questions
 * and Messages. Idempotent and re-runnable.
 *
 * Safety:
 *  - Gated by the `x-migration-secret` header (must equal MIGRATION_SECRET).
 *  - Dry-run by default: a plain POST only reports. Pass `?dryRun=false` to write.
 *
 * Remove this route once the live backfill is verified.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Minimal slugify — no new dependency. Lowercase, alphanumeric + hyphens.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-migration-secret");
  if (
    !process.env.MIGRATION_SECRET ||
    secret !== process.env.MIGRATION_SECRET
  ) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  // Dry-run unless explicitly disabled with ?dryRun=false
  const dryRun =
    new URL(request.url).searchParams.get("dryRun") !== "false";

  await connectDB();

  const summary = {
    dryRun,
    usersProcessed: 0,
    orgsCreated: 0,
    orgsReused: 0,
    membershipsCreated: 0,
    membershipsExisting: 0,
    questionsStamped: 0,
    messagesStamped: 0,
    slugCollisions: 0,
    errors: [] as { userId: string; error: string }[],
  };

  try {
    const users = await UserModel.find({}).select("_id name username");

    for (const user of users) {
      try {
        summary.usersProcessed++;

        // 1. Find-or-create the user's personal organization.
        //    Keyed on `createdBy` (set once at creation) so re-runs are safe
        //    regardless of slug.
        let org = await OrganizationModel.findOne({
          createdBy: user._id,
        }).sort({ createdAt: 1 });

        if (org) {
          summary.orgsReused++;
        } else {
          // Deterministic, unique slug derived from the (unique) username.
          const base =
            slugify(user.username) || `org-${String(user._id).slice(-6)}`;
          let slug = base;
          const clash = await OrganizationModel.findOne({ slug });
          if (clash) {
            slug = `${base}-${String(user._id).slice(-6)}`;
            summary.slugCollisions++;
          }

          if (!dryRun) {
            org = await OrganizationModel.create({
              name: user.name || user.username,
              slug,
              createdBy: user._id,
            });
          }
          summary.orgsCreated++;
        }

        // 2. Ensure an OWNER membership for this user on their org.
        if (org) {
          const existingMembership = await MembershipModel.findOne({
            organizationId: org._id,
            userId: user._id,
          });
          if (existingMembership) {
            summary.membershipsExisting++;
          } else {
            if (!dryRun) {
              await MembershipModel.create({
                organizationId: org._id,
                userId: user._id,
                role: "OWNER",
              });
            }
            summary.membershipsCreated++;
          }
        } else {
          // dryRun with no existing org: a membership would be created too.
          summary.membershipsCreated++;
        }

        // 3. Stamp organizationId on the user's questions and messages.
        //    `organizationId: null` matches both null and missing fields.
        const questionFilter = {
          userId: user._id,
          organizationId: null,
        };
        const messageFilter = {
          createdFor: user._id,
          organizationId: null,
        };

        if (dryRun) {
          summary.questionsStamped +=
            await QuestionModel.countDocuments(questionFilter);
          summary.messagesStamped +=
            await MessageModel.countDocuments(messageFilter);
        } else {
          const qRes = await QuestionModel.updateMany(questionFilter, {
            $set: { organizationId: org!._id },
          });
          const mRes = await MessageModel.updateMany(messageFilter, {
            $set: { organizationId: org!._id },
          });
          summary.questionsStamped += qRes.modifiedCount;
          summary.messagesStamped += mRes.modifiedCount;
        }
      } catch (err) {
        summary.errors.push({
          userId: String(user._id),
          error: (err as Error).message,
        });
      }
    }

    // Orphan signal: records still without an org after the run are owned by a
    // user that no longer exists (or, in dry-run, simply not yet stamped).
    const leftoverQuestions = await QuestionModel.countDocuments({
      organizationId: null,
    });
    const leftoverMessages = await MessageModel.countDocuments({
      organizationId: null,
    });

    return NextResponse.json({
      success: true,
      summary: { ...summary, leftoverQuestions, leftoverMessages },
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
