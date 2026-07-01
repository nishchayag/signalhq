import { generateMetadata as createMetadata } from "@/lib/metadata";
import { Metadata } from "next";

export const metadata: Metadata = createMetadata({
  title: "Login",
  description:
    "Sign in to your SignalHQ account to access your dashboard and manage anonymous feedback.",
  url: "/login",
  noindex: true, // Login pages are typically not indexed
});

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
