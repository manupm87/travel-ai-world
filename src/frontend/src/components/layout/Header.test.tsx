import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import Header from "./Header";
import { useAuth } from "@/context/AuthContext";
import en from "@/i18n/en";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@react-oauth/google", () => ({
  GoogleLogin: () => <div data-testid="google-login" />,
}));

const logout = vi.fn();

const signedOut = () =>
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: false,
    user: null,
    logout,
    login: vi.fn(),
    isLoading: false,
    provider: "google" as const,
    loginWithRedirect: vi.fn(),
    completeLogin: vi.fn(),
  });

const signedIn = () =>
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: true,
    user: { id: "1", name: "Ada Lovelace", email: "ada@example.com" },
    logout,
    login: vi.fn(),
    isLoading: false,
    provider: "google" as const,
    loginWithRedirect: vi.fn(),
    completeLogin: vi.fn(),
  });

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollY = 0;
    document.documentElement.lang = "en";
    signedOut();
  });

  it("links the brand home", () => {
    renderWithProviders(<Header />);
    expect(screen.getByRole("link", { name: /Kyrian World/ })).toHaveAttribute("href", "/");
  });

  it("carries no links but the wordmark: the landing is one field", () => {
    renderWithProviders(<Header variant="landing" />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("carries theme and language on the signed-in shell, which has no footer", () => {
    // The marketing pages put both controls in the footer; `(app)` routes have
    // none, so the bar is the only place a desktop reader can reach them.
    const { unmount } = renderWithProviders(<Header variant="landing" />);
    expect(screen.queryByRole("button", { name: en.theme.toggle })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<Header variant="app" />);
    expect(screen.getByRole("button", { name: en.theme.toggle })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.nav.selectLanguage })).toBeInTheDocument();
  });

  it("offers to sign in when signed out and opens the planner when signed in", () => {
    const { unmount } = renderWithProviders(<Header />);
    expect(screen.getByRole("button", { name: en.auth.login })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: en.nav.openPlanner })
    ).not.toBeInTheDocument();
    unmount();

    signedIn();
    renderWithProviders(<Header />);
    // `next/link` normalises the trailing slash the static export adds back.
    expect(
      screen.getByRole("link", { name: en.nav.openPlanner }).getAttribute("href")
    ).toMatch(/^\/plan\/?$/);
    expect(screen.queryByRole("button", { name: en.auth.login })).not.toBeInTheDocument();
  });

  it("reaches the trips from the account menu", () => {
    signedIn();
    renderWithProviders(<Header />);

    fireEvent.click(screen.getByRole("button", { name: en.nav.userMenu }));
    const menu = screen.getByRole("menu", { name: en.nav.userMenu });
    expect(within(menu).getByRole("menuitem", { name: en.nav.trips })).toHaveAttribute(
      "href",
      "/plan"
    );
  });

  it("opens the login modal from the login button", () => {
    renderWithProviders(<Header />);
    fireEvent.click(screen.getByRole("button", { name: en.auth.login }));
    expect(screen.getByRole("heading", { name: en.auth.title })).toBeInTheDocument();
  });

  it("marks itself as scrolled once the window scrolls", () => {
    renderWithProviders(<Header />);
    const header = screen.getByRole("banner");
    expect(header).toHaveAttribute("data-scrolled", "false");

    window.scrollY = 100;
    fireEvent.scroll(window);
    expect(header).toHaveAttribute("data-scrolled", "true");
  });

  it("keeps the mobile drawer out of the accessibility tree until opened", () => {
    renderWithProviders(<Header />);
    const hamburger = screen.getByRole("button", { name: en.nav.openMenu });
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(hamburger);
    const drawer = screen.getByRole("dialog", { name: en.nav.menu });
    expect(hamburger).toHaveAttribute("aria-expanded", "true");
    expect(within(drawer).getByRole("group", { name: en.nav.selectLanguage })).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: en.nav.closeMenu }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("logs out from the user menu and navigates home", () => {
    signedIn();
    renderWithProviders(<Header />);

    fireEvent.click(screen.getByRole("button", { name: en.nav.userMenu }));
    const menu = screen.getByRole("menu", { name: en.nav.userMenu });
    expect(menu).toHaveTextContent("ada@example.com");
    fireEvent.click(within(menu).getByRole("menuitem", { name: en.auth.logout }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
