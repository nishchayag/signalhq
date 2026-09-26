import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://signalhq.io";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/verifyEmail", // no trailing slash — "/verifyEmail/" never matched the page itself
          "/u/*", // User profile pages - might want to keep private
          "/r/", // reply receipts: the token in the URL is a credential
        ],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/verifyEmail", "/u/*", "/r/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
