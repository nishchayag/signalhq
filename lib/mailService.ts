import userModel from "@/models/user.model";
import connectDB from "./connectDB";
import { Resend } from "resend";
import VerificationEmail from "@/emailTemplates/verifyEmailTemplate";
import ResetPasswordOtpEmail from "@/emailTemplates/resetPasswordTemplate";
import InvitationEmail from "@/emailTemplates/invitationTemplate";
import NewMessageEmail, { type DigestAiSummary } from "@/emailTemplates/newMessageEmail";
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.RESEND_FROM_EMAIL as string;

/**
 * Send a verification ("VERIFY") or password-reset OTP email. Returns true
 * only when Resend confirms the send, so callers can tell the user when a
 * code didn't go out (e.g. signup suggests "resend code").
 */
export const sendEmail = async ({
  email,
  mailType,
  otpCode,
}: {
  email: string;
  mailType: string;
  otpCode: string;
}): Promise<boolean> => {
  try {
    await connectDB();
    if (!email || !mailType) {
      console.error("Email or mailType is missing");
      return false;
    }
    const userInDB = await userModel.findOne({ email });
    if (!userInDB) {
      console.error("User not found in the database");
      return false;
    }

    const { error } = await resend.emails.send({
      from: FROM,
      to: email,
      subject:
        mailType === "VERIFY"
          ? "Email Verification code for SignalHQ"
          : "Reset Password code for SignalHQ",
      react:
        mailType === "VERIFY"
          ? VerificationEmail({ otp: otpCode, name: userInDB.name })
          : ResetPasswordOtpEmail({ otp: otpCode, name: userInDB.name }),
    });
    if (error) {
      console.error("Error sending email:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};

/**
 * Send an organization invitation email. Unlike `sendEmail`, the recipient may
 * not have an account yet, so there is no user lookup. Returns true on success.
 */
export const sendInvitationEmail = async ({
  email,
  orgName,
  inviterName,
  role,
  acceptUrl,
}: {
  email: string;
  orgName: string;
  inviterName?: string;
  role: string;
  acceptUrl: string;
}): Promise<boolean> => {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: email,
      subject: `You've been invited to join ${orgName} on SignalHQ`,
      react: InvitationEmail({ orgName, inviterName, role, acceptUrl }),
    });
    if (error) {
      console.error("Error sending invitation email:", error);
      return false;
    }
    console.log("Invitation email sent:", data);
    return true;
  } catch (error) {
    console.error("Error sending invitation email:", error);
    return false;
  }
};

/**
 * Notify a user of new message activity — used both for the "immediate"
 * notification preference (count is always 1) and the daily digest cron
 * (count is however many messages piled up). No user lookup here, unlike
 * `sendEmail`; callers already have the recipient's email/name in hand.
 */
export const sendNotificationEmail = async ({
  email,
  name,
  count,
  dashboardUrl,
  aiSummaries,
}: {
  email: string;
  name: string;
  count: number;
  dashboardUrl: string;
  // Daily digest only: per-org AI bullet summaries (lib/notifications.ts).
  aiSummaries?: DigestAiSummary[];
}): Promise<boolean> => {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: email,
      subject:
        count === 1
          ? "You have a new message on SignalHQ"
          : `You have ${count} new messages on SignalHQ`,
      react: NewMessageEmail({ name, count, dashboardUrl, aiSummaries }),
    });
    if (error) {
      console.error("Error sending notification email:", error);
      return false;
    }
    console.log("Notification email sent:", data);
    return true;
  } catch (error) {
    console.error("Error sending notification email:", error);
    return false;
  }
};
