import type { Translations } from "./types";

const en: Translations = {
  nav: {
    howItWorks: "How It Works",
    features: "Features",
    reviews: "Reviews",
    planMyTrip: "Plan My Trip",
    myDashboard: "My Dashboard",
    home: "Home",
  },
  common: {
    planning: "Planning",
    planned: "Planned",
    finished: "Finished",
  },
  tripViewer: {
    backToDashboard: "Back to Dashboard",
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
    localTips: "Local Tips",
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
  },
  hero: {
    badge: "AI-Powered Travel Planning",
    title: "Your Dream Trip,\nDesigned by AI.",
    subtitle:
      "Tell us where you want to go, your budget, and your travel style. Our AI crafts a personalized, day-by-day itinerary built just for you — in seconds.",
    ctaPrimary: "Plan My Trip Free",
    ctaSecondary: "See How It Works ↓",
    trust1: "✓ No credit card required",
    trust2: "✓ 50,000+ trips planned",
    trust3: "✓ 190+ destinations",
  },
  planner: {
    label: "Plan Your Trip",
    title: "Tell the AI where you want to go",
    destination: "Destination",
    destinationPlaceholder: "Where do you want to go?",
    dates: "Travel Dates",
    datesPlaceholder: "When are you going?",
    budget: "Budget",
    budgetPlaceholder: "Your total budget",
    travelers: "Travelers",
    travelersPlaceholder: "How many people?",
    travelStyle: "Travel Style",
    styles: [
      { emoji: "🏔", label: "Adventure" },
      { emoji: "🌴", label: "Relaxation" },
      { emoji: "🏛", label: "Culture" },
      { emoji: "🍜", label: "Foodie" },
      { emoji: "💑", label: "Romance" },
      { emoji: "🎒", label: "Backpacker" },
    ],
    generate: "Generate My Perfect Itinerary",
    comingSoon: "Coming soon — backend in progress!",
    comingSoonNote:
      "The AI trip generator will be live once we connect the FastAPI backend. Stay tuned!",
  },
  howItWorks: {
    label: "How It Works",
    title: "Three steps to your\nperfect getaway.",
    steps: [
      {
        number: "1",
        title: "Tell Us Your Dreams",
        description:
          "Enter your destination, travel dates, budget, group size, and travel vibe. Takes less than 60 seconds.",
      },
      {
        number: "2",
        title: "AI Builds Your Itinerary",
        description:
          "Our AI analyzes thousands of options, reviews, and local insights to craft a day-by-day personalized itinerary.",
      },
      {
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
        emoji: "🧠",
        title: "Hyper-Personalized AI",
        description:
          "Learns your preferences to suggest experiences that genuinely match your style — not just tourist traps.",
      },
      {
        emoji: "📅",
        title: "Day-by-Day Itineraries",
        description:
          "Detailed schedules, timings, and logistics for every day of your trip — optimized for minimum travel, maximum fun.",
      },
      {
        emoji: "💰",
        title: "Smart Budget Control",
        description:
          "Set your budget and watch the AI optimize every recommendation — from hotels to restaurants — to your spending limit.",
      },
      {
        emoji: "🗺️",
        title: "Interactive Maps",
        description:
          "Visual maps showing your entire route, hotel locations, and must-see attractions at a glance.",
      },
      {
        emoji: "🍽️",
        title: "Local Foodie Guide",
        description:
          "Hand-picked restaurant recommendations for every meal, filtered by cuisine, budget, and location.",
      },
      {
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
    links: {
      Product:      ["How It Works", "Features", "Pricing", "Sample Trips"],
      Destinations: ["Europe", "Asia", "Americas", "All Destinations"],
      Company:      ["About", "Blog", "Privacy Policy", "Terms of Service"],
    },
    copyright: "© 2025 Travel AI World. All rights reserved.",
  },
  planPage: {
    title: "Trip Planner",
    description:
      "The AI-powered trip planner is coming soon. We're connecting it to our FastAPI backend. Check back shortly!",
    back: "← Back to Home",
  },
  tripPage: {
    title: "Trip",
    description:
      "The AI-generated itinerary viewer is under construction. Once our FastAPI backend is live, your trip details will appear here.",
    back: "← Back to Home",
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
  },
};

export default en;
