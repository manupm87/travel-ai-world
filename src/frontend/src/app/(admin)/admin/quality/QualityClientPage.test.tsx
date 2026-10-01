import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/http";
import { runRetrievalEval, type RetrievalEval } from "@/services/admin";
import { RETRIEVAL_EVAL } from "@/test/fixtures/admin";
import { fireEvent, renderWithProviders, screen, waitFor, within } from "@/test/render";
import QualityClientPage from "./QualityClientPage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/services/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/admin")>()),
  runRetrievalEval: vi.fn(),
}));

const run = vi.mocked(runRetrievalEval);
const button = () => screen.getByRole("button", { name: /Run evaluation|Running…/ });

describe("QualityClientPage", () => {
  beforeEach(() => run.mockReset());

  it("runs nothing until the button is pressed", () => {
    renderWithProviders(<QualityClientPage />);

    expect(screen.getByRole("heading", { name: "Retrieval quality" })).toBeInTheDocument();
    expect(screen.getByText(/No run yet in this visit/)).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  it("shows the overall figures, the table and the misses of a run", async () => {
    run.mockResolvedValue(RETRIEVAL_EVAL);
    renderWithProviders(<QualityClientPage />);

    fireEvent.click(button());

    const kpis = await screen.findByRole("list", { name: "Overall scores" });
    expect(within(kpis).getByText("0.726")).toBeInTheDocument();
    expect(within(kpis).getByText("0.656")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Scores by city and by language" });
    const names = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
    expect(names).toEqual(["All", "budapest", "madrid", "English", "Spanish"]);
    expect(screen.getByText("1 of 40 questions left an expected document out of the top results")).toBeInTheDocument();
    expect(screen.getByText(/planetario-de-madrid · not in the top 10/)).toBeInTheDocument();
    expect(screen.getByText(/museo-nacional-de-ciencias-naturales · #4/)).toBeInTheDocument();
    expect(screen.getByText("osm:node/13830250001")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Evaluation finished.");
  });

  it("keeps the button while a run goes and ignores a second press", async () => {
    let finish: (value: RetrievalEval) => void = () => {};
    run.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderWithProviders(<QualityClientPage />);

    fireEvent.click(button());
    expect(button()).toHaveTextContent("Running…");
    expect(button()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button());
    expect(run).toHaveBeenCalledTimes(1);

    finish(RETRIEVAL_EVAL);
    await waitFor(() => expect(button()).toHaveTextContent("Run evaluation"));
  });

  it("says a failed run and offers to try again", async () => {
    run.mockRejectedValueOnce(new ApiError(503, "Retrieval is off"));
    run.mockResolvedValueOnce(RETRIEVAL_EVAL);
    renderWithProviders(<QualityClientPage />);

    fireEvent.click(button());
    const alert = await screen.findByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("list", { name: "Overall scores" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
