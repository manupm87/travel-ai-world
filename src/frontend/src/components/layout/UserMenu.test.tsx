import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
import { UserMenu } from "./UserMenu";
import { useAuth } from "@/context/AuthContext";
import en from "@/i18n/en";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const logout = vi.fn();
const onLogin = vi.fn();

const setAuth = (authenticated: boolean) =>
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: authenticated,
    user: authenticated
      ? { id: "1", name: "Ada Lovelace", email: "ada@example.com", picture: "https://example.com/a.png" }
      : null,
    logout,
    login: vi.fn(),
    isLoading: false,
    provider: "google" as const,
    loginWithRedirect: vi.fn(),
    completeLogin: vi.fn(),
    isAdmin: false,
  });

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers to log in when signed out", () => {
    setAuth(false);
    renderWithProviders(<UserMenu onLogin={onLogin} />);
    fireEvent.click(screen.getByRole("button", { name: en.auth.login }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it("sends \"Your trips\" to the signed-in home", () => {
    setAuth(true);
    renderWithProviders(<UserMenu onLogin={onLogin} />);
    fireEvent.click(screen.getByRole("button", { name: en.nav.userMenu }));
    expect(screen.getByRole("menuitem", { name: en.nav.trips })).toHaveAttribute(
      "href",
      "/dashboard"
    );
  });

  it("toggles the dropdown with the right ARIA state and closes on outside click", () => {
    setAuth(true);
    renderWithProviders(<UserMenu onLogin={onLogin} />);
    const trigger = screen.getByRole("button", { name: en.nav.userMenu });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: en.auth.logout })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
