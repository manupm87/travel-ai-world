/** The root layout: fonts, metadata and the providers every page shares. */

import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Outfit, Pixelify_Sans, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { GoogleOAuthProvider } from "@react-oauth/google";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-heading",
  weight: ["300", "400", "500", "600"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["300", "400", "500", "600"],
});

/** Only for what Kiri says: her name tag and her one-liners. */
const pixelifySans = Pixelify_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pixel",
  weight: ["400", "500"],
});

/** Ids, hashes and JSON in the admin console: the only monospace in the app. */
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Kyrian World",
  description:
    "Say where you want to go, in one sentence. Kyrian World plans the days with you — where to stay, what to see, and when.",
  keywords: ["travel", "trip planning", "itinerary", "AI travel planner"],
  openGraph: {
    title: "Kyrian World",
    description:
      "Say where you want to go, in one sentence. Kyrian World plans the days with you.",
    type: "website",
  },
};

/**
 * The visual viewport, not an assumed 980 px page, and no zoom on focus.
 * `viewportFit: "cover"` reaches under the home indicator; bottom panes pad with
 * `env(safe-area-inset-bottom)`.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Root layout: the document, the fonts and the app-wide providers. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${plusJakartaSans.variable} ${pixelifySans.variable} ${jetBrainsMono.variable}`}>
      <body className="font-sans">
        <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "PLACEHOLDER_CLIENT_ID"}>
          <AuthProvider>
            <ThemeProvider>
              <LanguageProvider>
                {children}
              </LanguageProvider>
            </ThemeProvider>
          </AuthProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}

