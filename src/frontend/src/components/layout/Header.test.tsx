import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import Header from "./Header";
import { useAuth } from "@/context/AuthContext";
import en from "@/i18n/en";

const mockPush = vi.fn();
/** The path the header thinks it is on; each test sets it before rendering. */
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

// The phone menu shows Kiri's suitcase, which reads the account's trips.
vi.mock("@/hooks/useTrips", () => ({
  useTrips: () => ({
    trips: [
      { id: "a", title: "A", city: "Budapest", countryCode: "HU", startDate: "2026-10-12", endDate: "2026-10-15", phase: "upcoming", imageUrl: "" },
      { id: "b", title: "B", city: "Bologna", countryCode: "IT", startDate: "2026-10-16", endDate: "2026-10-19", phase: "upcoming", imageUrl: "" },
    ],
    status: "ready",
    error: null,
    reload: vi.fn(),
    remove: vi.fn(),
    rename: vi.fn(),
  }),
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
    isAdmin: false,
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
    isAdmin: false,
  });

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollY = 0;
    pathname = "/";
    document.documentElement.lang = "en";
    signedOut();
  });

  it("links the brand home", () => {
    renderWithProviders(<Header />);
    expect(screen.getByRole("link", { name: /Kyrian World/ })).toHaveAttribute("href", "/");
  });

  it("carries no links but the wordmark: the landing is one field", () => {
    renderWithProviders(<Header />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("carries the reader's own controls, language and theme, on every page", () => {
    renderWithProviders(<Header />);
    expect(screen.getByRole("button", { name: en.theme.toggle })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.nav.selectLanguage })).toBeInTheDocument();
  });

  it("puts the places, the language, the theme and the account in the phone menu", () => {
    signedIn();
    renderWithProviders(<Header />);
    fireEvent.click(screen.getByRole("button", { name: en.nav.openMenu }));
    const drawer = screen.getByRole("dialog", { name: en.nav.menu });

    expect(within(drawer).getByRole("link", { name: en.nav.trips }).getAttribute("href")).toMatch(/^\/dashboard\/?$/);
    expect(within(drawer).getByRole("link", { name: en.nav.planTrip }).getAttribute("href")).toMatch(/^\/plan\/?$/);
    expect(within(drawer).getByRole("group", { name: en.theme.label })).toBeInTheDocument();
    expect(within(drawer).getByText("2 trips, 2 stickers")).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: en.theme.system }));
    expect(within(drawer).getByRole("button", { name: en.theme.system })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(drawer).getByRole("button", { name: en.auth.logout }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("signs in from the phone menu when signed out", () => {
    renderWithProviders(<Header />);
    fireEvent.click(screen.getByRole("button", { name: en.nav.openMenu }));
    const drawer = screen.getByRole("dialog", { name: en.nav.menu });
    fireEvent.click(within(drawer).getByRole("button", { name: en.auth.login }));
    expect(screen.getByRole("heading", { name: en.auth.title })).toBeInTheDocument();
  });

  it("offers to sign in when signed out and the trips when signed in", () => {
    const { unmount } = renderWithProviders(<Header />);
    expect(screen.getByRole("button", { name: en.auth.login })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: en.nav.trips })).not.toBeInTheDocument();
    unmount();

    signedIn();
    renderWithProviders(<Header />);
    // `next/link` normalises the trailing slash the static export adds back.
    expect(
      screen.getByRole("link", { name: en.nav.trips }).getAttribute("href")
    ).toMatch(/^\/dashboard\/?$/);
    expect(screen.queryByRole("button", { name: en.auth.login })).not.toBeInTheDocument();
  });

  it("makes the pill the other place: the planner from the home, the trips elsewhere", () => {
    signedIn();

    pathname = "/dashboard";
    const { unmount } = renderWithProviders(<Header />);
    const toPlanner = screen.getByRole("link", { name: en.nav.openPlanner });
    expect(toPlanner.getAttribute("href")).toMatch(/^\/plan\/?$/);
    expect(toPlanner).toHaveTextContent(en.nav.plannerShort);
    expect(screen.queryByRole("link", { name: en.nav.trips })).not.toBeInTheDocument();
    unmount();

    // The planner is where it matters most: it lists no trips of its own.
    pathname = "/plan";
    renderWithProviders(<Header />);
    const toTrips = screen.getByRole("link", { name: en.nav.trips });
    expect(toTrips.getAttribute("href")).toMatch(/^\/dashboard\/?$/);
    expect(toTrips).toHaveTextContent(en.nav.tripsShort);
    expect(screen.queryByRole("link", { name: en.nav.openPlanner })).not.toBeInTheDocument();
  });

  it("shows the Admin link to administrators only, in the bar and in the drawer", () => {
    signedIn();
    const { unmount } = renderWithProviders(<Header />);
    expect(screen.queryByRole("link", { name: en.nav.admin })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.nav.openMenu }));
    expect(
      within(screen.getByRole("dialog", { name: en.nav.menu })).queryByRole("link", { name: en.nav.admin })
    ).not.toBeInTheDocument();
    unmount();

    vi.mocked(useAuth).mockReturnValue({ ...vi.mocked(useAuth)(), isAdmin: true });
    renderWithProviders(<Header />);
    expect(screen.getByRole("link", { name: en.nav.admin }).getAttribute("href")).toMatch(/^\/admin\/?$/);
    fireEvent.click(screen.getByRole("button", { name: en.nav.openMenu }));
    expect(
      within(screen.getByRole("dialog", { name: en.nav.menu })).getByRole("link", { name: en.nav.admin })
    ).toBeInTheDocument();
  });

  it("reaches the trips from the account menu", () => {
    signedIn();
    renderWithProviders(<Header />);

    fireEvent.click(screen.getByRole("button", { name: en.nav.userMenu }));
    const menu = screen.getByRole("menu", { name: en.nav.userMenu });
    expect(within(menu).getByRole("menuitem", { name: en.nav.trips })).toHaveAttribute(
      "href",
      "/dashboard"
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
