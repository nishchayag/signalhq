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
  defaultDescription:
    "SignalHQ turns honest, anonymous feedback into signal for your team. Collect candid messages from teammates, your audience, or community through shareable links — organized by organization and team.",
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
  defaultImage: "/og-image.png",
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
