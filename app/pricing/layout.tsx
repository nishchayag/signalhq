import { generateMetadata as createMetadata } from "@/lib/metadata";
import { Metadata } from "next";

export const metadata: Metadata = createMetadata({
  title: "Pricing",
  description:
    "SignalHQ plans and pricing. Free during early access — no credit card required.",
  url: "/pricing",
  keywords: ["pricing", "plans", "free tier", "anonymous feedback pricing"],
});

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
