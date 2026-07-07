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
} from "@react-email/components";

interface NewMessageEmailProps {
  name: string;
  count: number;
  dashboardUrl: string;
}

export default function NewMessageEmail({
  name,
  count,
  dashboardUrl,
}: NewMessageEmailProps) {
  const isSingle = count === 1;
  return (
    <Html>
      <Head />
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

          <Section style={buttonContainer}>
            <Button style={button} href={dashboardUrl}>
              View in dashboard
            </Button>
          </Section>

          <Text style={footer}>
            You&apos;re receiving this based on your notification settings —
            change them anytime from your account settings.
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
