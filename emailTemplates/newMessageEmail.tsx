// emailTemplates/newMessageEmail.tsx
import React from "react";
import { Button, Link, Section, Text } from "@react-email/components";
import {
  EmailShell,
  styles,
  summaryBlockWrap,
  summaryBodyStyle,
  summaryItem,
  summaryList,
  summaryNote,
  summaryStripColor,
  summaryStripStyle,
} from "./_shared";

/** One org's AI digest summary. Plain strings — rendered as React text, never as HTML. */
export interface DigestAiSummary {
  orgName: string;
  bullets: string[];
}

interface NewMessageEmailProps {
  name: string;
  count: number;
  dashboardUrl: string;
  // Absolute link to the account's notification settings section.
  settingsUrl: string;
  aiSummaries?: DigestAiSummary[];
}

export default function NewMessageEmail({
  name,
  count,
  dashboardUrl,
  settingsUrl,
  aiSummaries,
}: NewMessageEmailProps) {
  const summaries = (aiSummaries ?? []).filter((s) => s.bullets.length > 0);
  const isSingle = count === 1;
  return (
    <EmailShell
      previewText={
        isSingle
          ? "You have a new message on SignalHQ"
          : `You have ${count} new messages on SignalHQ`
      }
    >
      <Text style={styles.heading}>
        {isSingle ? "You've got a new message 📬" : `${count} new messages 📬`}
      </Text>

      <Text style={styles.text}>
        Hey {name}, {isSingle ? "someone" : "people"} sent you{" "}
        {isSingle ? "a new message" : `${count} new messages`} on{" "}
        <strong>SignalHQ</strong>.
      </Text>

      {summaries.length > 0 && (
        <Section style={{ margin: "8px 0 0" }}>
          {summaries.map((summary, i) => (
            <Section key={i} style={summaryBlockWrap}>
              <Text style={summaryStripStyle(summaryStripColor(i))}>
                AI summary · {summary.orgName}
              </Text>
              <div style={summaryBodyStyle}>
                <ul style={summaryList}>
                  {summary.bullets.map((bullet, j) => (
                    <li key={j} style={summaryItem}>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            </Section>
          ))}
          <Text style={summaryNote}>
            Generated automatically — open the dashboard for the full messages.
          </Text>
        </Section>
      )}

      <Section style={styles.buttonContainer}>
        <Button style={styles.button} href={dashboardUrl}>
          View in dashboard
        </Button>
      </Section>

      <Text style={styles.footer}>
        You&apos;re receiving this based on your notification settings —
        change them anytime from{" "}
        <Link href={settingsUrl} style={styles.footerLink}>
          your account settings
        </Link>
        .
        <br />— The SignalHQ Team 🚀
      </Text>
    </EmailShell>
  );
}
