// emailTemplates/_shared.tsx
//
// Shared visual language for SignalHQ's transactional emails, matching the
// app's neobrutalist design system (app/globals.css, "Design system" —
// see repo CLAUDE.md): warm cream background, thick near-black borders,
// hard offset "sticker" shadows (no blur), and saturated brand accents.
//
// Email clients can't read CSS custom properties or oklch(), so every color
// below is the hex equivalent of the light-theme token of the same name in
// app/globals.css, via the standard OKLCH -> sRGB conversion:
//   --background   oklch(0.975 0.014 84)  -> #fbf6ec
//   --ink/--foreground oklch(0.19 0.024 45) -> #1d100b
//   --card         oklch(0.995 0.004 84)  -> #fffdfa
//   --brand-yellow oklch(0.87 0.16 97)    -> #f2d441
//   --brand-pink   oklch(0.75 0.19 15)    -> #ff7287
//   --brand-mint   oklch(0.82 0.15 165)   -> #4ae2ac
//   --brand-blue   oklch(0.72 0.13 235)   -> #3fb1ea
//   --muted-foreground oklch(0.44 0.028 55) -> #5f4f44
// (#fffdfa above matches the card-surface hex already recorded next to the
// analytics chart palette in globals.css, cross-checking the conversion.)
// Ink-on-brand text contrast (WCAG 2.1): yellow 12.6:1, pink 7.1:1,
// mint 11.3:1, blue 7.7:1 — all clear the 4.5:1 minimum with room to spare.
//
// No <style> tags, classes, CSS variables or web fonts here — everything is
// an inline style object using a system font stack, per email-client
// constraints. Only tables/react-email components render markup.
import * as React from "react";
import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components";

export const colors = {
  background: "#fbf6ec",
  card: "#fffdfa",
  ink: "#1d100b",
  mutedForeground: "#5f4f44",
  brandYellow: "#f2d441",
  brandPink: "#ff7287",
  brandMint: "#4ae2ac",
  brandBlue: "#3fb1ea",
} as const;

const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const monoStack =
  '"SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export const styles = {
  main: {
    backgroundColor: colors.background,
    fontFamily: fontStack,
    padding: "32px 0",
    margin: 0,
  },
  outerContainer: {
    maxWidth: "600px",
    width: "100%",
    margin: "0 auto",
    padding: "0 16px",
  },
  headerSection: {
    textAlign: "center" as const,
    margin: "0 0 20px",
  },
  wordmarkChip: {
    display: "inline-block",
    backgroundColor: colors.brandYellow,
    color: colors.ink,
    border: `2px solid ${colors.ink}`,
    borderRadius: "8px",
    boxShadow: `3px 3px 0 0 ${colors.ink}`,
    padding: "8px 18px",
    fontSize: "15px",
    fontWeight: 800 as const,
    letterSpacing: "0.3px",
  },
  card: {
    backgroundColor: colors.card,
    border: `2px solid ${colors.ink}`,
    borderRadius: "14px",
    boxShadow: `6px 6px 0 0 ${colors.ink}`,
    padding: "36px 28px",
  },
  heading: {
    fontSize: "22px",
    lineHeight: "28px",
    fontWeight: 800 as const,
    color: colors.ink,
    margin: "0 0 14px",
    wordBreak: "break-word" as const,
  },
  text: {
    fontSize: "16px",
    lineHeight: "24px",
    color: colors.ink,
    margin: "0 0 16px",
    wordBreak: "break-word" as const,
  },
  footer: {
    fontSize: "13px",
    lineHeight: "20px",
    color: colors.mutedForeground,
    margin: "24px 0 0",
  },
  footerLink: {
    color: colors.mutedForeground,
    textDecoration: "underline",
  },
  buttonContainer: {
    textAlign: "center" as const,
    margin: "28px 0",
  },
  button: {
    backgroundColor: colors.brandYellow,
    color: colors.ink,
    border: `2px solid ${colors.ink}`,
    boxShadow: `4px 4px 0 0 ${colors.ink}`,
    borderRadius: "8px",
    padding: "14px 30px",
    fontSize: "16px",
    fontWeight: 700 as const,
    textDecoration: "none",
    display: "inline-block" as const,
  },
  linkUrl: {
    fontSize: "13px",
    color: colors.mutedForeground,
    wordBreak: "break-all" as const,
  },
} as const;

/** Bordered, hard-shadowed chip for an OTP code. Pass a brand color to tell
 * verify (yellow) and reset (pink) apart at a glance. */
export function otpChipStyle(bg: string) {
  return {
    display: "inline-block",
    backgroundColor: bg,
    color: colors.ink,
    border: `2px solid ${colors.ink}`,
    borderRadius: "10px",
    boxShadow: `4px 4px 0 0 ${colors.ink}`,
    padding: "16px 28px",
  } as const;
}

// Deliberately plain text (no per-digit elements) so the code stays a single
// selectable/copyable run.
export const otpText = {
  fontFamily: monoStack,
  fontSize: "30px",
  fontWeight: 700 as const,
  letterSpacing: "8px",
  color: colors.ink,
  margin: 0,
} as const;

export function OtpChip({ otp, color }: { otp: string; color: string }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} align="center" style={{ margin: "24px auto" }}>
      <tbody>
        <tr>
          <td style={otpChipStyle(color)}>
            <Text style={otpText}>{otp}</Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// --- Digest AI-summary blocks (mint/blue header strip, alternating per org) ---

export function summaryStripColor(index: number) {
  return index % 2 === 0 ? colors.brandMint : colors.brandBlue;
}

export const summaryBlockWrap = {
  border: `2px solid ${colors.ink}`,
  borderRadius: "10px",
  marginBottom: "14px",
} as const;

export function summaryStripStyle(bg: string) {
  return {
    backgroundColor: bg,
    color: colors.ink,
    fontSize: "13px",
    fontWeight: 800 as const,
    padding: "8px 14px",
    margin: 0,
    borderBottom: `2px solid ${colors.ink}`,
    wordBreak: "break-word" as const,
  } as const;
}

export const summaryBodyStyle = {
  padding: "12px 16px 2px",
  margin: 0,
} as const;

export const summaryList = {
  margin: 0,
  paddingLeft: "20px",
} as const;

export const summaryItem = {
  fontSize: "14px",
  lineHeight: "22px",
  color: colors.ink,
  margin: "0 0 8px",
} as const;

export const summaryNote = {
  fontSize: "12px",
  color: colors.mutedForeground,
  margin: "4px 0 0",
} as const;

/** Html/Head/Preview/Body/Container wrapper shared by every SignalHQ email:
 * color-scheme meta tags, a "SignalHQ" wordmark chip header, and the bordered
 * hard-shadow card that every template renders its content inside. */
export function EmailShell({
  previewText,
  children,
}: {
  previewText: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={styles.main}>
        <Container style={styles.outerContainer}>
          <Section style={styles.headerSection}>
            <table role="presentation" cellPadding={0} cellSpacing={0} align="center" style={{ margin: "0 auto" }}>
              <tbody>
                <tr>
                  <td style={styles.wordmarkChip}>SignalHQ</td>
                </tr>
              </tbody>
            </table>
          </Section>
          <Section style={styles.card}>{children}</Section>
        </Container>
      </Body>
    </Html>
  );
}
