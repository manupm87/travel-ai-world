"use client";

/** The 404 page, exported as `404.html`. */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { Aurora } from "@/components/layout/Aurora";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/context/LanguageContext";

/** How long a path under a signed-in route waits before it goes home. */
const REDIRECT_MS = 2000;

/** A stray path under one of these signed-in routes is a moved link, sent home. */
const STRAY = ["/dashboard/", "/trip/", "/plan/", "/admin/"];

/**
 * The page for an unknown URL. It lives outside the route groups, so it brings
 * its own shell; an unknown trip id is the planner's to handle, not this page's.
 */
export default function NotFound() {
  const { t } = useLanguage();
  const nt = t.notFound;
  const pathname = usePathname();
  const router = useRouter();

  const isRedirecting = STRAY.some((prefix) => pathname.startsWith(prefix));

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
      <Header />

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
