import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Outfit, Plus_Jakarta_Sans } from "next/font/google";
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

/** Ids, hashes and JSON in the admin console (TRA-222): the only monospace in the app. */
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
 *
 * `viewportFit: "cover"` lets the layout reach under the rounded corners and
 * the home indicator; the panes that touch the bottom edge pay for it with
 * `env(safe-area-inset-bottom)` padding.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Root Layout for the Next.js App Router.
 * 
 * This layout wraps every page in the application. It establishes the foundational
 * HTML document structure (`<html>`, `<body>`) and injects the global fonts.
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
    <html lang="en" className={`${outfit.variable} ${plusJakartaSans.variable} ${jetBrainsMono.variable}`}>
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

