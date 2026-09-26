import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "@/components/PWARegister";
import { Analytics } from "@/components/Analytics";

export const metadata: Metadata = {
  title: "Roamly — A trip that feels like you",
  description:
    "Create a personal day-by-day travel itinerary around your interests, budget, and pace.",
  applicationName: "Roamly",
  appleWebApp: { capable: true, title: "Roamly", statusBarStyle: "default" },
  icons: { icon: "/favicon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#236553" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}<PWARegister /><Analytics id="G-T273L8E2F5" site="Roamly" accent="#25664f" /></body>
    </html>
  );
}
