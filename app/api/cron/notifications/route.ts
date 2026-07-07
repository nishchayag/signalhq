import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import UserModel from "@/models/user.model";
import { sendNotificationEmail } from "@/lib/mailService";

/**
 * GET /api/cron/notifications — daily digest flush, triggered by the Vercel
 * Cron schedule in vercel.json (once/day, the max frequency Hobby-tier cron
 * allows). Sends one digest email per user with pending "daily"-preference
 * notifications, then resets their counter. Gated on CRON_SECRET so it can't
 * be triggered by anyone else.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  await connectDB();

  const pendingUsers = await UserModel.find({
    notificationPreference: "daily",
    pendingNotificationCount: { $gt: 0 },
  }).select("email name pendingNotificationCount");

  let sent = 0;
  for (const user of pendingUsers) {
    const ok = await sendNotificationEmail({
      email: user.email,
      name: user.name,
      count: user.pendingNotificationCount,
      dashboardUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`,
    });
    // Only reset the counter on a confirmed send — a transient email failure
    // should let the count carry over and get flushed the next day instead
    // of silently dropping those notifications.
    if (ok) {
      await UserModel.findByIdAndUpdate(user._id, { pendingNotificationCount: 0 });
      sent++;
    }
  }

  return NextResponse.json({ success: true, sent, total: pendingUsers.length });
}
