// emailTemplates/newMessageEmail.tsx
import React from "react";
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Text,
  Section,
  Button,
  Link,
} from "@react-email/components";

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
    <Html>
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>
        {isSingle
          ? "You have a new message on SignalHQ"
          : `You have ${count} new messages on SignalHQ`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>
            {isSingle ? "You've got a new message 📬" : `${count} new messages 📬`}
          </Text>

          <Text style={text}>
            Hey {name}, {isSingle ? "someone" : "people"} sent you{" "}
            {isSingle ? "a new message" : `${count} new messages`} on{" "}
            <strong>SignalHQ</strong>.
          </Text>

          {summaries.length > 0 && (
            <Section style={summarySection}>
              {summaries.map((summary, i) => (
                <Section key={i} style={summaryBlock}>
                  <Text style={summaryHeading}>AI summary · {summary.orgName}</Text>
                  <ul style={summaryList}>
                    {summary.bullets.map((bullet, j) => (
                      <li key={j} style={summaryItem}>
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </Section>
              ))}
              <Text style={summaryNote}>
                Generated automatically — open the dashboard for the full messages.
              </Text>
            </Section>
          )}

          <Section style={buttonContainer}>
            <Button style={button} href={dashboardUrl}>
              View in dashboard
            </Button>
          </Section>

          <Text style={footer}>
            You&apos;re receiving this based on your notification settings —
            change them anytime from{" "}
            <Link href={settingsUrl} style={footerLink}>
              your account settings
            </Link>
            .
            <br />— The SignalHQ Team 🚀
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// --- Styles ---
const main = {
  backgroundColor: "#f9f9f9",
  fontFamily: "Helvetica, Arial, sans-serif",
  padding: "40px 0",
};

const container = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  padding: "40px",
  maxWidth: "480px",
  margin: "0 auto",
  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.08)",
};

const heading = {
  fontSize: "20px",
  fontWeight: "600",
  marginBottom: "10px",
};

const text = {
  fontSize: "16px",
  lineHeight: "24px",
  color: "#333",
};

const buttonContainer = {
  textAlign: "center" as const,
  margin: "30px 0",
};

const button = {
  backgroundColor: "#000",
  color: "#fff",
  padding: "12px 28px",
  borderRadius: "6px",
  fontSize: "16px",
  fontWeight: "bold" as const,
  textDecoration: "none",
  display: "inline-block",
};

const footer = {
  fontSize: "14px",
  color: "#888",
  marginTop: "40px",
  textAlign: "center" as const,
};

const footerLink = {
  color: "#888",
  textDecoration: "underline",
};

const summarySection = {
  margin: "24px 0 0",
};

const summaryBlock = {
  backgroundColor: "#f4f4f5",
  borderRadius: "6px",
  padding: "12px 16px",
  marginBottom: "12px",
};

const summaryHeading = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#111",
  margin: "0 0 6px",
};

const summaryList = {
  margin: "0",
  paddingLeft: "20px",
};

const summaryItem = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#333",
};

const summaryNote = {
  fontSize: "12px",
  color: "#888",
  margin: "4px 0 0",
};
