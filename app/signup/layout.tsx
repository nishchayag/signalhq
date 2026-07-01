import { generateMetadata as createMetadata } from "@/lib/metadata";
import { Metadata } from "next";

export const metadata: Metadata = createMetadata({
  title: "Sign Up",
  description:
    "Create your free SignalHQ account and start collecting anonymous feedback today. Get started in seconds.",
  url: "/signup",
  keywords: [
    "sign up",
    "create account",
    "free feedback platform",
    "anonymous feedback registration",
    "feedback tool signup",
  ],
});

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
