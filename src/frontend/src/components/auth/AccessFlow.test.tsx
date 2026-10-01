import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtectedRoute from "./ProtectedRoute";
import { AuthProvider } from "@/context/AuthContext";
import { getMyAccess } from "@/services/access";
import { isApiAvailable } from "@/services/http";
import { writeSession } from "@/services/session";
import { getMe } from "@/services/users";
import { makeJwt, nowInSeconds } from "@/test/jwt";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/test/render";

/**
 * The denied flow end to end, with only the services mocked: the real
 * `AuthProvider` asks `/users/me/access`, the real `ProtectedRoute` swaps the
 * page for the real `NoAccess`. This is what covers the flow in CI's static
 * build, where `e2e/access.spec.ts` cannot (no core_api URL to ask).
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/dashboard/",
}));

vi.mock("@/services/access", () => ({ getMyAccess: vi.fn() }));
vi.mock("@/services/users", () => ({ getMe: vi.fn() }));
vi.mock("@/services/cognito", () => ({
  isCognitoAvailable: vi.fn(() => false),
  needsRefresh: vi.fn(() => false),
  refreshCognitoSession: vi.fn(),
  startCognitoLogin: vi.fn(),
  completeCognitoLogin: vi.fn(),
  logoutFromCognito: vi.fn(),
}));
vi.mock("@/services/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/http")>()),
  isApiAvailable: vi.fn(() => true),
}));

const user = { id: "123", email: "grace@example.com", name: "Grace" };
const token = makeJwt({ sub: "123", exp: nowInSeconds() + 3600 });

const renderPage = () =>
  renderWithProviders(
    <AuthProvider>
      <ProtectedRoute>
        <p>my trips</p>
      </ProtectedRoute>
    </AuthProvider>
  );

describe("a signed-in account and the access list (AuthProvider + ProtectedRoute + NoAccess)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(isApiAvailable).mockReturnValue(true);
    vi.mocked(getMe).mockResolvedValue(null);
    writeSession(token, user);
  });

  it("an uninvited account gets the no-access page instead of its page", async () => {
    vi.mocked(getMyAccess).mockResolvedValue({ allowed: false, daily_token_limit: 300000 });

    renderPage();

    const card = await screen.findByTestId("no-access");
    expect(card).toHaveTextContent("grace@example.com hasn't been invited yet");
    expect(screen.queryByText("my trips")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "You're not on the list yet" })).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it("checking again after being invited brings the page back", async () => {
    vi.mocked(getMyAccess).mockResolvedValue({ allowed: false, daily_token_limit: 300000 });
    renderPage();
    await screen.findByTestId("no-access");

    vi.mocked(getMyAccess).mockResolvedValue({ allowed: true, daily_token_limit: 300000 });
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    expect(await screen.findByText("my trips")).toBeInTheDocument();
    expect(screen.queryByTestId("no-access")).not.toBeInTheDocument();
    expect(getMyAccess).toHaveBeenCalledTimes(2);
  });

  it("checking again while still uninvited stays, and says so", async () => {
    vi.mocked(getMyAccess).mockResolvedValue({ allowed: false, daily_token_limit: 300000 });
    renderPage();
    await screen.findByTestId("no-access");

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("grace@example.com still isn't on the list.")
    );
    expect(screen.queryByText("my trips")).not.toBeInTheDocument();
  });

  it("signing out leaves the no-access page and goes home", async () => {
    vi.mocked(getMyAccess).mockResolvedValue({ allowed: false, daily_token_limit: 300000 });
    renderPage();
    const card = await screen.findByTestId("no-access");

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(card).not.toBeInTheDocument());
    expect(localStorage.getItem("travel_ai_token")).toBeNull();
    expect(push).toHaveBeenCalledWith("/");
  });

  it.each([
    ["invited", () => vi.mocked(getMyAccess).mockResolvedValue({ allowed: true, daily_token_limit: null })],
    ["unanswered (a failed read)", () => vi.mocked(getMyAccess).mockRejectedValue(new Error("offline"))],
  ])("an account that is %s gets its page", async (_name, arrange) => {
    arrange();

    renderPage();

    expect(await screen.findByText("my trips")).toBeInTheDocument();
    await waitFor(() => expect(getMyAccess).toHaveBeenCalled());
    expect(screen.queryByTestId("no-access")).not.toBeInTheDocument();
  });
});
