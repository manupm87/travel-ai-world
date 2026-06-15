import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import PlannerCard from "./PlannerCard";

const mockI18n = {
  planner: {
    label: "Plan Your Trip",
    title: "Tell the AI where you want to go",
    placeholder: "A 7-day trip to Lisbon in October for a couple, mid-budget…",
    send: "Send",
    sendHint: "↵ Send · ⇧↵ Newline",
    examplesLabel: "Try one of these",
    examples: [
      { emoji: "🇵🇹", label: "Weekend in Lisbon", prompt: "Plan a weekend in Lisbon" },
      { emoji: "🇯🇵", label: "10 days in Japan", prompt: "10 days in Japan" },
      { emoji: "👨‍👩‍👧", label: "Family Madrid", prompt: "Family trip to Madrid" },
      { emoji: "🏔", label: "Adventure in Patagonia", prompt: "2 weeks in Patagonia" },
    ],
    errorFallback: "Sorry, error.",
  },
};

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({ t: mockI18n }),
}));

vi.mock("@/components/ui/SectionLabel", () => ({
  SectionLabel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="section-label">{children}</div>
  ),
}));

let apiAvailable = true;
const streamMock = vi.fn();

vi.mock("@/services/api", () => ({
  isApiAvailable: () => apiAvailable,
  streamChat: (...args: unknown[]) => streamMock(...args),
}));

beforeEach(() => {
  apiAvailable = true;
  // jsdom does not implement scrollIntoView; stub it so the auto-scroll effect
  // does not throw once messages are appended.
  Element.prototype.scrollIntoView = vi.fn();
  streamMock.mockReset();
  streamMock.mockImplementation(async function* () {
    yield "Hello back!";
  });
});

const PLACEHOLDER = /A 7-day trip to Lisbon/i;

describe("PlannerCard", () => {
  it("renders eyebrow label and headline from i18n", () => {
    render(<PlannerCard />);
    expect(screen.getByTestId("section-label")).toHaveTextContent("Plan Your Trip");
    expect(
      screen.getByText("Tell the AI where you want to go")
    ).toBeInTheDocument();
  });

  it("renders textarea with the new placeholder", () => {
    render(<PlannerCard />);
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
  });

  it("renders send button and keyboard hint", () => {
    render(<PlannerCard />);
    expect(screen.getByRole("button", { name: /Send/ })).toBeInTheDocument();
    expect(screen.getByText("↵ Send · ⇧↵ Newline")).toBeInTheDocument();
  });

  it("renders 4 example pills with labels", () => {
    render(<PlannerCard />);
    expect(
      screen.getByRole("button", { name: /Weekend in Lisbon/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /10 days in Japan/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Family Madrid/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Adventure in Patagonia/i })
    ).toBeInTheDocument();
  });

  it("clicking a pill pre-fills the textarea and does not submit", () => {
    render(<PlannerCard />);
    fireEvent.click(screen.getByRole("button", { name: /Weekend in Lisbon/i }));
    const ta = screen.getByPlaceholderText(PLACEHOLDER) as HTMLTextAreaElement;
    expect(ta.value).toBe("Plan a weekend in Lisbon");
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("send button is disabled when input is empty or whitespace", () => {
    render(<PlannerCard />);
    const sendBtn = screen.getByRole("button", { name: /Send/ });
    expect(sendBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: "   " },
    });
    expect(sendBtn).toBeDisabled();
  });

  it("Enter submits, Shift+Enter does not", () => {
    render(<PlannerCard />);
    const ta = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.change(ta, { target: { value: "go to Paris" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
    expect(streamMock).not.toHaveBeenCalled();
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(streamMock).toHaveBeenCalledWith("go to Paris", []);
  });

  it("Cmd+Enter and Ctrl+Enter submit", async () => {
    // Each modifier+Enter combo must independently route to a submit. After a
    // submit the input is cleared and the component is briefly streaming, so we
    // let each send settle and re-type before exercising the next combo.
    render(<PlannerCard />);
    const ta = screen.getByPlaceholderText(PLACEHOLDER);

    fireEvent.change(ta, { target: { value: "go to Tokyo" } });
    await act(async () => {
      fireEvent.keyDown(ta, { key: "Enter", metaKey: true });
    });
    expect(streamMock).toHaveBeenCalledTimes(1);

    fireEvent.change(ta, { target: { value: "go to Kyoto" } });
    await act(async () => {
      fireEvent.keyDown(ta, { key: "Enter", ctrlKey: true });
    });
    expect(streamMock).toHaveBeenCalledTimes(2);
  });

  it("example pills hide after a message exists", async () => {
    render(<PlannerCard />);
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: "go to Lisbon" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Send/ }));
    });
    expect(
      screen.queryByRole("button", { name: /Weekend in Lisbon/i })
    ).toBeNull();
  });

  it("send button stays disabled when API is unavailable", () => {
    apiAvailable = false;
    render(<PlannerCard />);
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: "go to Rome" },
    });
    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
  });

  it("applies transparent section classes when prop set", () => {
    const { container } = render(<PlannerCard transparent />);
    const section = container.querySelector("section");
    expect(section).toHaveClass("bg-transparent");
    expect(section).toHaveClass("py-12");
  });
});
