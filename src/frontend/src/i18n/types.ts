// ─── Shared i18n types ────────────────────────────────────────────────────────
// Add new locales here: "en" | "es" | "fr" ... and describe them in LANGUAGES
// (src/i18n/index.ts). The compiler flags whichever of the two you forget.
import type { TripStatus } from "@/types/trip-summary";
import type { BriefField, DayPart, WarnCode } from "@/types/planner";

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
    /** Spinner copy while the trip loads from the API. */
    loading: string;
    /** No such trip for this account (a 404, a 403 or a malformed id). */
    notFoundTitle: string;
    notFoundDescription: string;
    backToDashboard: string;
    errorTitle: string;
    errorDescription: string;
    retry: string;
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

  /** The planner page (`/plan/`): chat + option cards + live itinerary (TRA-144). */
  plan: {
    title: string;
    subtitle: string;
    tabs: { chat: string; trip: string; map: string };
    /** Dashboard link into the page. */
    openPlanner: string;
    /** Landing/dashboard `PlannerCard`: continue the typed prompt on the page. */
    openWithPrompt: string;
    composerPlaceholder: string;
    /** "Chosen: {titles}" chip in the transcript. */
    chosen: string;
    /** Shortcut requests under the composer. */
    suggestions: string[];
    quickReplies: {
      title: string;
      confirm: string;
      destination: string;
      destinationPlaceholder: string;
      origin: string;
      originPlaceholder: string;
      dates: string;
      from: string;
      to: string;
      travellers: string;
      adults: string;
      children: string;
      increase: string;
      decrease: string;
      budget: string;
      interests: string;
      interestOptions: { id: string; label: string }[];
      /** The message sent with the answers, e.g. "Dates: {from} to {to}". */
      summary: {
        destination: string;
        origin: string;
        dates: string;
        travellers: string;
        budget: string;
        interests: string;
      };
    };
    /** `€`, `€€`, `€€€` labels and their long names; a price is never a number. */
    priceTiers: Record<"1" | "2" | "3", string>;
    priceTierNames: Record<"1" | "2" | "3", string>;
    parts: Record<DayPart, string>;
    card: {
      choose: string;
      chosen: string;
      /** "Add to day {day} · {part}" */
      addToSlot: string;
      /** "Add {count}" (multi-selection footer) */
      addCount: string;
      notInterested: string;
      shortlist: string;
      unshortlist: string;
      /** "Source: {source}" */
      source: string;
      /** "Photo: {credit}" */
      imageCredit: string;
      alreadyInDay: string;
    };
    carousel: {
      /** aria-label: "Options: {prompt}" */
      label: string;
      /** aria-roledescription, read aloud by screen readers. */
      roleDescription: string;
      previous: string;
      next: string;
    };
    checklist: {
      title: string;
      /** "{done} of {total} details ready" */
      progress: string;
      fields: Record<BriefField, string>;
      pending: string;
      /** "{nights} nights" and its singular. */
      nights: string;
      nightOne: string;
      /** "{adults} adults" / "{adults} adults, {children} children" */
      adults: string;
      adultsAndChildren: string;
      generate: string;
      generateHint: string;
      /** The text sent when "Generate my trip" is pressed. */
      generateMessage: string;
    };
    panel: {
      draft: string;
      /** "{count} days in {destination}" */
      heading: string;
      headingNoDestination: string;
      days: string;
      dayOne: string;
      experiences: string;
      /** Singular of `experiences`. */
      experienceOne: string;
      hotel: string;
      legs: string;
      legOne: string;
      save: string;
      saveHint: string;
      reset: string;
      /** "Route {from} → {to}" */
      route: string;
      searchFlights: string;
      mapTitle: string;
      mapPlaceholder: string;
      /** "Stay · {nights} nights" */
      stay: string;
      stayNoNights: string;
      change: string;
      remove: string;
      /** "Day {day}" */
      day: string;
      showDay: string;
      hideDay: string;
      emptySlot: string;
      priceNote: string;
      weatherSource: string;
      warnings: Record<WarnCode, string>;
    };
    alternatives: {
      title: string;
      /** "Day {day} · {part}" */
      slot: string;
      close: string;
      current: string;
      none: string;
      askMore: string;
      /** The message sent to ask for options: "Alternatives for day {day} · {part}" */
      askMessage: string;
      /** The message sent from the stay card's "Change". */
      askStayMessage: string;
      /** "Shortlist · {count}" */
      shortlist: string;
    };
    errors: {
      generic: string;
      unauthorized: string;
    };
    /** Shown while the synthetic session answers instead of ai_api (TRA-158). */
    demo: {
      title: string;
      body: string;
      dismiss: string;
    };
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
    /** Spinner copy while the trips load from the API. */
    loading: string;
    errorTitle: string;
    errorDescription: string;
    retry: string;
  };
  auth: {
    login: string;
    logout: string;
    welcomeBack: string;
    subtitle: string;
    terms: string;
    loginError: string;
    continueWithGoogle: string;
    redirecting: string;
    completingSignIn: string;
    callbackError: string;
    backHome: string;
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
