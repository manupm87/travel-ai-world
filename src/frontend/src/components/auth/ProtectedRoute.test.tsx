import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import ProtectedRoute from "./ProtectedRoute";
import { useAuth, type AccessState } from "@/context/AuthContext";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/trip/japan",
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("./NoAccess", () => ({
  NoAccess: () => <div data-testid="no-access">not invited</div>,
}));

vi.mock("@/components/common/LoadingSpinner", () => ({
  default: () => <div role="status">spinner</div>,
}));

const auth = (state: { isAuthenticated: boolean; isLoading: boolean; access?: AccessState }) =>
  vi.mocked(useAuth).mockReturnValue({
    access: "unknown" as const,
    refreshAccess: vi.fn(),
    ...state,
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    provider: "google" as const,
    loginWithRedirect: vi.fn(),
    completeLogin: vi.fn(),
    isAdmin: false,
  });

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a spinner and does not redirect while the session is unknown", () => {
    auth({ isAuthenticated: false, isLoading: true });
    render(
      <ProtectedRoute>
        <p>secret</p>
      </ProtectedRoute>
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("redirects home with the current path when signed out", () => {
    auth({ isAuthenticated: false, isLoading: false });
    const { container } = render(
      <ProtectedRoute>
        <p>secret</p>
      </ProtectedRoute>
    );

    expect(container).toBeEmptyDOMElement();
    expect(mockPush).toHaveBeenCalledWith("/?redirect=%2Ftrip%2Fjapan");
  });

  it("keeps the query string in the redirect (the trip viewer's id lives there)", () => {
    auth({ isAuthenticated: false, isLoading: false });
    window.history.replaceState(null, "", "/trip/?id=abc");
    try {
      render(
        <ProtectedRoute>
          <p>secret</p>
        </ProtectedRoute>
      );
      expect(mockPush).toHaveBeenCalledWith("/?redirect=%2Ftrip%2Fjapan%3Fid%3Dabc");
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it.each(["unknown", "allowed"] as const)("renders children when the access is %s", (access) => {
    auth({ isAuthenticated: true, isLoading: false, access });
    render(
      <ProtectedRoute>
        <p>secret</p>
      </ProtectedRoute>
    );

    expect(screen.getByText("secret")).toBeInTheDocument();
    expect(screen.queryByTestId("no-access")).not.toBeInTheDocument();
  });

  it("shows the no-access page instead of the children when the account is not invited", () => {
    auth({ isAuthenticated: true, isLoading: false, access: "denied" });
    render(
      <ProtectedRoute>
        <p>secret</p>
      </ProtectedRoute>
    );

    expect(screen.getByTestId("no-access")).toBeInTheDocument();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor home even if a stale answer said denied", () => {
    auth({ isAuthenticated: false, isLoading: false, access: "denied" });
    const { container } = render(
      <ProtectedRoute>
        <p>secret</p>
      </ProtectedRoute>
    );

    expect(container).toBeEmptyDOMElement();
    expect(mockPush).toHaveBeenCalled();
  });

  it("renders children when signed in", () => {
    auth({ isAuthenticated: true, isLoading: false });
    render(
      <ProtectedRoute>
        <p>secret</p>
      </ProtectedRoute>
    );

    expect(screen.getByText("secret")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
