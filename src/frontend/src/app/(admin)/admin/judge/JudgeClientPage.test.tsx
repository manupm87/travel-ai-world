import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAnswerEvals, streamAnswerEval, type AnswerEvalEvent } from "@/services/admin";
import { ApiError } from "@/services/http";
import { EVAL_ITEM, EVAL_RUN_ANSWERS, EVAL_RUN_GOLDEN } from "@/test/fixtures/admin";
import { fireEvent, renderWithProviders, screen, waitFor, within } from "@/test/render";
import JudgeClientPage from "./JudgeClientPage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/services/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/admin")>()),
  listAnswerEvals: vi.fn(),
  streamAnswerEval: vi.fn(),
}));

const list = vi.mocked(listAnswerEvals);
const stream = vi.mocked(streamAnswerEval);

/** A stream that yields `events` and ends. */
function events(...items: AnswerEvalEvent[]) {
  return (async function* () {
    for (const item of items) yield item;
  })();
}

const golden = () => screen.getByRole("button", { name: /Check the judge|Running…/ });

describe("JudgeClientPage", () => {
  beforeEach(() => {
    list.mockReset();
    stream.mockReset();
    list.mockResolvedValue({ items: [EVAL_RUN_ANSWERS] });
  });

  it("lists the stored runs and starts none on its own", async () => {
    renderWithProviders(<JudgeClientPage />);

    expect(screen.getByRole("heading", { name: "LLM judge" })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Evaluation runs, newest first" });
    expect(within(table).getByText("groundedness 4.72, relevance 4.98")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: /Sun|Sat|Mon|2026/ })).toHaveAttribute(
      "href",
      "/admin/judge/run?id=run-answers"
    );
    const answers = screen.getByRole("article", { name: "Grade Kiri's answers" });
    expect(within(answers).getByText("answer_eval")).toBeInTheDocument();
    expect(within(answers).getByText("Last run: groundedness 4.72, relevance 4.98")).toBeInTheDocument();
    const golden = screen.getByRole("article", { name: "Check the judge" });
    expect(within(golden).getByText("judge_validation")).toBeInTheDocument();
    expect(within(golden).getByText("Not run yet")).toBeInTheDocument();
    expect(within(table).getByText("answer_eval")).toBeInTheDocument();
    expect(stream).not.toHaveBeenCalled();
  });

  it("follows a judge check live, then shows its agreement and reloads the history", async () => {
    stream.mockReturnValue(
      events(
        { type: "progress", done: 1, total: 2, item: EVAL_ITEM },
        { type: "report", run: EVAL_RUN_GOLDEN }
      )
    );
    renderWithProviders(<JudgeClientPage />);
    await screen.findByRole("table", { name: "Evaluation runs, newest first" });

    fireEvent.click(golden());

    const kpis = await screen.findByRole("list", { name: "Overall scores" });
    expect(stream).toHaveBeenCalledWith("golden", expect.anything());
    expect(within(kpis).getByText("0.67")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Agreement by score" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Groundedness: expected score in rows/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open run" })).toHaveAttribute(
      "href",
      "/admin/judge/run?id=run-golden"
    );
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status")).toHaveTextContent("Run ended: Done.");
  });

  it("ignores a second press while a run goes", async () => {
    stream.mockReturnValue(
      (async function* () {
        yield { type: "progress", done: 1, total: 2, item: EVAL_ITEM } as AnswerEvalEvent;
        await new Promise(() => {});
      })()
    );
    renderWithProviders(<JudgeClientPage />);

    fireEvent.click(golden());
    const progress = await screen.findByRole("progressbar", { name: "Run progress" });
    expect(progress).toHaveAttribute("aria-valuenow", "1");
    expect(progress).toHaveAttribute("aria-valuetext", "1 of 2 graded");
    expect(screen.getByRole("heading", { name: "Checking the judge" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Graded so far/ })).toHaveTextContent("vizcaya museum tickets price");
    expect(screen.getByText(/Keep this page open until the run ends/)).toBeInTheDocument();
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const link = (await screen.findAllByRole("link"))[0]!;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("leaving this page stops it"));
    expect(click.defaultPrevented).toBe(true);
    confirm.mockRestore();
    expect(golden()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(golden());
    fireEvent.click(screen.getByRole("button", { name: "Grade the answers" }));

    expect(stream).toHaveBeenCalledTimes(1);
  });

  it("says so when another run is in progress", async () => {
    stream.mockImplementation(() => {
      throw new ApiError(409, "An evaluation is already running", "CONFLICT");
    });
    renderWithProviders(<JudgeClientPage />);

    fireEvent.click(golden());

    expect(await screen.findByRole("alert")).toHaveTextContent("Another run is in progress");
  });

  it("shows why a run stopped mid-stream", async () => {
    stream.mockReturnValue(events({ type: "error", error: "Bedrock unavailable", error_code: "SERVICE_UNAVAILABLE" }));
    renderWithProviders(<JudgeClientPage />);

    fireEvent.click(golden());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The run stopped before the end: Bedrock unavailable"
    );
  });

  it("says so when the stream ends with neither a report nor an error", async () => {
    stream.mockReturnValue(events({ type: "progress", done: 1, total: 2, item: EVAL_ITEM }));
    renderWithProviders(<JudgeClientPage />);

    fireEvent.click(golden());

    expect(await screen.findByRole("alert")).toHaveTextContent("The connection closed before the run ended");
  });
});
