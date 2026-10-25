import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAnswerEval } from "@/services/admin";
import { EVAL_RUN_GOLDEN_DETAIL } from "@/test/fixtures/admin";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import RunClientPage from "./RunClientPage";

let search = new URLSearchParams("id=run-golden");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => search,
}));

vi.mock("@/services/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/admin")>()),
  getAnswerEval: vi.fn(),
}));

const get = vi.mocked(getAnswerEval);

describe("RunClientPage", () => {
  beforeEach(() => {
    get.mockReset();
    search = new URLSearchParams("id=run-golden");
  });

  it("shows the run's agreement and every case, expected against the judge", async () => {
    get.mockResolvedValue(EVAL_RUN_GOLDEN_DETAIL);
    renderWithProviders(<RunClientPage />);

    expect(await screen.findByRole("heading", { name: /Run of/ })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("run-golden", expect.anything());
    expect(screen.getByRole("heading", { name: "Every item (2)" })).toBeInTheDocument();
    const perturbed = document.querySelector('[data-item="miami/vizcaya~currency"]') as HTMLElement;
    expect(within(perturbed).getByText("Defect put in: wrong-currency")).toBeInTheDocument();
    expect(within(perturbed).getByText("groundedness 2, relevance 5")).toBeInTheDocument();
    expect(within(perturbed).getAllByText("groundedness 3, relevance 5").length).toBeGreaterThan(0);
  });

  it("narrows the list to the answers with a problem", async () => {
    get.mockResolvedValue(EVAL_RUN_GOLDEN_DETAIL);
    renderWithProviders(<RunClientPage />);
    await screen.findByRole("heading", { name: "Every item (2)" });

    fireEvent.click(screen.getByRole("checkbox", { name: "Only answers with a problem" }));

    expect(screen.getByRole("heading", { name: "Every item (1)" })).toBeInTheDocument();
  });

  it("says a run that is gone is gone", async () => {
    get.mockResolvedValue(null);
    renderWithProviders(<RunClientPage />);

    expect(await screen.findByText(/There is no run with this id/)).toBeInTheDocument();
  });
});
