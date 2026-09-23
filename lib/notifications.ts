import UserModel from "@/models/user.model";
import { sendNotificationEmail } from "@/lib/mailService";

/**
 * Called from every route that creates a Message, right after `createdFor`
 * is known. Branches on the recipient's notificationPreference:
 * - "off": no-op.
 * - "immediate": sends a single-message email right away.
 * - "daily": just increments a counter — the daily cron
 *   (app/api/cron/notifications) flushes it into one digest email later, so
 *   a recipient getting replies constantly isn't emailed on every one.
 * Never throws — a notification failure shouldn't fail the message send.
 */
export async function notifyNewMessage(userId: string | { toString(): string }) {
  try {
    const user = await UserModel.findById(userId).select(
      "email name notificationPreference"
    );
    if (!user) return;

    if (user.notificationPreference === "off") return;

    if (user.notificationPreference === "immediate") {
      await sendNotificationEmail({
        email: user.email,
        name: user.name,
        count: 1,
        dashboardUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`,
      });
      return;
    }

    // "daily" (and the default for any pre-migration user without the field)
    await UserModel.findByIdAndUpdate(userId, {
      $inc: { pendingNotificationCount: 1 },
    });
  } catch (error) {
    console.error("Error notifying user of new message:", error);
  }
}

/**
 * Daily digest flush, called by the cron. Claim-then-send per user:
 *
 *   1. Atomically claim the count we read: $inc by -N, but only while at
 *      least N is still pending. If the claim fails (another run already
 *      took it), skip the user — so an overlapping or repeated cron run
 *      can't double-send or drive the counter negative.
 *   2. Send one email for those N messages.
 *   3. If the send fails, give the N back so tomorrow's digest includes them.
 *
 * Messages that arrive between the read and the claim just stay pending for
 * the next digest — the old `set to 0` reset silently dropped them.
 */
export async function flushDailyDigests(limit = 500): Promise<{ sent: number; failed: number; total: number }> {
  const pendingUsers = await UserModel.find({
    notificationPreference: "daily",
    pendingNotificationCount: { $gt: 0 },
  })
    .select("email name pendingNotificationCount")
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const user of pendingUsers) {
    const count = user.pendingNotificationCount as number;
    try {
      const claimed = await UserModel.findOneAndUpdate(
        { _id: user._id, pendingNotificationCount: { $gte: count } },
        { $inc: { pendingNotificationCount: -count } }
      );
      if (!claimed) continue;

      const ok = await sendNotificationEmail({
        email: user.email,
        name: user.name,
        count,
        dashboardUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`,
      });
      if (ok) {
        sent++;
      } else {
        failed++;
        await UserModel.updateOne({ _id: user._id }, { $inc: { pendingNotificationCount: count } });
      }
    } catch (error) {
      failed++;
      console.error("Error flushing digest for user", String(user._id), error);
    }
  }
  return { sent, failed, total: pendingUsers.length };
}
