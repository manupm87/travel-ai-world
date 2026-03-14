// ─── Shared i18n types ────────────────────────────────────────────────────────
// Add new locales here: "en" | "es" | "fr" ...
export type Language = "en" | "es";

export interface StyleOption {
  emoji: string;
  label: string;
}

export interface Step {
  number: string;
  title: string;
  description: string;
}

export interface FeatureItem {
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

// The shape every locale file MUST satisfy.
// TypeScript will error on import if any key is missing.
export interface Translations {
  nav: {
    howItWorks: string;
    features: string;
    reviews: string;
    planMyTrip: string;
    myDashboard: string;
    home: string;
  };
  common: {
    planning: string;
    planned: string;
    finished: string;
  };
  tripViewer: {
    backToDashboard: string;
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
    localTips: string;
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
    trust1: string;
    trust2: string;
    trust3: string;
  };
  planner: {
    label: string;
    title: string;
    destination: string;
    destinationPlaceholder: string;
    dates: string;
    datesPlaceholder: string;
    budget: string;
    budgetPlaceholder: string;
    travelers: string;
    travelersPlaceholder: string;
    travelStyle: string;
    styles: StyleOption[];
    generate: string;
    comingSoon: string;
    comingSoonNote: string;
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
    links: Record<string, string[]>;
    copyright: string;
  };
  planPage: {
    title: string;
    description: string;
    back: string;
  };
  tripPage: {
    title: string;
    description: string;
    back: string;
  };
  dashboard: {
    heroTitle: string;
    sections: {
      planned: string;
      planning: string;
      finished: string;
    };
    emptyTitle: string;
    emptyDescription: string;
  };
}
