import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/context/LanguageContext";

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


/**
 * Root Layout for the Next.js App Router.
 * 
 * This layout wraps every page in the application. It establishes the foundational
 * HTML document structure (`<html>`, `<body>`) and injects the global font (Inter).
 * 
 * It also wraps the application in the `LanguageProvider` Context, ensuring
 * internationalization state is available to all descendant components.
 * 
 * @param children - The active page or nested layout to render.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
