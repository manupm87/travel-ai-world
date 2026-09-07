import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import ProtectedRoute from "./ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/trip/japan",
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/components/common/LoadingSpinner", () => ({
  default: () => <div role="status">spinner</div>,
}));

const auth = (state: { isAuthenticated: boolean; isLoading: boolean }) =>
  vi.mocked(useAuth).mockReturnValue({
    ...state,
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
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
