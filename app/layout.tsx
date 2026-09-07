import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Roamly — A trip that feels like you",
  description:
    "Create a personal day-by-day travel itinerary around your interests, budget, and pace.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
