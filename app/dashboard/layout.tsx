import { generateMetadata as createMetadata } from "@/lib/metadata";
import { Metadata } from "next";
import ConfirmProvider from "@/components/ConfirmProvider";

export const metadata: Metadata = createMetadata({
  title: "Dashboard",
  description:
    "Manage your anonymous feedback, view messages, and control your feedback settings.",
  url: "/dashboard",
  noindex: true, // Dashboard is private and shouldn't be indexed
});

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // One app-wide confirm dialog for every dashboard page (useConfirm), rendered
  // at layout level so it never lives inside the mobile sidebar Sheet.
  return <ConfirmProvider>{children}</ConfirmProvider>;
}
