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
          "/verifyEmail/",
          "/u/*", // User profile pages - might want to keep private
        ],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/verifyEmail/", "/u/*"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
