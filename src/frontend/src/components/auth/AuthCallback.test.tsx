import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import { AuthCallback } from "./AuthCallback";
import { useAuth } from "@/context/AuthContext";
import en from "@/i18n/en";

const mockReplace = vi.fn();
const searchParams = new URLSearchParams({ code: "c", state: "s" });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const completeLogin = vi.fn();

describe("AuthCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      completeLogin,
      login: vi.fn(),
      loginWithRedirect: vi.fn(),
      logout: vi.fn(),
      provider: "cognito",
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it("completes the login once and continues to the requested page", async () => {
    completeLogin.mockResolvedValue("/trip/japan");
    renderWithProviders(<AuthCallback />);

    expect(screen.getByText(en.auth.completingSignIn)).toBeInTheDocument();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/trip/japan"));
    expect(completeLogin).toHaveBeenCalledTimes(1);
    expect(completeLogin).toHaveBeenCalledWith(searchParams);
  });

  it("falls back to the planner when no redirect was requested", async () => {
    completeLogin.mockResolvedValue(null);
    renderWithProviders(<AuthCallback />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/plan/"));
  });

  it("shows an error and a way home when the exchange fails", async () => {
    completeLogin.mockRejectedValue(new Error("state mismatch"));
    renderWithProviders(<AuthCallback />);

    expect(await screen.findByRole("alert")).toHaveTextContent(en.auth.callbackError);
    expect(screen.getByRole("link", { name: en.auth.backHome })).toHaveAttribute("href", "/");
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
