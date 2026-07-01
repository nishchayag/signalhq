import { Metadata } from "next";
import { seoConfig, PageSEO } from "./seo";

export function generateMetadata(pageSEO: PageSEO = {}): Metadata {
  const {
    title = seoConfig.defaultTitle,
    description = seoConfig.defaultDescription,
    keywords = seoConfig.defaultKeywords,
    image = seoConfig.defaultImage,
    url,
    type = "website",
    publishedTime,
    modifiedTime,
    noindex = false,
    nofollow = false,
  } = pageSEO;

  const fullTitle =
    title === seoConfig.defaultTitle
      ? title
      : `${title} | ${seoConfig.siteName}`;
  const fullUrl = url ? `${seoConfig.siteUrl}${url}` : seoConfig.siteUrl;
  const fullImage = image.startsWith("http")
    ? image
    : `${seoConfig.siteUrl}${image}`;

  const metadata: Metadata = {
    title: fullTitle,
    description,
    keywords: keywords.join(", "),
    authors: [{ name: seoConfig.author }],
    creator: seoConfig.author,
    publisher: seoConfig.siteName,

    // Basic meta tags
    robots: {
      index: !noindex,
      follow: !nofollow,
      googleBot: {
        index: !noindex,
        follow: !nofollow,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },

    // OpenGraph
    openGraph: {
      type,
      locale: seoConfig.locale,
      url: fullUrl,
      title: fullTitle,
      description,
      siteName: seoConfig.siteName,
      images: [
        {
          url: fullImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      ...(publishedTime && { publishedTime }),
      ...(modifiedTime && { modifiedTime }),
    },

    // Twitter
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      site: seoConfig.twitterHandle,
      creator: seoConfig.twitterHandle,
      images: [fullImage],
    },

    // Additional
    alternates: {
      canonical: fullUrl,
    },

    // App-specific
    applicationName: seoConfig.siteName,
    appleWebApp: {
      capable: true,
      title: seoConfig.siteName,
      statusBarStyle: "default",
    },

    // Icons
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
        { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      ],
      apple: [
        { url: "/apple-icon-180.png", sizes: "180x180", type: "image/png" },
      ],
    },

    // Verification (add your actual verification codes)
    verification: {
      google: process.env.GOOGLE_SITE_VERIFICATION,
      yandex: process.env.YANDEX_VERIFICATION,
      yahoo: process.env.YAHOO_VERIFICATION,
      other: {
        "msvalidate.01": process.env.BING_VERIFICATION || "",
      },
    },
  };

  return metadata;
}

export function generateJsonLd(data: {
  type:
    | "WebSite"
    | "WebPage"
    | "Article"
    | "Organization"
    | "SoftwareApplication";
  name?: string;
  description?: string;
  url?: string;
  image?: string;
  author?: string;
  datePublished?: string;
  dateModified?: string;
  [key: string]: unknown;
}) {
  const baseData = {
    "@context": "https://schema.org",
    "@type": data.type,
    name: data.name || seoConfig.siteName,
    description: data.description || seoConfig.defaultDescription,
    url: data.url || seoConfig.siteUrl,
    image: data.image || `${seoConfig.siteUrl}${seoConfig.defaultImage}`,
  };

  switch (data.type) {
    case "WebSite":
      return {
        ...baseData,
        publisher: {
          "@type": "Organization",
          name: seoConfig.siteName,
          url: seoConfig.siteUrl,
        },
        potentialAction: {
          "@type": "SearchAction",
          target: `${seoConfig.siteUrl}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      };

    case "SoftwareApplication":
      return {
        ...baseData,
        "@type": "SoftwareApplication",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web Browser",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "4.8",
          ratingCount: "150",
        },
      };

    case "Organization":
      return {
        ...baseData,
        "@type": "Organization",
        logo: `${seoConfig.siteUrl}/logo.png`,
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "Customer Service",
          url: `${seoConfig.siteUrl}/contact`,
        },
        sameAs: [
          // Add your social media URLs here
          "https://twitter.com/signalhq",
          "https://linkedin.com/company/signalhq",
        ],
      };

    default:
      return baseData;
  }
}
