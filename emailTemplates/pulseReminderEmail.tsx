// emailTemplates/pulseReminderEmail.tsx
//
// Round-open reminder for a recurring (pulse) question — one identical
// email for every recipient in a batch: the same public link, no
// per-recipient parameters (lib/pulseReminders.ts).
import React from "react";
import { Button, Link, Section, Text } from "@react-email/components";
import { EmailShell, styles } from "./_shared";

interface PulseReminderEmailProps {
  orgName: string;
  questionText: string;
  // Absolute /o/{orgSlug}/q/{slug} link — the same one board members open
  // to answer this round.
  publicUrl: string;
  // Absolute link to the account's notification settings section.
  settingsUrl: string;
}

export default function PulseReminderEmail({
  orgName,
  questionText,
  publicUrl,
  settingsUrl,
}: PulseReminderEmailProps) {
  return (
    <EmailShell previewText={`A new round just opened for ${orgName} on SignalHQ`}>
      <Text style={styles.heading}>A new round just opened 🔔</Text>

      <Text style={styles.text}>
        <strong>{orgName}</strong> wants to hear from you again on SignalHQ:
      </Text>

      <Text style={styles.text}>&ldquo;{questionText}&rdquo;</Text>

      <Section style={styles.buttonContainer}>
        <Button style={styles.button} href={publicUrl}>
          Share your feedback
        </Button>
      </Section>

      <Text style={styles.footer}>
        You&apos;re getting this because you&apos;re a member of {orgName} on
        SignalHQ — change your notification settings anytime from{" "}
        <Link href={settingsUrl} style={styles.footerLink}>
          your account settings
        </Link>
        .
        <br />— The SignalHQ Team 🚀
      </Text>
    </EmailShell>
  );
}
