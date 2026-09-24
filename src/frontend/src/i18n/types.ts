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
    /** The way to the account's trips: the signed-in home. */
    trips: string;
    /** The same way where the bar is a phone wide: one word, one line. */
    tripsShort: string;
    openMenu: string;
    closeMenu: string;
    selectLanguage: string;
    userMenu: string;
    menu: string;
    /** The way into the admin console, shown to administrators only. */
    admin: string;
    /** The phone menu's way to the planner, empty (TRA-236). */
    planTrip: string;
    /** The phone menu's heading over the language choice. */
    language: string;
    /** The phone menu's card: Kiri with a sticker per trip. */
    suitcase: string;
    /** "{trips} trips, {stickers} stickers" */
    suitcaseCount: string;
    /** The same with one trip and one sticker. */
    suitcaseCountOne: string;
    /** The phone menu's account row. */
    account: string;
    /** The header's language button: "Language: {language}" */
    languageCurrent: string;
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
    /** Under the field, the cities there are: "For now: {cities}" (TRA-236). */
    cities: string;
    /** The cities while the list is unknown (signed out, no backend). */
    citiesFallback: string;
    /** What Kiri says while she waits, listens, notes and sets off. */
    kiri: {
      ready: string;
      listening: string;
      noting: string;
      off: string;
    };
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
    /** Kiri's card over the trips (TRA-237): "Your suitcase carries {count} stickers" */
    suitcase: string;
    suitcaseOne: string;
  };

  /** The planner page (`/plan/`): chat + option cards + live itinerary (TRA-144). */
  plan: {
    title: string;
    subtitle: string;
    tabs: { chat: string; trip: string };
    /** The phone's day sheet over the map (TRA-238): its handle's two names. */
    sheet: { expand: string; collapse: string };
    /** "Share" copies the trip's link; the button says so for a moment. */
    share: string;
    shareCopied: string;
    /** Kiri's answer, told as packing a suitcase (TRA-239). */
    packing: {
      /** Kiri's name tag over her answers. */
      kiri: string;
      steps: { open: string; list: string; wardrobe: string; fold: string; weigh: string; zip: string };
      /** One line under the step on its way, what it is doing. */
      details: { open: string; list: string; wardrobe: string; fold: string; weigh: string; zip: string };
      /** How long the turn has been on its way, for screen readers: "{seconds} seconds" */
      elapsed: string;
      closed: string;
      /** "in {seconds} s" */
      closedIn: string;
      withWarning: string;
      howIPacked: string;
      boarding: {
        title: string;
        dates: string;
        travellers: string;
        days: string;
        stops: string;
        /** "Gate: day 1" */
        gate: string;
      };
      tag: {
        title: string;
        heading: string;
        missing: string;
        missingOne: string;
        toDecide: string;
        budget: string;
      };
      lost: { title: string; safe: string; retry: string };
      /** The stickers a warning puts on a day. */
      stickers: {
        overloaded_day: string;
        too_far: string;
        closed: string;
        unverified_price: string;
      };
    };
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
      /** The pane before a word has been said: heading and one sentence. */
      emptyTitle: string;
      emptyDescription: string;
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
      /** Beside a saved trip: "New trip" leaves it and opens an empty planner. */
      newTripHint: string;
      /** "Start over" clears the conversation but stays on the same trip. */
      resetHint: string;
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
      /** The same on the whole-trip overview, which maps no day (TRA-238). */
      regionTrip: string;
      /** A dashed mark for an option Kiri proposes: "Option: {title}" */
      option: string;
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
    /** The account's trips: listed on the home, opened in the planner (TRA-201). */
    trips: {
      /** The heading over the list, and the header's way back to it. */
      title: string;
      /**
       * Starts a new trip: from the home, and in the planner beside a saved
       * trip or one that is not there (TRA-223).
       */
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
        /** "{count} days" / "1 day" and "{count} stops" / "1 stop" (TRA-237). */
        days: string;
        daysOne: string;
        stops: string;
        stopsOne: string;
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
    /** Where the guides and the maps come from. */
    sources: string;
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
  /** The admin console (`/admin/`, TRA-222): only administrators ever see it. */
  admin: {
    nav: {
      /** The console's own navigation (sidebar and tab strip). */
      label: string;
      overview: string;
      turns: string;
      trips: string;
      users: string;
    };
    /** Any `/admin/` URL opened by an account that is not an administrator. */
    gate: {
      title: string;
      description: string;
      back: string;
    };
    common: {
      loading: string;
      error: string;
      forbidden: string;
      retry: string;
      loadMore: string;
      loadingMore: string;
      empty: string;
      /** A value the backend does not have (no price, no city). */
      none: string;
      copied: string;
      yes: string;
      no: string;
    };
    overview: {
      title: string;
      /** The range picker's label. */
      range: string;
      last7: string;
      last30: string;
      rangeSpan: string;
      kpis: {
        label: string;
        turns: string;
        turnsHint: string;
        errorRate: string;
        errorRateHint: string;
        p95: string;
        p95Hint: string;
        outputTokens: string;
        outputTokensHint: string;
        cost: string;
        costHint: string;
        noHit: string;
        noHitHint: string;
        usedRetrieved: string;
        usedRetrievedHint: string;
      };
      chart: {
        title: string;
        /** The SVG's accessible name. */
        label: string;
        tokensTitle: string;
        ok: string;
        errors: string;
        cancelled: string;
        tokens: string;
        p95: string;
        day: string;
        empty: string;
        legend: string;
      };
      tables: {
        byModel: string;
        byCity: string;
        byKind: string;
        topUsed: string;
        neverUsed: string;
        model: string;
        turns: string;
        tokensIn: string;
        tokensOut: string;
        cost: string;
        city: string;
        errors: string;
        kind: string;
        docId: string;
        title: string;
        count: string;
        retrieved: string;
      };
    };
    turns: {
      title: string;
      filters: string;
      day: string;
      kind: string;
      status: string;
      user: string;
      city: string;
      cityPlaceholder: string;
      all: string;
      anyone: string;
      kinds: { planner: string; chat: string; card: string };
      statuses: { ok: string; error: string; cancelled: string };
      columns: {
        time: string;
        user: string;
        city: string;
        action: string;
        llmCalls: string;
        searches: string;
        tokens: string;
        latency: string;
        status: string;
        preview: string;
      };
      /** `{used}` of `{retrieved}` documents were used. */
      searchesHint: string;
      caption: string;
      empty: string;
    };
    users: {
      title: string;
      caption: string;
      columns: {
        name: string;
        email: string;
        role: string;
        subject: string;
        active: string;
        turns: string;
      };
      roles: { user: string; admin: string };
      viewTurns: string;
      /** The copy button's accessible name. */
      copySubject: string;
      empty: string;
    };
    trips: {
      title: string;
      caption: string;
      columns: {
        owner: string;
        title: string;
        city: string;
        dates: string;
        phase: string;
        created: string;
      };
      empty: string;
    };
    /** One saved trip, read only (`/admin/trip/?user=&id=`, TRA-229). */
    trip: {
      title: string;
      back: string;
      notFound: string;
      /** Says the page changes nothing. */
      readOnly: string;
      details: string;
      owner: string;
      city: string;
      dates: string;
      phase: string;
      created: string;
      updated: string;
      tripId: string;
      sessionId: string;
      /** The copy buttons' accessible names. */
      copyTripId: string;
      copySessionId: string;
      itinerary: string;
      /** Over the selected day's cards; `{day}` is its number. */
      dayHeading: string;
      closeDay: string;
      noDays: string;
      turnsTitle: string;
      /** `{count}` turns. */
      turnsCount: string;
      turnsCountOne: string;
      turnsCaption: string;
      /** The trip was saved before TRA-220 recorded sessions. */
      noSession: string;
      noTurns: string;
      /** Shown when the session has more than the page reads; `{count}` is the cap. */
      truncated: string;
    };
    turn: {
      title: string;
      back: string;
      notFound: string;
      summary: string;
      id: string;
      ts: string;
      kind: string;
      status: string;
      city: string;
      model: string;
      tokens: string;
      latency: string;
      cost: string;
      context: string;
      spans: string;
      timeline: string;
      export: string;
      /** The inspector (TRA-228): the left column, what the traveller saw. */
      traveller: {
        title: string;
        hint: string;
        /** "Chosen: {group}" — a `select` action. */
        chosen: string;
        /** "Removed {card}" — a `remove` action. */
        removed: string;
        itinerary: string;
        stay: string;
        route: string;
        /** "{origin} to {destination}" */
        routeValue: string;
        weather: string;
        /** "Day {day}" */
        day: string;
        places: string;
        /** "Options: {group}" */
        options: string;
        /** "{count} cards" and its singular. */
        cards: string;
        cardOne: string;
        warnings: string;
        noAnswer: string;
      };
      /** The numbered marks: "Go to {section}". */
      marks: {
        goTo: string;
        events: string;
        model: string;
        trace: string;
        kb: string;
      };
      /** The right column's heading, "What is not seen". */
      inspector: {
        title: string;
        /** "Turn {n} of {total}" */
        position: string;
        previous: string;
        next: string;
      };
      chips: {
        label: string;
        action: string;
        model: string;
        llmCalls: string;
        validated: string;
        /** "{count} repairs" and its singular. */
        repairs: string;
        repairOne: string;
        searches: string;
        /** "+{count} by id" */
        byId: string;
        tokens: string;
        duration: string;
        /** "first event at {ms}" */
        firstEvent: string;
      };
      /** The five phases, named after packing a suitcase (ADR 0024). */
      phases: { open: string; wardrobe: string; fold: string; weigh: string; zip: string };
      trace: {
        title: string;
        /** "0 to {total}" */
        range: string;
        legend: string;
        kinds: { llm: string; retriever: string; tool: string; chain: string };
        warning: string;
        error: string;
        goToKb: string;
        message: string;
        empty: string;
      };
      brief: {
        title: string;
        complete: string;
        /** "{count} missing" */
        missing: string;
        empty: string;
      };
      calls: {
        title: string;
        tabs: string;
        /** "day {day}" after the schema's name. */
        day: string;
        /** "{model}, {input} in, {output} out" */
        caption: string;
        /** ", first chunk at {ttfc}" appended to the caption. */
        ttfc: string;
        validated: string;
        /** "{count} repairs" and its singular. */
        repairs: string;
        repairOne: string;
        /** "{count} ids dropped" and its singular. */
        dropped: string;
        droppedOne: string;
        /** "{count} prices stripped" and its singular. */
        prices: string;
        priceOne: string;
        noOutput: string;
        empty: string;
      };
      events: {
        title: string;
        /** "{count} events" and its singular. */
        count: string;
        countOne: string;
        caption: string;
        time: string;
        type: string;
        summary: string;
        /** "{count} deltas" and its singular. */
        deltas: string;
        deltaOne: string;
        warning: string;
        end: string;
      };
      kb: {
        title: string;
        filters: string;
        embeddings: string;
        /** "ladder step {step}" */
        ladder: string;
        purposes: {
          neighbourhoods: string;
          /** "candidates for day {day}, {part}" */
          candidatesDay: string;
          candidates: string;
          hotels: string;
          named: string;
          chat: string;
          climate: string;
          fetch: string;
          photos: string;
        };
        /** The results table's accessible name: "Results of search {seq}". */
        caption: string;
        columns: {
          used: string;
          document: string;
          id: string;
          category: string;
          district: string;
          distance: string;
        };
        usedYes: string;
        usedNo: string;
        /** "Cosine distance: lower is closer. {used} of {k} used." */
        footnote: string;
        noResults: string;
        /** Pill on a search that found nothing (the payload's `no_hit`). */
        noHit: string;
        empty: string;
      };
      /** The phone's bottom sheet. */
      sheet: {
        expand: string;
        collapse: string;
        tabs: string;
        tab: { trace: string; kb: string; model: string; events: string };
        stats: { model: string; duration: string; calls: string; searches: string };
        /** "{count} to the model" */
        callsValue: string;
        /** "{count} searches" */
        searchesValue: string;
      };
    };
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
    /** The menu's heading over the three choices (TRA-236). */
    label: string;
    /** The three choices, short. */
    darkShort: string;
    lightShort: string;
    system: string;
  };
}
