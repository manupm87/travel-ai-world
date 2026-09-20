"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { Aurora } from "@/components/layout/Aurora";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";

/** How long a stray `/dashboard/*` path waits before it goes home. */
const REDIRECT_MS = 2000;

/**
 * The page for a URL that is not one of ours.
 *
 * It lives outside the route groups, so it brings its own shell: the aurora,
 * the header and the footer's single line. The page itself is a sentence and
 * one way out — an unknown link is not an occasion for an illustration
 * (TRA-193). Unknown trip ids are handled by the viewer itself
 * (`/trip/?id=`), so only stray `/dashboard/*` paths still get the short
 * redirect home.
 */
export default function NotFound() {
  const { t } = useLanguage();
  const nt = t.notFound;
  const pathname = usePathname();
  const router = useRouter();

  const isRedirecting = pathname.includes("/dashboard/");

  useEffect(() => {
    if (!isRedirecting) return;
    const timer = setTimeout(() => router.push("/"), REDIRECT_MS);
    return () => clearTimeout(timer);
  }, [isRedirecting, router]);

  if (isRedirecting) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center font-sans">
        <Aurora />
        <LoadingSpinner label={nt.redirecting} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col font-sans">
      <Aurora />
      <Header variant="landing" />

      <main className="flex flex-1 items-center justify-center px-4 py-(--header-h) sm:px-6">
        <div className="w-full max-w-[34rem] animate-fade-up text-center">
          <h1 className="text-[clamp(1.875rem,6vw,2.75rem)] leading-[1.1] font-light text-text-primary">
            {nt.title}
          </h1>
          <p className="mx-auto mt-4 max-w-[46ch] text-[17px] leading-relaxed text-text-secondary">
            {nt.description}
          </p>
          <Button href="/" size="sm" className="mt-8 rounded-full px-6 py-3">
            {nt.cta}
          </Button>
        </div>
      </main>

      <Footer />
    </div>
  );
}
