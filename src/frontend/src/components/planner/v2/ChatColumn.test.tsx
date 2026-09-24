import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import {
  initialPlannerState,
  type OptionGroupState,
  type PlannerMessage,
  type PlannerState,
} from "@/hooks/plannerReducer";
import { FIRST_ITINERARY_OPS, GROUP_IDS, NEIGHBOURHOODS } from "@/data/planner-demo/session";
import { EMPTY_BRIEF } from "@/types/planner";
import { applyItineraryOps, EMPTY_ITINERARY } from "@/hooks/plannerReducer";
import { ChatColumn } from "./ChatColumn";

const p = en.plan;

const neighbourhoods: OptionGroupState = {
  group_id: GROUP_IDS.neighbourhoods,
  kind: "neighbourhood",
  prompt: "Where would you like to stay?",
  slot: null,
  selection: "single",
  cards: [NEIGHBOURHOODS.belvaros, NEIGHBOURHOODS.erzsebetvaros],
  selectedIds: [NEIGHBOURHOODS.belvaros.id],
  dismissedIds: [],
};

const MESSAGES: PlannerMessage[] = [
  { id: "m1", kind: "text", role: "user", content: "5 days in Budapest" },
  { id: "m2", kind: "text", role: "assistant", content: "Good plan!" },
  { id: "m3", kind: "selection", titles: ["Belváros"] },
  { id: "m4", kind: "options", groupId: GROUP_IDS.neighbourhoods },
];

const state = (overrides: Partial<PlannerState> = {}): PlannerState => ({
  ...initialPlannerState(),
  messages: MESSAGES,
  groups: { [GROUP_IDS.neighbourhoods]: neighbourhoods },
  missing: ["dates"],
  ...overrides,
});

function renderColumn(
  overrides: Partial<PlannerState> = {},
  errorText: string | null = null,
  props: Partial<ComponentProps<typeof ChatColumn>> = {}
) {
  const handlers = {
    onSend: vi.fn(),
    onAnswer: vi.fn(),
    onSelect: vi.fn(),
    onDismiss: vi.fn(),
    onToggleShortlist: vi.fn(),
    onNewTrip: vi.fn(),
  };
  const result = renderWithProviders(
    <ChatColumn
      state={state(overrides)}
      errorText={errorText}
      unavailable={false}
      {...handlers}
      {...props}
    />
  );
  return { ...result, ...handlers };
}

describe("ChatColumn — a trip that can no longer change", () => {
  it("puts the locked notice where the composer was, and offers the way on", () => {
    const { onNewTrip } = renderColumn({}, null, { lockedPhase: "past" });

    expect(screen.getByText(en.plan.locked.past)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: en.plan.locked.action }));
    expect(onNewTrip).toHaveBeenCalledTimes(1);
  });

  it("still shows the transcript of the trip it is reading", () => {
    renderColumn({}, null, { lockedPhase: "ongoing" });

    expect(screen.getByRole("log")).toBeInTheDocument();
    expect(screen.getByText(en.plan.locked.ongoing)).toBeInTheDocument();
  });
});

describe("ChatColumn", () => {
  it("renders the transcript: bubbles, the chosen chip and the carousel", () => {
    renderColumn();

    expect(screen.getByRole("log")).toBeInTheDocument();
    expect(screen.getByText("5 days in Budapest")).toBeInTheDocument();
    expect(screen.getByText("Good plan!")).toBeInTheDocument();
    expect(screen.getByText("Chosen: Belváros")).toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: interpolate(p.carousel.label, { prompt: neighbourhoods.prompt }),
      })
    ).toHaveAttribute("aria-roledescription", "carousel");
  });

  it("asks for the missing fields while idle and stays quiet while streaming", () => {
    const { unmount } = renderColumn();
    expect(screen.getByText(p.quickReplies.title)).toBeInTheDocument();
    expect(screen.getByLabelText(p.quickReplies.from)).toBeInTheDocument();
    unmount();

    renderColumn({ status: "streaming" });
    expect(screen.queryByText(p.quickReplies.title)).not.toBeInTheDocument();
  });

  it("sends what the user typed", () => {
    const { onSend } = renderColumn();

    const textarea = screen.getByPlaceholderText(p.composerPlaceholder);
    fireEvent.change(textarea, { target: { value: "Make it cheaper" } });
    fireEvent.click(screen.getByRole("button", { name: en.planner.send }));

    expect(onSend).toHaveBeenCalledWith("Make it cheaper");
    expect(textarea).toHaveValue("");
  });

  it("shows the failure of the last turn as an alert", () => {
    renderColumn({}, p.errors.generic);

    expect(screen.getByRole("alert")).toHaveTextContent(p.errors.generic);
  });

  it("introduces the page when nothing has been said yet", () => {
    renderColumn({ messages: [], groups: {} });

    expect(screen.getByText(p.subtitle)).toBeInTheDocument();
  });
});

describe("ChatColumn — while the URL's trip is not in the planner (TRA-223)", () => {
  it("shows no transcript and takes no turn", () => {
    const { onSend } = renderColumn({}, null, { holding: true });

    expect(screen.queryByText("5 days in Budapest")).toBeNull();
    expect(screen.queryByText("Good plan!")).toBeNull();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3 days in Bologna" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows the transcript again once the trip is there", () => {
    renderColumn({}, null, { holding: false });

    expect(screen.getByText("5 days in Budapest")).toBeInTheDocument();
  });
});

describe("ChatColumn — Kiri's answer (TRA-239)", () => {
  it("packs the suitcase under the message that started the turn, while it streams", () => {
    renderColumn({
      status: "streaming",
      packing: { step: "wardrobe", folded: false, warned: false, failed: false, detail: null, sources: [], live: false },
      messages: [
        { id: "m1", kind: "text", role: "user", content: "5 days in Budapest" },
        { id: "m2", kind: "text", role: "assistant", content: "" },
      ],
    });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(p.packing.steps.wardrobe);
    expect(status).toHaveTextContent(p.packing.details.wardrobe);
  });

  it("closes the suitcase into a boarding pass once the trip has days, and tells how it packed", async () => {
    renderColumn({
      status: "idle",
      packing: { step: "zip", folded: true, warned: true, failed: false, detail: null, sources: [], live: false },
      brief: { ...EMPTY_BRIEF, destination: "Budapest", origin: "Madrid", adults: 2 },
      itinerary: applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS),
      missing: [],
    });
    // The lid shuts first; the boarding pass is what it closes into.
    expect(document.querySelector('[data-packing="closing"]')).not.toBeNull();
    expect(
      await screen.findByRole("region", { name: p.packing.boarding.title }, { timeout: 3000 })
    ).toHaveTextContent("Budapest");
    expect(screen.getByText(p.packing.closed)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: p.packing.howIPacked }));
    const steps = Array.from(document.querySelectorAll("li[data-step]"));
    expect(steps.map((item) => item.getAttribute("data-step"))).toEqual([
      "open",
      "list",
      "wardrobe",
      "fold",
      "weigh",
      "zip",
    ]);
  });

  it("fills the open suitcase with the list, the sources and each day's stops", () => {
    const itinerary = applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS);
    renderColumn({
      status: "streaming",
      packing: {
        step: "fold",
        folded: true,
        warned: false,
        failed: false,
        detail: "Sharing the stops out over 3 days, close to each other.",
        sources: ["Wikivoyage", "Open-Meteo"],
        live: true,
      },
      brief: { ...EMPTY_BRIEF, destination: "Budapest", adults: 2 },
      itinerary,
      messages: [
        { id: "m1", kind: "text", role: "user", content: "3 days in Budapest" },
        { id: "m2", kind: "text", role: "assistant", content: "" },
      ],
    });
    // The server's sentence is what the status says.
    expect(screen.getByRole("status")).toHaveTextContent("over 3 days");
    const suitcase = document.querySelector("[data-suitcase]");
    expect(suitcase).toHaveTextContent(p.packing.suitcase.list);
    expect(suitcase).toHaveTextContent("Budapest");
    expect(suitcase).toHaveTextContent("Open-Meteo");
    const firstStop = itinerary.days[0]?.slots.morning[0]?.title ?? "";
    expect(suitcase).toHaveTextContent(firstStop);
    expect(suitcase).toHaveTextContent(interpolate(p.packing.suitcase.day, { day: 1 }));
  });

  it("writes what is missing on a luggage tag over the quick replies", () => {
    renderColumn({
      brief: { ...EMPTY_BRIEF, destination: "Bologna", adults: 2 },
      missing: ["dates", "origin"],
    });
    const tag = screen.getByRole("region", { name: p.packing.tag.title });
    expect(tag).toHaveTextContent("Bologna");
    expect(tag.querySelector('[data-field="dates"]')).toHaveTextContent(p.packing.tag.toDecide);
    expect(tag.querySelector('[data-field="travellers"]')).not.toHaveTextContent(p.packing.tag.toDecide);
  });

  it("asks with the tag even when the destination is outside the corpus (TRA-243)", () => {
    renderColumn({
      status: "idle",
      brief: { ...EMPTY_BRIEF },
      missing: ["destination", "dates"],
      packing: { step: "zip", folded: false, warned: false, failed: false, detail: null, sources: [], live: true },
      messages: [
        { id: "m1", kind: "text", role: "user", content: "Four days in Lisbon" },
        { id: "m2", kind: "text", role: "assistant", content: "For now I can plan Budapest." },
      ],
    });
    const tag = screen.getByRole("region", { name: p.packing.tag.title });
    expect(tag).toHaveTextContent(p.packing.tag.toDecide);
    // Nothing was packed: the suitcase does not close, Kiri just asks.
    expect(screen.queryByText(p.packing.closed)).not.toBeInTheDocument();
    expect(document.querySelector("[data-packing]")).toBeNull();
    expect(screen.getByText(p.packing.kiri)).toBeInTheDocument();
  });

  it("reports a failed turn as lost luggage, and retries it", () => {
    const onRetry = vi.fn();
    renderColumn({ status: "error", error: "generic" }, p.errors.generic, { onRetry });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(p.packing.lost.title);
    expect(alert).toHaveTextContent(p.packing.lost.safe);
    fireEvent.click(screen.getByRole("button", { name: p.packing.lost.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("offers no retry when the session is what failed", () => {
    renderColumn({ status: "error", error: "unauthorized" }, p.errors.unauthorized, {
      onRetry: vi.fn(),
    });
    expect(screen.queryByRole("button", { name: p.packing.lost.retry })).not.toBeInTheDocument();
  });
});
