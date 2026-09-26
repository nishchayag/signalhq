// emailTemplates/resetPasswordTemplate.tsx
import React from "react";
import { Text } from "@react-email/components";
import { EmailShell, OtpChip, colors, styles } from "./_shared";

interface ResetPasswordOtpEmailProps {
  otp: string;
  name?: string;
}

export default function ResetPasswordOtpEmail({
  otp,
  name = "there",
}: ResetPasswordOtpEmailProps) {
  return (
    <EmailShell previewText="Your SignalHQ password reset code">
      <Text style={styles.heading}>Hi {name.split(" ")[0]},</Text>

      <Text style={styles.text}>
        We received a request to reset your <strong>SignalHQ</strong>{" "}
        password.
        <br />
        Please use the code below to proceed:
      </Text>

      <OtpChip otp={otp} color={colors.brandPink} />

      <Text style={styles.text}>
        This code will expire in 5 minutes. If you didn&apos;t request this, you
        can safely ignore this email.
      </Text>

      <Text style={styles.footer}>— The SignalHQ Team 🚀</Text>
    </EmailShell>
  );
}
