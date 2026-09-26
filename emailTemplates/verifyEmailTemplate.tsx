// emailTemplates/verifyEmailTemplate.tsx
import React from "react";
import { Text } from "@react-email/components";
import { EmailShell, OtpChip, colors, styles } from "./_shared";

interface VerificationEmailProps {
  otp: string;
  name?: string;
}

export default function VerificationEmail({
  otp,
  name = "there",
}: VerificationEmailProps) {
  return (
    <EmailShell previewText="Your SignalHQ verification code">
      <Text style={styles.heading}>Hi {name.split(" ")[0]},</Text>

      <Text style={styles.text}>
        Welcome to <strong>SignalHQ</strong> 👋
        <br />
        Please use the following code to verify your email address:
      </Text>

      <OtpChip otp={otp} color={colors.brandYellow} />

      <Text style={styles.text}>
        This code will expire in 5 minutes. If you didn&apos;t request this, you
        can safely ignore this email.
      </Text>

      <Text style={styles.footer}>— The SignalHQ Team 🚀</Text>
    </EmailShell>
  );
}
