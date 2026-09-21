// ─── Shared i18n types ────────────────────────────────────────────────────────
// Add new locales here: "en" | "es" | "fr" ... and describe them in LANGUAGES
// (src/i18n/index.ts). The compiler flags whichever of the two you forget.
import type { TripPhase } from "@/types/trip";
import type { BriefField, DayPart, WarnCode } from "@/types/planner";

export type Language = "en" | "es";

// The shape every locale file MUST satisfy.
// TypeScript will error on import if any key is missing.
export interface Translations {
  nav: {
    /** The header action once you are signed in. */
    openPlanner: string;
    /** The same action where the bar is a phone wide: one word, one line. */
    plannerShort: string;
    /** The way to the account's trips, which live in the planner. */
    trips: string;
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
  errors: {
    title: string;
    description: string;
    retry: string;
  };
  /** The landing (`/`): the question, the field and the one action (TRA-190). */
  landing: {
    /** The page's only heading; it also names the field below it. */
    headline: string;
    /** The asks the placeholder types out, one after another. */
    examples: string[];
    /** The action: it opens the planner with what was typed. */
    send: string;
    /** The same button while the planner opens. */
    sending: string;
  };
  /** The composer shared by the planner page (`PromptComposer`). */
  planner: {
    /** The textarea's accessible name. */
    title: string;
    placeholder: string;
    send: string;
    sendHint: string;
    /** Shown when no ai_api URL is configured (static preview builds). */
    unavailable: string;
  };

  /** The signed-in home (`/dashboard/`): the ask, then the account's trips (TRA-199). */
  dashboard: {
    /** The page's `h1`, which also names the field under it. */
    headline: string;
  };

  /** The planner page (`/plan/`): chat + option cards + live itinerary (TRA-144). */
  plan: {
    title: string;
    subtitle: string;
    tabs: { chat: string; trip: string; map: string };
    composerPlaceholder: string;
    /** "Chosen: {titles}" chip in the transcript. */
    chosen: string;
    /** Shortcut requests under the composer. */
    suggestions: string[];
    /** Starter chip per covered city: "Plan a trip to {city}". */
    cityStarter: string;
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
      /** Unplaced card: opens the day/part picker instead of adding at once. */
      addToTrip: string;
    };
    /** Where an unplaced card goes: the traveller names the day and the part. */
    slotPicker: {
      title: string;
      day: string;
      part: string;
      confirm: string;
      cancel: string;
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
      /** Why the button is disabled: a demo session saves nothing. */
      saveHint: string;
      /** While the trip is being written. */
      saving: string;
      saved: string;
      /** The link beside "Saved", to the trip viewer. */
      openTrip: string;
      /** The status beside the button when the write failed. */
      saveError: string;
      saveRetry: string;
      reset: string;
      /** "Route {from} → {to}" */
      route: string;
      searchFlights: string;
      /** Accessible name of the horizontal day strip. */
      daysNav: string;
      /** The strip's leading chip, back to the overview: "Whole trip" */
      wholeTrip: string;
      /** The overview panel's accessible name: "Trip overview" */
      overview: string;
      /** The overview's description heading: "About {destination}" */
      about: string;
      /** The credit under that description (the corpus's licence). */
      introCredit: string;
      /** The photo mosaic's accessible name: "Photos of {destination}" */
      photos: string;
      /** The overview's day list: "Days of the trip" */
      dayList: string;
      /** One row of that list: "Open day {day}" */
      openDay: string;
      /** "Stay · {nights} nights" */
      stay: string;
      stayOne: string;
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
      /** While the options for the slot are streaming in. */
      loading: string;
      /** The footer button: the next page of options for the same slot. */
      more: string;
      /** The box above the list: what the traveller wants instead. */
      guidePlaceholder: string;
      guideSubmit: string;
      /** The message sent to ask for options: "Alternatives for day {day} · {part}" */
      askMessage: string;
      /** The guided ask: "Alternatives for day {day} · {part}: {guidance}" */
      askMessageGuided: string;
      /** The message sent from the stay card's "Change". */
      askStayMessage: string;
      /** "Shortlist · {count}" */
      shortlist: string;
    };
    errors: {
      generic: string;
      unauthorized: string;
    };
    /** The day map (TRA-147): MapLibre GL over OpenFreeMap tiles. */
    map: {
      /** Accessible name of the map region: "Map of day {day}" */
      region: string;
      /** While the client-only map chunk loads. */
      loading: string;
      /** No card of the selected day carries coordinates yet. */
      empty: string;
      /** A numbered pin: "{index}. {title}" */
      marker: string;
      /** The hotel's pin: "Stay: {title}" */
      stay: string;
      /** The browser has no WebGL 2, so there is no map to show. */
      unsupported: string;
      /** MapLibre's own zoom buttons, relabelled in the reader's language. */
      zoomIn: string;
      zoomOut: string;
    };
    /** The activity page the middle column becomes on a click (TRA-179). */
    detail: {
      /** The row/card that opens an activity: "Open {title}" */
      open: string;
      /** Back to the day the activity belongs to: "← Day {day}" */
      backToDay: string;
      /** Back from the stay, which belongs to no day. */
      backToStay: string;
      /** While the full card is being fetched. */
      loading: string;
      /** Headings of the blocks the endpoint adds to the card. */
      about: string;
      address: string;
      phone: string;
      website: string;
      /** Opens Google Maps directions to the activity's coordinates. */
      directions: string;
      /** Corpus categories, translated; an unknown one falls back to its own value. */
      categories: Record<string, string>;
    };
    /** The account's trips, listed and opened in the planner (TRA-196). */
    trips: {
      /** The heading over the list, and the button that opens the sheet. */
      title: string;
      close: string;
      /** Starts a new trip from the sheet. */
      newTrip: string;
      /** The heading over each group of the list, keyed by phase. */
      groups: Record<TripPhase, string>;
      /** The pill on a card; only ongoing and past trips wear one. */
      phase: Record<TripPhase, string>;
      /** A card's dates, already formatted: "{start} – {end}". */
      dateRange: string;
      /** Read out while the cards stand in for the trips. */
      loading: string;
      emptyTitle: string;
      emptyDescription: string;
      errorTitle: string;
      errorDescription: string;
      retry: string;
      card: {
        /** The ⋯ button's accessible name: "Options for {title}". */
        menu: string;
        /** Renaming is only offered on a trip that can still be changed. */
        rename: string;
        delete: string;
      };
      rename: {
        title: string;
        label: string;
        save: string;
        saving: string;
        cancel: string;
        required: string;
        failed: string;
      };
      remove: {
        title: string;
        /** "This deletes {title} and everything planned in it..." */
        description: string;
        confirm: string;
        deleting: string;
        cancel: string;
        failed: string;
      };
      /** While `?trip=` is being loaded into the planner. */
      opening: string;
      /** An id that is not a trip of this account. */
      notFoundTitle: string;
      notFoundDescription: string;
      loadErrorTitle: string;
      loadErrorDescription: string;
      /** The old `/trip/?id=` links, on their way to `/plan/?trip=`. */
      redirecting: string;
    };
    /** A trip that is happening now or already happened: read-only (ADR 0019). */
    locked: {
      ongoing: string;
      past: string;
      /** The one way on from a locked trip. */
      action: string;
    };
    /** Shown while the synthetic session answers instead of ai_api (TRA-158). */
    demo: {
      title: string;
      body: string;
      /** The same notice in one line, for a phone-width banner. */
      short: string;
      dismiss: string;
    };
  };
  footer: {
    /** "© {year} Kyrian World" — the year is interpolated at render time. */
    copyright: string;
  };
  auth: {
    login: string;
    logout: string;
    /** The sign-in dialog's heading, which is also what it is for. */
    title: string;
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
    title: string;
    description: string;
    cta: string;
    redirecting: string;
  };
  theme: {
    toggle: string;
    light: string;
    dark: string;
  };
}
