// emailTemplates/invitationTemplate.tsx
import React from "react";
import { Button, Section, Text } from "@react-email/components";
import { EmailShell, styles } from "./_shared";

interface InvitationEmailProps {
  orgName: string;
  inviterName?: string;
  role: string;
  acceptUrl: string;
}

export default function InvitationEmail({
  orgName,
  inviterName = "Someone",
  role,
  acceptUrl,
}: InvitationEmailProps) {
  return (
    <EmailShell previewText={`You've been invited to join ${orgName} on SignalHQ`}>
      <Text style={styles.heading}>You&apos;re invited 🎉</Text>

      <Text style={styles.text}>
        <strong>{inviterName}</strong> has invited you to join{" "}
        <strong>{orgName}</strong> on <strong>SignalHQ</strong> as a{" "}
        <strong>{role.toLowerCase()}</strong>.
      </Text>

      <Section style={styles.buttonContainer}>
        <Button style={styles.button} href={acceptUrl}>
          Accept invitation
        </Button>
      </Section>

      <Text style={styles.text}>
        If the button doesn&apos;t work, paste this link into your browser:
        <br />
        <span style={styles.linkUrl}>{acceptUrl}</span>
      </Text>

      <Text style={styles.footer}>
        This invitation will expire in 7 days. If you weren&apos;t expecting
        it, you can safely ignore this email.
        <br />— The SignalHQ Team 🚀
      </Text>
    </EmailShell>
  );
}
