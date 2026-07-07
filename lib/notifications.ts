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
