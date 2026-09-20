import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { LoginModal } from "./LoginModal";
import { LanguageProvider } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import en from "@/i18n/en";

const mockPush = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

// The real button talks to Google; this stand-in lets a test press it.
vi.mock("@react-oauth/google", () => ({
  GoogleLogin: ({
    onSuccess,
    onError,
  }: {
    onSuccess: (r: { credential?: string }) => void;
    onError?: () => void;
  }) => (
    <>
      <button onClick={() => onSuccess({ credential: "google-credential" })}>
        google-success
      </button>
      <button onClick={() => onError?.()}>google-error</button>
    </>
  ),
}));

const login = vi.fn();
const loginWithRedirect = vi.fn();
const onClose = vi.fn();

function useCognito() {
  vi.mocked(useAuth).mockReturnValue({
    login,
    loginWithRedirect,
    completeLogin: vi.fn(),
    logout: vi.fn(),
    provider: "cognito",
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });
}

function renderModal(isOpen = true, redirect?: string | null) {
  return render(
    <LanguageProvider>
      <LoginModal isOpen={isOpen} onClose={onClose} redirect={redirect} />
    </LanguageProvider>
  );
}

describe("LoginModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    login.mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      login,
      loginWithRedirect,
      completeLogin: vi.fn(),
      logout: vi.fn(),
      provider: "google",
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it("renders nothing when closed", () => {
    renderModal(false);
    expect(screen.queryByText(en.auth.title)).not.toBeInTheDocument();
  });

  it("signs in, closes and goes to the dashboard by default", async () => {
    renderModal();
    fireEvent.click(screen.getByText("google-success"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(login).toHaveBeenCalledWith("google-credential");
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("honours a same-origin redirect parameter", async () => {
    searchParams = new URLSearchParams({ redirect: "/trip/japan" });
    renderModal();
    fireEvent.click(screen.getByText("google-success"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/trip/japan"));
  });

  it("ignores an external redirect parameter", async () => {
    searchParams = new URLSearchParams({ redirect: "//evil.example/steal" });
    renderModal();
    fireEvent.click(screen.getByText("google-success"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("prefers the redirect prop over a conflicting ?redirect=", async () => {
    searchParams = new URLSearchParams({ redirect: "/trip/japan" });
    renderModal(true, "/plan/?q=four%20days%20in%20Budapest");

    fireEvent.click(screen.getByText("google-success"));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/plan/?q=four%20days%20in%20Budapest")
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("falls back to ?redirect= when the redirect prop is not same-origin", async () => {
    searchParams = new URLSearchParams({ redirect: "/trip/japan" });
    renderModal(true, "https://evil.example/steal");

    fireEvent.click(screen.getByText("google-success"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/trip/japan"));
  });

  it("in Cognito mode hands the redirect prop to the managed login", async () => {
    useCognito();
    loginWithRedirect.mockResolvedValue(undefined);
    searchParams = new URLSearchParams({ redirect: "/trip/japan" });
    renderModal(true, "/plan/?q=a%20weekend%20in%20Bologna");

    fireEvent.click(screen.getByRole("button", { name: en.auth.continueWithGoogle }));

    await waitFor(() =>
      expect(loginWithRedirect).toHaveBeenCalledWith("/plan/?q=a%20weekend%20in%20Bologna")
    );
  });

  it("shows the login error and stays open when sign-in fails", async () => {
    login.mockRejectedValue(new Error("invalid"));
    renderModal();
    fireEvent.click(screen.getByText("google-success"));

    expect(await screen.findByRole("alert")).toHaveTextContent(en.auth.loginError);
    expect(onClose).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows the login error when Google reports a failure", async () => {
    renderModal();
    fireEvent.click(screen.getByText("google-error"));

    expect(await screen.findByRole("alert")).toHaveTextContent(en.auth.loginError);
  });

  it("in Cognito mode offers one button that leaves for the managed login", async () => {
    useCognito();
    loginWithRedirect.mockResolvedValue(undefined);
    searchParams = new URLSearchParams({ redirect: "/trip/japan" });
    renderModal();

    expect(screen.queryByText("google-success")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.auth.continueWithGoogle }));

    await waitFor(() => expect(loginWithRedirect).toHaveBeenCalledWith("/trip/japan"));
    expect(screen.getByRole("button", { name: en.auth.redirecting })).toBeDisabled();
    expect(login).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("in Cognito mode drops an external redirect and reports a failed start", async () => {
    useCognito();
    loginWithRedirect.mockRejectedValue(new Error("no crypto"));
    searchParams = new URLSearchParams({ redirect: "https://evil.example" });
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: en.auth.continueWithGoogle }));

    expect(await screen.findByRole("alert")).toHaveTextContent(en.auth.loginError);
    expect(loginWithRedirect).toHaveBeenCalledWith(null);
    expect(screen.getByRole("button", { name: en.auth.continueWithGoogle })).toBeEnabled();
  });

  it("closes from the backdrop and the close button", () => {
    renderModal();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is a labelled modal dialog that takes the focus when it opens", () => {
    renderModal();

    const dialog = screen.getByRole("dialog", { name: en.auth.title });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent(en.auth.subtitle);
    expect(document.activeElement).toBe(dialog);
  });

  it("closes on Escape and gives the focus back to whatever opened it", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = renderModal();
    expect(document.activeElement).not.toBe(opener);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("keeps Tab inside the dialog", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: en.auth.title });
    const close = screen.getByLabelText("Close");
    const last = screen.getByText("google-error");

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });
});
