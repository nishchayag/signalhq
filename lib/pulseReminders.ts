import mongoose from "mongoose";
import QuestionModel from "@/models/question.model";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import TeamModel from "@/models/team.model";
import UserModel from "@/models/user.model";
import { roundAt, type QuestionPulseLike } from "@/lib/pulse";
import { hasFeature } from "@/lib/plans";
import { sendPulseReminderBatch } from "@/lib/mailService";
import { buildPublicUrl } from "@/lib/publicUrl";

// Round-open email reminders for recurring (pulse) questions — a separate
// module from lib/notifications.ts (same reasoning as lib/webhooks.ts):
// this has its own recipient rules (team-scoped, org-wide rather than
// per-message) and its own claim-then-send shape (per question+round,
// not per user).

type Id = string | mongoose.Types.ObjectId;

const BATCH_CHUNK_SIZE = 100;
const STALE_CAP_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Who gets a reminder for this question's org (optionally narrowed to one
 * team): current, unmuted members — intersected with the team's member list
 * when the question is team-scoped — excluding unverified users and anyone
 * with notifications off. No per-recipient personalization: every email in
 * the batch is otherwise identical (lib/mailService.ts#sendPulseReminderBatch).
 */
async function recipientsFor(organizationId: Id, teamId: Id | null | undefined): Promise<string[]> {
  const memberships = await MembershipModel.find({
    organizationId,
    notificationsMuted: { $ne: true },
  })
    .select("userId")
    .lean();
  let userIds = memberships.map((m) => String(m.userId));
  if (teamId) {
    const team = await TeamModel.findOne({ _id: teamId, organizationId }).select("members").lean();
    const allowed = new Set((team?.members ?? []).map((m) => String(m)));
    userIds = userIds.filter((id) => allowed.has(id));
  }
  if (userIds.length === 0) return [];

  const users = await UserModel.find({
    _id: { $in: userIds },
    isVerified: true,
    notificationPreference: { $ne: "off" },
  })
    .select("email")
    .lean<{ email: string }[]>();
  return users.map((u) => u.email).filter(Boolean);
}

export interface PulseReminderResult {
  /** Active, remind-on pulse questions found across every org. */
  candidates: number;
  /** Questions for which at least one recipient batch was sent. */
  sent: number;
  /** Claims rolled back because nothing could be sent at all. */
  restored: number;
  /** Not yet open, already reminded this round, too stale, downgraded, or
   * no recipients. */
  skipped: number;
}

interface PulseCandidate {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId;
  questionText: string;
  slug: string;
  pulse: QuestionPulseLike & { lastRemindedRound: number; lastRemindedAt?: Date };
}

/**
 * Send one round-open reminder batch per pulse question that just entered a
 * new round, called first (its own short deadline) in the daily cron —
 * app/api/cron/notifications/route.ts.
 *
 * Per question: skip if scheduled (round index < 0), already reminded for
 * this round or later, or the round is stale (started more than
 * `min(3 days, half the round length)` ago — no point nagging about a round
 * that's mostly over). Otherwise atomically claim the round
 * (`findOneAndUpdate` on `pulse.lastRemindedRound < r`), so two overlapping
 * cron runs can only have one of them send. If literally nothing could be
 * sent (the first chunk failed), the claim is rolled back so the next run
 * retries from scratch; a later chunk failing after some recipients already
 * got the email is logged but not rolled back (retrying would duplicate
 * those sends).
 */
export async function sendPulseReminders({
  deadline = Infinity,
  now = new Date(),
}: { deadline?: number; now?: Date } = {}): Promise<PulseReminderResult> {
  const candidates = await QuestionModel.find({
    isActive: true,
    "pulse.remind": true,
  })
    .select("organizationId teamId questionText slug pulse")
    .lean<PulseCandidate[]>();

  let sent = 0;
  let restored = 0;
  let skipped = 0;
  if (candidates.length === 0) {
    return { candidates: 0, sent, restored, skipped };
  }

  const orgIds = [
    ...new Set(candidates.filter((q) => q.organizationId).map((q) => String(q.organizationId))),
  ];
  const orgs = await OrganizationModel.find({ _id: { $in: orgIds } })
    .select("name slug plan")
    .lean<{ _id: mongoose.Types.ObjectId; name: string; slug: string; plan?: string }[]>();
  const orgById = new Map(orgs.map((o) => [String(o._id), o]));

  for (const q of candidates) {
    if (Date.now() >= deadline) break;

    const org = q.organizationId ? orgById.get(String(q.organizationId)) : undefined;
    // No org (legacy question), or a downgraded org: no reminders, but the
    // pulse itself keeps collecting responses (enforced at write time, not
    // here — see app/api/questions/route.ts and [questionId]/route.ts).
    if (!org || !hasFeature((org.plan as "FREE" | "PRO" | "ENTERPRISE") ?? "FREE", "pulse")) {
      skipped++;
      continue;
    }

    const { index: r, startsAt, endsAt } = roundAt(q.pulse, now);
    if (r < 0) {
      skipped++;
      continue;
    }
    const previousRound = q.pulse.lastRemindedRound ?? -1;
    if (previousRound >= r) {
      skipped++;
      continue;
    }
    const roundLenMs = endsAt.getTime() - startsAt.getTime();
    const staleThreshold = Math.min(STALE_CAP_MS, roundLenMs / 2);
    if (now.getTime() - startsAt.getTime() > staleThreshold) {
      skipped++;
      continue;
    }

    // Atomic claim: only a run that still sees the pre-reminder round wins,
    // so two overlapping cron calls send exactly one batch between them.
    const claimed = await QuestionModel.findOneAndUpdate(
      { _id: q._id, "pulse.lastRemindedRound": { $lt: r } },
      { $set: { "pulse.lastRemindedRound": r, "pulse.lastRemindedAt": now } }
    );
    if (!claimed) {
      skipped++;
      continue;
    }

    const restoreClaim = async () => {
      const restore: Record<string, unknown> = { $set: { "pulse.lastRemindedRound": previousRound } };
      if (q.pulse.lastRemindedAt) {
        (restore.$set as Record<string, unknown>)["pulse.lastRemindedAt"] = q.pulse.lastRemindedAt;
      } else {
        restore.$unset = { "pulse.lastRemindedAt": "" };
      }
      await QuestionModel.updateOne({ _id: q._id, "pulse.lastRemindedRound": r }, restore);
    };

    const recipients = q.organizationId ? await recipientsFor(q.organizationId, q.teamId) : [];
    if (recipients.length === 0) {
      // Nobody to send to isn't a failure — leave the claim in place so a
      // member added mid-round doesn't retroactively trigger a resend.
      skipped++;
      continue;
    }

    const publicUrl = buildPublicUrl(`/o/${org.slug}/q/${q.slug}`);
    const settingsUrl = buildPublicUrl("/dashboard/account#notifications");
    const chunks = chunk(recipients, BATCH_CHUNK_SIZE);
    let anySent = false;
    for (let i = 0; i < chunks.length; i++) {
      const ok = await sendPulseReminderBatch({
        recipients: chunks[i],
        orgName: org.name,
        questionText: q.questionText,
        publicUrl,
        settingsUrl,
        idempotencyKey: `pulse:${q._id}:${r}:${i}`,
      });
      if (ok) {
        anySent = true;
        continue;
      }
      if (i === 0) {
        await restoreClaim();
        restored++;
      } else {
        console.error(`Pulse reminder chunk ${i} failed for question ${q._id}`);
      }
      break;
    }
    if (anySent) sent++;
  }

  return { candidates: candidates.length, sent, restored, skipped };
}
