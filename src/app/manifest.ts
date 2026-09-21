import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest by Next. Lets phones "Add to Home Screen"
// as a standalone app — most parcel tracking happens on mobile.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ShipTrack",
    short_name: "ShipTrack",
    description: "Free, open-source courier tracking for India with email alerts.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#6366f1",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.svg", sizes: "180x180", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
