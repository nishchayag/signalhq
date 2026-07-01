import { generateMetadata as createMetadata } from "@/lib/metadata";
import { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;

  return createMetadata({
    title: `Send Anonymous Message to ${username}`,
    description: `Send an anonymous feedback message to ${username} using SignalHQ. Your message will be completely anonymous and private.`,
    url: `/u/${username}`,
    keywords: [
      "anonymous message",
      "send feedback",
      "anonymous communication",
      `message ${username}`,
      "private feedback",
    ],
    noindex: true, // These pages might be considered private
  });
}

export default function UserProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
