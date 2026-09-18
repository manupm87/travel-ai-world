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
import { GROUP_IDS, NEIGHBOURHOODS } from "@/test/fixtures/planner-budapest";
import { ChatColumn } from "./ChatColumn";

const p = en.plan;

const neighbourhoods: OptionGroupState = {
  group_id: GROUP_IDS.neighbourhoods,
  kind: "neighbourhood",
  prompt: "Where would you like to stay?",
  slot: null,
  selection: "single",
  cards: [NEIGHBOURHOODS.belvaros, NEIGHBOURHOODS.erzsebetvaros],
  selectedIds: ["wv:belvaros"],
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

function renderColumn(overrides: Partial<PlannerState> = {}, errorText: string | null = null) {
  const handlers = {
    onSend: vi.fn(),
    onAnswer: vi.fn(),
    onSelect: vi.fn(),
    onDismiss: vi.fn(),
    onToggleShortlist: vi.fn(),
  };
  const result = renderWithProviders(
    <ChatColumn state={state(overrides)} errorText={errorText} unavailable={false} {...handlers} />
  );
  return { ...result, ...handlers };
}

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
