import type { MetadataRoute } from "next";

// Web app manifest → served at /manifest.webmanifest and auto-linked by Next, so Roamly can be
// installed to the home screen and run standalone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Roamly",
    short_name: "Roamly",
    description: "An AI travel planner that turns a rough idea into a day-by-day itinerary.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#236553",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
