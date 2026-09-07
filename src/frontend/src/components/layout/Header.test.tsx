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
  });

const signedIn = () =>
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: true,
    user: { id: "1", name: "Ada Lovelace", email: "ada@example.com" },
    logout,
    login: vi.fn(),
    isLoading: false,
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
    expect(screen.getByRole("link", { name: /Travel AI World/ })).toHaveAttribute("href", "/");
  });

  it("shows the marketing links only on the landing variant", () => {
    const { unmount } = renderWithProviders(<Header variant="landing" />);
    expect(screen.getByRole("link", { name: en.nav.howItWorks })).toHaveAttribute("href", "#how-it-works");
    expect(screen.getByRole("link", { name: en.nav.features })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en.nav.reviews })).toBeInTheDocument();
    unmount();

    renderWithProviders(<Header variant="dashboard" />);
    expect(screen.queryByRole("link", { name: en.nav.howItWorks })).not.toBeInTheDocument();
  });

  it("points the CTA at the planner when signed out and at the dashboard when signed in", () => {
    const { unmount } = renderWithProviders(<Header />);
    for (const cta of screen.getAllByRole("link", { name: en.nav.planMyTrip })) {
      expect(cta).toHaveAttribute("href", "#planner");
    }
    unmount();

    signedIn();
    renderWithProviders(<Header />);
    for (const cta of screen.getAllByRole("link", { name: en.nav.dashboard })) {
      expect(cta).toHaveAttribute("href", "/dashboard");
    }
  });

  it("switches the language from the dropdown and closes it", () => {
    renderWithProviders(<Header />);
    const trigger = screen.getByRole("button", { name: en.nav.selectLanguage });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("🇬🇧");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: en.nav.selectLanguage });
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /Español/ }));

    expect(document.documentElement.lang).toBe("es");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seleccionar idioma" })).toHaveTextContent("🇪🇸");
  });

  it("closes the language dropdown on an outside click", () => {
    renderWithProviders(<Header />);
    fireEvent.click(screen.getByRole("button", { name: en.nav.selectLanguage }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the login modal from the login button", () => {
    renderWithProviders(<Header />);
    fireEvent.click(screen.getByRole("button", { name: en.auth.login }));
    expect(screen.getByRole("heading", { name: en.auth.welcomeBack })).toBeInTheDocument();
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
