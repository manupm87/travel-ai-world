// ─── Shared i18n types ────────────────────────────────────────────────────────
// Add new locales here: "en" | "es" | "fr" ... and describe them in LANGUAGES
// (src/i18n/index.ts). The compiler flags whichever of the two you forget.
import type { TripStatus } from "@/types/trip-summary";

export type Language = "en" | "es";

/** Stable ids for the "How it works" steps; components key images on them. */
export type StepId = "tell" | "build" | "live";

export interface Step {
  id: StepId;
  number: string;
  title: string;
  description: string;
  imageAlt: string;
}

/** Stable ids for the feature grid; components key icons on them. */
export type FeatureId =
  | "personalized"
  | "itineraries"
  | "budget"
  | "maps"
  | "food"
  | "customizable";

export interface FeatureItem {
  id: FeatureId;
  emoji: string;
  title: string;
  description: string;
}

export interface Stat {
  value: string;
  label: string;
}

export interface Testimonial {
  stars: number;
  quote: string;
  author: string;
  location: string;
  highlight: boolean;
}

export interface FooterLinkGroup {
  title: string;
  items: string[];
}

// The shape every locale file MUST satisfy.
// TypeScript will error on import if any key is missing.
export interface Translations {
  nav: {
    howItWorks: string;
    features: string;
    reviews: string;
    planMyTrip: string;
    dashboard: string;
    openMenu: string;
    closeMenu: string;
    selectLanguage: string;
    userMenu: string;
    menu: string;
  };
  common: {
    loading: string;
    close: string;
  };
  /** Label for each trip status, keyed by the backend's `TripStatus`. */
  status: Record<TripStatus, string>;
  errors: {
    title: string;
    description: string;
    retry: string;
  };
  tripViewer: {
    travelers: string;
    totalBudget: string;
    viewBookings: string;
    exportPdf: string;
    viewItinerary: string;
    journeyMap: string;
    routeOverview: string;
    tripOverview: string;
    accommodations: string;
    transportation: string;
    aiInsights: string;
    weatherForecast: string;
    weatherUnavailable: string;
    localTips: string;
    noLocalTips: string;
    yourItinerary: string;
    journeyTitle: string; // "Your {duration}-Day Journey"
    allDays: string;
    freeDay: string;
    travel: string;
    dining: string;
    bookingRequired: string;
    estimated: string;
    selfPlanned: string;
    nights: string;
    budgetBreakdown: {
      accommodation: string;
      food: string;
      activities: string;
      transport: string;
    };
  };
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
    trust: string[];
    imageAlt: string;
  };
  planner: {
    label: string;
    title: string;
    placeholder: string;
    send: string;
    sendHint: string;
    examplesLabel: string;
    examples: { emoji: string; label: string; prompt: string }[];
    /** Shown when no ai_api URL is configured (static preview builds). */
    unavailable: string;
    errorFallback: string;
    errorUnauthorized: string;
  };
  howItWorks: {
    label: string;
    title: string;
    steps: Step[];
  };
  features: {
    label: string;
    title: string;
    items: FeatureItem[];
  };
  socialProof: {
    label: string;
    stats: Stat[];
    testimonials: Testimonial[];
  };
  finalCta: {
    title: string;
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  footer: {
    tagline: string;
    links: FooterLinkGroup[];
    social: string[];
    copyright: string;
  };
  dashboard: {
    heroTitle: string;
    sections: Record<TripStatus, string>;
    emptyTitle: string;
    emptyDescription: string;
  };
  auth: {
    login: string;
    logout: string;
    welcomeBack: string;
    subtitle: string;
    terms: string;
    loginError: string;
  };
  notFound: {
    subtitle: string;
    description: string;
    cta: string;
    redirecting: string;
    imageAlt: string;
  };
  theme: {
    toggle: string;
    light: string;
    dark: string;
  };
}
