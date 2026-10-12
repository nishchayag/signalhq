export interface SEOConfig {
  siteName: string;
  siteUrl: string;
  defaultTitle: string;
  defaultDescription: string;
  defaultKeywords: string[];
  defaultImage: string;
  twitterHandle: string;
  author: string;
  locale: string;
}

export const seoConfig: SEOConfig = {
  siteName: "SignalHQ",
  siteUrl: process.env.NEXT_PUBLIC_BASE_URL || "https://signalhq.io",
  defaultTitle: "SignalHQ - Anonymous Feedback for Teams",
  // Kept short: link previews cut descriptions off around 150 characters.
  defaultDescription:
    "Collect honest, anonymous feedback through one shareable link. No accounts for responders, and nothing ties a message back to them.",
  defaultKeywords: [
    "anonymous feedback",
    "team feedback",
    "feedback platform",
    "anonymous messages",
    "feedback collection",
    "honest feedback",
    "organization feedback",
    "workplace feedback",
    "private feedback",
    "feedback tool",
  ],
  // Served by app/opengraph-image.tsx; /o pages have their own cards.
  defaultImage: "/opengraph-image",
  twitterHandle: "@signalhq",
  author: "SignalHQ Team",
  locale: "en_US",
};

export interface PageSEO {
  title?: string;
  description?: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  noindex?: boolean;
  nofollow?: boolean;
}
