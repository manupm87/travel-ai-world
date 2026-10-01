import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/context/AuthContext";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
import { NoAccess } from "./NoAccess";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));

const logout = vi.fn();

describe("NoAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "1", email: "grace@example.com", name: "Grace" },
      isAuthenticated: true,
      isAdmin: false,
      access: "denied",
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

  it("signs out and goes home", () => {
    renderWithProviders(<NoAccess />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/");
  });
});
