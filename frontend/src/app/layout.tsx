import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Travel AI World — AI-Powered Travel Planning",
  description:
    "Tell us where you want to go, your budget, and your travel style. Our AI crafts a personalized, day-by-day itinerary built just for you — in seconds.",
  keywords: ["travel", "AI", "trip planning", "itinerary", "vacation"],
  openGraph: {
    title: "Travel AI World — AI-Powered Travel Planning",
    description:
      "Your dream trip, designed by AI. Personalized itineraries in 30 seconds.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
