// components/emails/ResetPasswordOtpEmail.tsx
import React from "react";
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Text,
  Section,
} from "@react-email/components";

interface ResetPasswordOtpEmailProps {
  otp: string;
  name?: string;
}

export default function ResetPasswordOtpEmail({
  otp,
  name = "there",
}: ResetPasswordOtpEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your SignalHQ password reset code</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>Hi {name.split(" ")[0]},</Text>

          <Text style={text}>
            We received a request to reset your <strong>SignalHQ</strong>{" "}
            password.
            <br />
            Please use the code below to proceed:
          </Text>

          <Section style={codeContainer}>
            <Text style={code}>{otp}</Text>
          </Section>

          <Text style={text}>
            This code will expire in 5 minutes. If you didn&apos;t request this, you
            can safely ignore this email.
          </Text>

          <Text style={footer}>— The SignalHQ Team 🚀</Text>
        </Container>
      </Body>
    </Html>
  );
}

// --- Styles (same as verification email) ---
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

const codeContainer = {
  textAlign: "center" as const,
  margin: "30px 0",
};

const code = {
  display: "inline-block",
  backgroundColor: "#f1f1f1",
  padding: "12px 20px",
  borderRadius: "6px",
  fontSize: "24px",
  fontWeight: "bold" as const,
  letterSpacing: "4px",
  color: "#000",
};

const footer = {
  fontSize: "14px",
  color: "#888",
  marginTop: "40px",
  textAlign: "center" as const,
};
