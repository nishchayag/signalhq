// emailTemplates/invitationTemplate.tsx
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
} from "@react-email/components";

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
    <Html>
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>You&apos;ve been invited to join {orgName} on SignalHQ</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>You&apos;re invited 🎉</Text>

          <Text style={text}>
            <strong>{inviterName}</strong> has invited you to join{" "}
            <strong>{orgName}</strong> on <strong>SignalHQ</strong> as a{" "}
            <strong>{role.toLowerCase()}</strong>.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={acceptUrl}>
              Accept invitation
            </Button>
          </Section>

          <Text style={text}>
            If the button doesn&apos;t work, paste this link into your browser:
            <br />
            <span style={link}>{acceptUrl}</span>
          </Text>

          <Text style={footer}>
            This invitation will expire in 7 days. If you weren&apos;t expecting
            it, you can safely ignore this email.
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

const link = {
  fontSize: "13px",
  color: "#2563eb",
  wordBreak: "break-all" as const,
};

const footer = {
  fontSize: "14px",
  color: "#888",
  marginTop: "40px",
  textAlign: "center" as const,
};
