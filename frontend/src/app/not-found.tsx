"use client";

import Link from "next/link";
import Image from "next/image";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import paradiseImage from "../../public/images/404-paradise.png";
import { useLanguage } from "@/context/LanguageContext";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Global 404 Fallback (`not-found.tsx`).
 * 
 * Styled with a "Lost in Paradise" theme, reflecting the travel nature of the app.
 * Includes the official Header and Footer for easy navigation.
 */
export default function NotFound() {
  const { t, language } = useLanguage();
  const nt = t.notFound;
  const pathname = usePathname();
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Smart check for dynamic routes on static export (GH Pages fallback)
  useEffect(() => {
    const isDynamicRoute = pathname.includes('/trip/') || pathname.includes('/dashboard/');
    
    if (isDynamicRoute) {
      setIsRedirecting(true);
      // Wait a moment for the SPA to potentially mount and handle the route
      // If it doesn't, we redirect to home as a safer fallback than 404
      const timer = setTimeout(() => {
        router.push('/');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [pathname, router]);

  if (isRedirecting) {
    return (
      <div className="flex flex-col min-h-screen bg-bg-primary text-white font-sans items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="text-4xl">✈️</div>
          <p className="text-text-secondary">
            {language === 'en' ? 'Preparing your adventure...' : 'Preparando tu aventura...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-bg-primary text-white font-sans">
      <Header variant="landing" />
      
      <main className="flex-1 flex flex-col items-center justify-center pt-24 pb-12 px-6 text-center animate-in fade-in duration-700">
        <div className="max-w-4xl w-full flex flex-col items-center gap-8 md:gap-12">
          
          {/* Visual section */}
          <div className="relative group">
            {/* Background glow */}
            <div className="absolute -inset-4 bg-accent/20 blur-3xl rounded-full opacity-50 group-hover:opacity-70 transition-opacity duration-1000" />
            
            <div className="relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl transition-transform duration-500 hover:scale-[1.02]">
              <div className="absolute inset-0 bg-gradient-to-t from-bg-primary/80 via-transparent to-transparent z-10" />
              <Image 
                src={paradiseImage} 
                alt="Lost Paradise Island"
                className="w-full max-w-[600px] h-auto object-cover aspect-[16/10]"
                priority
              />
            </div>
          </div>

          {/* Text section */}
          <div className="flex flex-col items-center gap-4 md:gap-6 max-w-xl">
            <h1 className="text-4xl md:text-6xl font-heading font-bold tracking-tight bg-gradient-to-r from-white via-white to-white/40 bg-clip-text text-transparent">
              {nt.subtitle}
            </h1>
            
            <p className="text-text-secondary text-base md:text-lg leading-relaxed">
              {nt.description}
            </p>

            <div className="mt-4">
              <Link
                href="/dashboard"
                className="group relative inline-flex items-center justify-center px-8 py-4 font-semibold text-white transition-all duration-300 bg-accent rounded-2xl hover:bg-accent-hover hover:shadow-[0_0_30px_rgba(79,110,247,0.4)] overflow-hidden"
              >
                <div className="absolute inset-0 w-3 bg-white/20 transition-all duration-[600ms] -skew-x-[45deg] -translate-x-20 group-hover:translate-x-[200px]" />
                <span className="relative flex items-center gap-2">
                  ✈ {nt.cta}
                </span>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
