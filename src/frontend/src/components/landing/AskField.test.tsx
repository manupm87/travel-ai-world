import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/test/render";
import { AskField, plannerHref } from "./AskField";
import { useAuth } from "@/context/AuthContext";
import en from "@/i18n/en";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));

vi.mock("@react-oauth/google", () => ({
  GoogleLogin: () => <div data-testid="google-login" />,
}));

const loginWithRedirect = vi.fn();

function session(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
    user: null,
    provider: "google" as const,
    login: vi.fn(),
    loginWithRedirect,
    completeLogin: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  });
}

const ASK = "Four days in Budapest, thermal baths & wine";
const field = () => screen.getByRole("textbox", { name: en.landing.headline });
const planIt = () => screen.getByRole("button", { name: en.landing.send });
const type = (value: string) => fireEvent.change(field(), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
  // The placeholder types itself; reduced motion pins it to the first example,
  // so these tests assert copy instead of racing a timer.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
  session();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AskField", () => {
  it("is one question, one field and one action", () => {
    renderWithProviders(<AskField />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      en.landing.headline
    );
    expect(field()).toHaveAttribute("placeholder", en.landing.examples[0]);
    expect(planIt()).toBeDisabled();
  });

  it("does nothing while the ask is empty", () => {
    renderWithProviders(<AskField />);

    type("   ");
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: en.auth.title })).toBeNull();
  });

  it("opens the planner with the ask once signed in", async () => {
    session({ isAuthenticated: true });
    renderWithProviders(<AskField />);

    type(ASK);
    fireEvent.click(planIt());

    expect(screen.getByRole("button", { name: en.landing.sending })).toBeDisabled();
    await waitFor(() => expect(push).toHaveBeenCalledWith(plannerHref(ASK)));
    expect(plannerHref(ASK)).toBe(
      "/plan/?q=Four%20days%20in%20Budapest%2C%20thermal%20baths%20%26%20wine"
    );
  });

  it("sends on Enter and breaks the line on Shift+Enter", async () => {
    session({ isAuthenticated: true });
    renderWithProviders(<AskField />);

    type(ASK);
    fireEvent.keyDown(field(), { key: "Enter", shiftKey: true });
    expect(push).not.toHaveBeenCalled();

    fireEvent.keyDown(field(), { key: "Enter" });
    await waitFor(() => expect(push).toHaveBeenCalledWith(plannerHref(ASK)));
  });

  it("asks a signed-out reader to sign in, and keeps the ask as the destination", async () => {
    session({ provider: "cognito" });
    renderWithProviders(<AskField />);

    type(ASK);
    fireEvent.click(planIt());

    expect(
      screen.getByRole("heading", { name: en.auth.title })
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: en.auth.continueWithGoogle }));
    await waitFor(() =>
      expect(loginWithRedirect).toHaveBeenCalledWith(plannerHref(ASK))
    );
  });

  it("opens the dialog at once when the route guard sent the reader here", () => {
    window.history.replaceState({}, "", "/?redirect=%2Ftrip%2F%3Fid%3D42");
    renderWithProviders(<AskField />);

    expect(
      screen.getByRole("heading", { name: en.auth.title })
    ).toBeInTheDocument();
  });

  it("leaves the dialog closed for a reader who is already signed in", () => {
    window.history.replaceState({}, "", "/?redirect=%2Fdashboard");
    session({ isAuthenticated: true });
    renderWithProviders(<AskField />);

    expect(screen.queryByRole("heading", { name: en.auth.title })).toBeNull();
  });
});
