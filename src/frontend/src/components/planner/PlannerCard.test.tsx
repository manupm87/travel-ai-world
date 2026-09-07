import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, renderWithProviders, screen } from "@/test/render";
import PlannerCard from "./PlannerCard";
import { UnauthorizedError } from "@/services/http";
import en from "@/i18n/en";

let apiAvailable = true;
const streamMock = vi.fn();

vi.mock("@/services/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/http")>();
  return { ...actual, isAiAvailable: () => apiAvailable };
});

vi.mock("@/services/chat", () => ({
  streamChat: (...args: unknown[]) => streamMock(...args),
}));

// jsdom has no layout: give the message list a fixed geometry so the
// stick-to-bottom logic can be exercised (scrollHeight > clientHeight).
const LIST_SCROLL_HEIGHT = 500;
const LIST_CLIENT_HEIGHT = 100;

const p = en.planner;
const PLACEHOLDER = p.placeholder;
const firstExample = p.examples[0]!;

beforeEach(() => {
  apiAvailable = true;
  streamMock.mockReset();
  streamMock.mockImplementation(async function* () {
    yield "Hello back!";
  });
  // Deterministic frame scheduling; `scrollIntoView` is deliberately left
  // undefined (jsdom default) so any call to it would surface as an error.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  window.scrollTo = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => LIST_SCROLL_HEIGHT,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => LIST_CLIENT_HEIGHT,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Restore jsdom's own getters (delete the own props we defined).
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
});

const flushFrames = () => act(() => new Promise((r) => setTimeout(r, 0)));

const textarea = () => screen.getByPlaceholderText(PLACEHOLDER);
const sendButton = () => screen.getByRole("button", { name: p.send });

async function sendMessage(text: string) {
  fireEvent.change(textarea(), { target: { value: text } });
  await act(async () => {
    fireEvent.click(sendButton());
  });
}

describe("PlannerCard", () => {
  it("renders eyebrow label, headline, placeholder and keyboard hint from i18n", () => {
    renderWithProviders(<PlannerCard />);
    expect(screen.getByText(p.label)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: p.title })).toBeInTheDocument();
    expect(textarea()).toBeInTheDocument();
    expect(screen.getByText(p.sendHint)).toBeInTheDocument();
  });

  it("renders every example pill", () => {
    renderWithProviders(<PlannerCard />);
    for (const example of p.examples) {
      expect(screen.getByRole("button", { name: new RegExp(example.label) })).toBeInTheDocument();
    }
  });

  it("clicking a pill pre-fills the textarea and does not submit", () => {
    renderWithProviders(<PlannerCard />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(firstExample.label) }));
    expect(textarea()).toHaveValue(firstExample.prompt);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("send button is disabled when input is empty or whitespace", () => {
    renderWithProviders(<PlannerCard />);
    expect(sendButton()).toBeDisabled();
    fireEvent.change(textarea(), { target: { value: "   " } });
    expect(sendButton()).toBeDisabled();
  });

  it("Enter submits, Shift+Enter does not", () => {
    renderWithProviders(<PlannerCard />);
    fireEvent.change(textarea(), { target: { value: "go to Paris" } });
    fireEvent.keyDown(textarea(), { key: "Enter", shiftKey: true });
    expect(streamMock).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea(), { key: "Enter" });
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(streamMock).toHaveBeenCalledWith(
      "go to Paris",
      [],
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("Cmd+Enter and Ctrl+Enter submit", async () => {
    renderWithProviders(<PlannerCard />);

    fireEvent.change(textarea(), { target: { value: "go to Tokyo" } });
    await act(async () => {
      fireEvent.keyDown(textarea(), { key: "Enter", metaKey: true });
    });
    expect(streamMock).toHaveBeenCalledTimes(1);

    fireEvent.change(textarea(), { target: { value: "go to Kyoto" } });
    await act(async () => {
      fireEvent.keyDown(textarea(), { key: "Enter", ctrlKey: true });
    });
    expect(streamMock).toHaveBeenCalledTimes(2);
  });

  it("example pills hide after a message exists", async () => {
    renderWithProviders(<PlannerCard />);
    await sendMessage("go to Lisbon");
    expect(screen.queryByRole("button", { name: new RegExp(firstExample.label) })).toBeNull();
  });

  it("explains that the AI is unavailable and keeps send disabled without an API", () => {
    apiAvailable = false;
    renderWithProviders(<PlannerCard />);
    expect(screen.getByRole("status")).toHaveTextContent(p.unavailable);
    fireEvent.change(textarea(), { target: { value: "go to Rome" } });
    expect(sendButton()).toBeDisabled();
  });

  it("shows the session message when the backend rejects the token", async () => {
    streamMock.mockImplementation(async function* () {
      throw new UnauthorizedError();
      yield "";
    });

    renderWithProviders(<PlannerCard />);
    await sendMessage("go to Oslo");

    expect(screen.getByRole("alert")).toHaveTextContent(p.errorUnauthorized);
    expect(screen.queryByText(p.errorFallback)).toBeNull();
  });

  it("shows the generic message for any other failure", async () => {
    streamMock.mockImplementation(async function* () {
      throw new Error("boom");
      yield "";
    });

    renderWithProviders(<PlannerCard />);
    await sendMessage("go to Oslo");

    expect(screen.getByRole("alert")).toHaveTextContent(p.errorFallback);
  });

  it("does not replay a failed (empty) answer as history", async () => {
    streamMock.mockImplementationOnce(async function* () {
      throw new Error("boom");
      yield "";
    });

    renderWithProviders(<PlannerCard />);
    await sendMessage("first");
    await sendMessage("second");

    const secondCall = streamMock.mock.calls[1] as [string, unknown[]];
    expect(secondCall[0]).toBe("second");
    expect(secondCall[1]).toEqual([{ role: "user", content: "first" }]);
  });

  it("streams chunks in order and scrolls only the message list, never the page", async () => {
    streamMock.mockImplementation(async function* () {
      yield "Hello";
      yield " ";
      yield "world";
    });

    renderWithProviders(<PlannerCard />);
    await sendMessage("go to Lisbon");
    await flushFrames();

    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(screen.getByRole("log").scrollTop).toBe(LIST_SCROLL_HEIGHT);
  });

  it("stops following the stream once the user scrolls up", async () => {
    let releaseSecondChunk: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseSecondChunk = resolve;
    });
    streamMock.mockImplementation(async function* () {
      yield "part one";
      await gate;
      yield " part two";
    });

    renderWithProviders(<PlannerCard />);
    await sendMessage("go to Lisbon");
    await flushFrames();

    const list = screen.getByRole("log");
    expect(list.scrollTop).toBe(LIST_SCROLL_HEIGHT);

    // The user scrolls back up to read something while the answer streams.
    list.scrollTop = 0;
    fireEvent.scroll(list);

    await act(async () => {
      releaseSecondChunk();
    });
    await flushFrames();

    expect(screen.getByText("part one part two")).toBeInTheDocument();
    expect(list.scrollTop).toBe(0);
  });

  it("re-pins the list to the bottom when a new message is sent", async () => {
    renderWithProviders(<PlannerCard />);
    await sendMessage("first");
    await flushFrames();

    const list = screen.getByRole("log");
    list.scrollTop = 0;
    fireEvent.scroll(list);

    await sendMessage("second");
    await flushFrames();

    expect(list.scrollTop).toBe(LIST_SCROLL_HEIGHT);
  });

  it("aborts an in-flight stream when unmounted", async () => {
    let signal: AbortSignal | undefined;
    streamMock.mockImplementation(async function* (
      _message: string,
      _history: unknown[],
      options: { signal: AbortSignal }
    ) {
      signal = options.signal;
      yield "started";
      await new Promise<void>((resolve) => signal!.addEventListener("abort", () => resolve()));
    });

    const { unmount } = renderWithProviders(<PlannerCard />);
    await sendMessage("go to Lisbon");
    await flushFrames();
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("applies transparent section classes when prop set", () => {
    const { container } = renderWithProviders(<PlannerCard transparent />);
    const section = container.querySelector("section");
    expect(section).toHaveClass("bg-transparent");
    expect(section).toHaveClass("py-12");
  });
});
