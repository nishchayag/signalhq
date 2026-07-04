import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SignalHQ - Anonymous Feedback for Teams",
    short_name: "SignalHQ",
    description:
      "Turn honest, anonymous feedback into signal for your team — collected through simple shareable links.",
    start_url: "/",
    display: "standalone",
    background_color: "#f9f7f1",
    theme_color: "#573de0",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
