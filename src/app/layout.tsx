import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShipTrack — Open shipment tracking",
  description: "Free, open-source shipment tracking for Indian and international couriers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
