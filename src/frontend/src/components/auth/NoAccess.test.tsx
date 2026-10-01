import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/context/AuthContext";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/test/render";
import { NoAccess } from "./NoAccess";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));

const logout = vi.fn();
const refreshAccess = vi.fn();

describe("NoAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "1", email: "grace@example.com", name: "Grace" },
      isAuthenticated: true,
      isAdmin: false,
      access: "denied",
      refreshAccess,
      isLoading: false,
      provider: "google",
      login: vi.fn(),
      loginWithRedirect: vi.fn(),
      completeLogin: vi.fn(),
      logout,
    });
  });

  it("names the account and says what to do", () => {
    renderWithProviders(<NoAccess />);

    const card = screen.getByTestId("no-access");
    expect(screen.getByRole("heading", { level: 1, name: "You're not on the list yet" })).toBeInTheDocument();
    expect(card).toHaveTextContent("grace@example.com hasn't been invited yet");
    expect(card).toHaveTextContent("Ask the team to add this email");
  });

  it("moves the focus to its heading: the page that was asked for never came", () => {
    renderWithProviders(<NoAccess />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(heading).toHaveFocus();
  });

  it("asks again on request, is busy meanwhile, and says so when the answer is still no", async () => {
    let answer!: () => void;
    refreshAccess.mockReturnValue(new Promise<void>((resolve) => (answer = resolve)));
    renderWithProviders(<NoAccess />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    expect(refreshAccess).toHaveBeenCalledTimes(1);
    const busy = screen.getByRole("button", { name: "Checking…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");

    answer();

    await waitFor(() => expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("grace@example.com still isn't on the list.");
  });

  it("signs out and goes home", () => {
    renderWithProviders(<NoAccess />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/");
  });
});
