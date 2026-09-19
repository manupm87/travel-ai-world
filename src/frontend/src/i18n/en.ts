import type { Translations } from "./types";

const en: Translations = {
  nav: {
    howItWorks: "How It Works",
    features: "Features",
    reviews: "Reviews",
    planMyTrip: "Plan My Trip",
    dashboard: "Dashboard",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    selectLanguage: "Select language",
    userMenu: "Account menu",
    menu: "Menu",
  },
  common: {
    loading: "Loading...",
    close: "Close",
  },
  status: {
    planning: "Planning",
    planned: "Planned",
    finished: "Finished",
  },
  errors: {
    title: "Oops! Something went wrong.",
    description: "An unexpected error occurred while loading this page.",
    retry: "Try again",
  },
  tripViewer: {
    travelers: "Travelers",
    totalBudget: "Total Budget",
    viewBookings: "View Bookings",
    exportPdf: "Export PDF",
    viewItinerary: "View Itinerary",
    journeyMap: "Journey Map",
    routeOverview: "Route Overview",
    tripOverview: "Trip Overview",
    accommodations: "Accommodations",
    transportation: "Transportation",
    aiInsights: "AI Insights",
    weatherForecast: "Weather Forecast",
    weatherUnavailable: "Weather information currently unavailable for this trip.",
    localTips: "Local Tips",
    noLocalTips: "No local tips available yet.",
    yourItinerary: "Your Itinerary",
    journeyTitle: "Your {duration}-Day Journey",
    allDays: "All Days",
    freeDay: "FREE DAY",
    travel: "TRAVEL",
    dining: "Dining",
    bookingRequired: "Booking Required",
    estimated: "estimated",
    selfPlanned: "Self-planned",
    nights: "Nights",
    budgetBreakdown: {
      accommodation: "ACCOMMODATION",
      food: "FOOD & DINING",
      activities: "ACTIVITIES",
      transport: "TRANSPORT",
    },
    loading: "Loading your trip…",
    notFoundTitle: "We couldn't find that trip",
    notFoundDescription: "It may have been deleted, or the link may be wrong. Your trips are waiting for you on the dashboard.",
    backToDashboard: "Back to my trips",
    errorTitle: "We couldn't load your trip",
    errorDescription: "Something went wrong while talking to the server. Check your connection and try again.",
    retry: "Try again",
  },
  hero: {
    badge: "AI-Powered Travel Planning",
    title: "Your Dream Trip,\nDesigned by AI.",
    subtitle:
      "Tell us where you want to go, your budget, and your travel style. Our AI crafts a personalized, day-by-day itinerary built just for you — in seconds.",
    ctaPrimary: "Plan My Trip Free",
    ctaSecondary: "See How It Works ↓",
    trust: [
      "✓ No credit card required",
      "✓ 50,000+ trips planned",
      "✓ 190+ destinations",
    ],
    imageAlt: "Dramatic mountain landscape at sunset for travel",
  },
  planner: {
    label: "Plan Your Trip",
    title: "Tell the AI where you want to go",
    placeholder:
      "A 7-day trip to Lisbon in October for a couple, mid-budget…",
    send: "Send",
    sendHint: "↵ Send · ⇧↵ Newline",
    examplesLabel: "Try one of these",
    examples: [
      {
        emoji: "🇵🇹",
        label: "Weekend in Lisbon",
        prompt:
          "Plan a 3-day weekend in Lisbon for two, focused on food and architecture.",
      },
      {
        emoji: "🇯🇵",
        label: "10 days in Japan",
        prompt:
          "10 days in Japan in spring: Tokyo, Kyoto, and one off-the-beaten-path stop.",
      },
      {
        emoji: "👨‍👩‍👧",
        label: "Family Madrid",
        prompt:
          "A 4-day family trip to Madrid with two kids (8 and 11), low-walking days preferred.",
      },
      {
        emoji: "🏔",
        label: "Adventure in Patagonia",
        prompt:
          "2-week adventure trip in Patagonia, hiking and outdoors, late November.",
      },
    ],
    unavailable:
      "The AI planner needs a connected backend, so it is not available on this static preview.",
    errorFallback:
      "Sorry, I couldn't process your request. Please try again.",
    errorUnauthorized:
      "Your session has expired. Log in again to keep planning.",
  },
  plan: {
    title: "Plan a trip",
    subtitle: "Talk, pick from the cards, and watch the itinerary take shape on the right.",
    tabs: { chat: "Chat", trip: "Trip", map: "Map" },
    openPlanner: "Plan a trip",
    openWithPrompt: "Continue in the full planner →",
    composerPlaceholder: "Ask for a change or search for something…",
    chosen: "Chosen: {titles}",
    suggestions: [
      "Make it cheaper",
      "Add a spa afternoon",
      "Local restaurants nearby",
    ],
    cityStarter: "Plan a trip to {city}",
    quickReplies: {
      title: "Let's refine a bit:",
      confirm: "Confirm",
      destination: "Destination",
      destinationPlaceholder: "Budapest",
      origin: "Where from?",
      originPlaceholder: "Madrid",
      dates: "Dates",
      from: "From",
      to: "To",
      travellers: "Travellers",
      adults: "Adults",
      children: "Children",
      increase: "Add one",
      decrease: "Remove one",
      budget: "Budget",
      interests: "What are you into?",
      interestOptions: [
        { id: "food", label: "Food" },
        { id: "thermal_baths", label: "Thermal baths" },
        { id: "history", label: "History" },
        { id: "architecture", label: "Architecture" },
        { id: "nightlife", label: "Nightlife" },
        { id: "museums", label: "Museums" },
        { id: "nature", label: "Nature" },
        { id: "shopping", label: "Shopping" },
      ],
      summary: {
        destination: "Destination: {value}",
        origin: "Leaving from {value}",
        dates: "Dates: {from} to {to}",
        travellers: "Travellers: {adults} adults, {children} children",
        budget: "Budget: {value}",
        interests: "Interests: {value}",
      },
    },
    priceTiers: { "1": "€", "2": "€€", "3": "€€€" },
    priceTierNames: { "1": "Budget", "2": "Mid-range", "3": "High-end" },
    parts: { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" },
    card: {
      choose: "Choose",
      chosen: "Chosen",
      addToSlot: "Add to day {day} · {part}",
      addCount: "Add {count}",
      notInterested: "Not interested",
      shortlist: "Save to shortlist",
      unshortlist: "Remove from shortlist",
      source: "Source: {source}",
      imageCredit: "Photo: {credit}",
      alreadyInDay: "Already in your day",
    },
    carousel: {
      label: "Options: {prompt}",
      roleDescription: "carousel",
      previous: "Previous options",
      next: "Next options",
    },
    checklist: {
      title: "Your trip is taking shape",
      progress: "{done} of {total} details ready",
      fields: {
        destination: "Destination",
        origin: "Origin",
        dates: "Dates",
        travellers: "Travellers",
        interests: "What you're after",
      },
      pending: "Answering in the chat…",
      nights: "{nights} nights",
      nightOne: "1 night",
      adults: "{adults} adults",
      adultsAndChildren: "{adults} adults, {children} children",
      generate: "Generate my trip",
      generateHint:
        "I'll build it now and fill in whatever is missing with sensible defaults, or keep chatting.",
      generateMessage: "Generate the trip",
    },
    panel: {
      draft: "Draft · planning",
      heading: "{count} days in {destination}",
      headingNoDestination: "Your trip",
      days: "{count} days",
      dayOne: "1 day",
      experiences: "{count} experiences",
      experienceOne: "1 experience",
      hotel: "1 hotel",
      legs: "{count} legs",
      legOne: "1 leg",
      save: "Save trip",
      saveHint: "Saving to your trips arrives with the next release.",
      reset: "Start over",
      route: "Route {from} → {to}",
      searchFlights: "Search flights",
      mapTitle: "Map",
      mapPlaceholder: "The map arrives with the next release. Your stops are listed below.",
      stay: "Stay · {nights} nights",
      stayNoNights: "Stay",
      change: "Change",
      remove: "Remove",
      day: "Day {day}",
      showDay: "Show day {day}",
      hideDay: "Hide day {day}",
      emptySlot: "Nothing here yet",
      priceNote: "No prices shown: live prices arrive in phase 2.",
      weatherSource: "Weather: {source}",
      warnings: {
        too_far: "Far from the previous stop",
        closed: "Closed that day",
        overloaded_day: "This day is packed",
        unverified_price: "Price not verified",
      },
    },
    alternatives: {
      title: "Alternatives for",
      slot: "Day {day} · {part}",
      close: "Close alternatives",
      current: "Current",
      none: "No alternatives for this slot yet.",
      loading: "Finding alternatives…",
      askMore: "Ask for more options in the chat",
      askMessage: "Alternatives for day {day} · {part}",
      askStayMessage: "Other hotel options, please",
      shortlist: "Shortlist · {count}",
    },
    errors: {
      generic: "Sorry, something went wrong while planning. Please try again.",
      unauthorized: "Your session has expired. Log in again to keep planning.",
    },
    demo: {
      title: "Demo mode",
      body:
        "The planner's backend is not connected yet, so this is a recorded Budapest session: real places, photos and sources, but the same answers for everyone. Nothing is saved.",
      dismiss: "Hide this notice",
    },
  },
  howItWorks: {
    label: "How It Works",
    title: "Three steps to your\nperfect getaway.",
    steps: [
      {
        id: "tell",
        imageAlt: "Person planning a trip on laptop",
        number: "1",
        title: "Tell Us Your Dreams",
        description:
          "Enter your destination, travel dates, budget, group size, and travel vibe. Takes less than 60 seconds.",
      },
      {
        id: "build",
        imageAlt: "AI generating a travel plan",
        number: "2",
        title: "AI Builds Your Itinerary",
        description:
          "Our AI analyzes thousands of options, reviews, and local insights to craft a day-by-day personalized itinerary.",
      },
      {
        id: "live",
        imageAlt: "Happy couple traveling",
        number: "3",
        title: "Live the Experience",
        description:
          "Download your itinerary, book directly, or let us handle reservations. Your adventure begins with one click.",
      },
    ],
  },
  features: {
    label: "Why Choose Travel AI World",
    title: "Smarter planning,\nmore memorable moments.",
    items: [
      {
        id: "personalized",
        emoji: "🧠",
        title: "Hyper-Personalized AI",
        description:
          "Learns your preferences to suggest experiences that genuinely match your style — not just tourist traps.",
      },
      {
        id: "itineraries",
        emoji: "📅",
        title: "Day-by-Day Itineraries",
        description:
          "Detailed schedules, timings, and logistics for every day of your trip — optimized for minimum travel, maximum fun.",
      },
      {
        id: "budget",
        emoji: "💰",
        title: "Smart Budget Control",
        description:
          "Set your budget and watch the AI optimize every recommendation — from hotels to restaurants — to your spending limit.",
      },
      {
        id: "maps",
        emoji: "🗺️",
        title: "Interactive Maps",
        description:
          "Visual maps showing your entire route, hotel locations, and must-see attractions at a glance.",
      },
      {
        id: "food",
        emoji: "🍽️",
        title: "Local Foodie Guide",
        description:
          "Hand-picked restaurant recommendations for every meal, filtered by cuisine, budget, and location.",
      },
      {
        id: "customizable",
        emoji: "✏️",
        title: "Fully Customizable",
        description:
          "Not happy with a suggestion? Edit, swap, or regenerate any part of your itinerary with a single click.",
      },
    ],
  },
  socialProof: {
    label: "Loved by Travelers",
    stats: [
      { value: "50,000+", label: "Trips Generated" },
      { value: "190+",    label: "Destinations Covered" },
      { value: "4.9★",   label: "Average Rating" },
      { value: "30s",    label: "Average Plan Time" },
    ],
    testimonials: [
      {
        stars: 5,
        quote:
          "I planned a 2-week Japan trip in under 5 minutes. The AI even found a cherry blossom festival I didn't know about. Absolutely magical.",
        author: "Sofia M.",
        location: "Madrid 🇪🇸",
        highlight: false,
      },
      {
        stars: 5,
        quote:
          "We had a tight budget for our honeymoon. Travel AI World found an incredible Santorini package with everything optimized. We saved €800 vs booking manually.",
        author: "Luca & Emma",
        location: "Milan 🇮🇹",
        highlight: true,
      },
      {
        stars: 5,
        quote:
          "The day-by-day itinerary for our Costa Rica adventure was perfect. Every activity was close by, timing made sense. No wasted time, pure bliss.",
        author: "James K.",
        location: "London 🇬🇧",
        highlight: false,
      },
    ],
  },
  finalCta: {
    title: "Ready to explore the world?",
    subtitle:
      "Join thousands of travelers who plan smarter. Your next adventure is just 30 seconds away.",
    ctaPrimary: "Start Planning Free",
    ctaSecondary: "Watch Demo",
  },
  footer: {
    tagline:
      "AI-powered travel planning for the modern explorer. From idea to itinerary in 30 seconds.",
    links: [
      { title: "Product", items: ["How It Works", "Features", "Pricing", "Sample Trips"] },
      { title: "Destinations", items: ["Europe", "Asia", "Americas", "All Destinations"] },
      { title: "Company", items: ["About", "Blog", "Privacy Policy", "Terms of Service"] },
    ],
    social: ["Twitter", "Instagram", "LinkedIn"],
    copyright: "© 2025 Travel AI World. All rights reserved.",
  },
  dashboard: {
    heroTitle: "Plan Your Next Adventure",
    sections: {
      planned: "Your Next Adventure",
      planning: "In the works",
      finished: "Past journeys",
    },
    emptyTitle: "Your atlas is waiting",
    emptyDescription: "You haven't planned any journeys yet. Start your next adventure with our AI planner.",
    loading: "Loading your trips…",
    errorTitle: "We couldn't load your trips",
    errorDescription: "Something went wrong while talking to the server. Check your connection and try again.",
    retry: "Try again",
  },
  auth: {
    login: "Log In",
    logout: "Log Out",
    welcomeBack: "Welcome back",
    subtitle: "Join Travel AI World to save your itineraries and explore the world.",
    terms: "By continuing, you agree to our Terms of Service and Privacy Policy.",
    loginError: "We couldn't sign you in. Please try again.",
    continueWithGoogle: "Continue with Google",
    redirecting: "Redirecting…",
    completingSignIn: "Completing your sign-in…",
    callbackError: "We couldn't complete your sign-in. Please start again.",
    backHome: "Back to the home page",
  },
  notFound: {
    subtitle: "404 - Lost in Paradise",
    description: "Even the best travel plans can go off-course. It seems you've discovered an island that isn't on our maps.",
    cta: "Return to Civilization",
    redirecting: "Preparing your adventure...",
    imageAlt: "Lost paradise island",
  },
  theme: {
    toggle: "Toggle theme",
    light: "Light mode",
    dark: "Dark mode"
  }
};


export default en;
