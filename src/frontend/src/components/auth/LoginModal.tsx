"use client";

/** The sign-in dialog. */

import { useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";
import { X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { Mark } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/hooks/useDialog";
import { safeRedirectTarget } from "@/utils/safeRedirect";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Where to go once signed in; wins over `?redirect=`. It is the path itself,
   * not the encoded query value, so its own query string is not decoded twice.
   */
  redirect?: string | null;
}

/**
 * The sign-in dialog: Cognito's managed login when deployed (back through
 * `/auth/callback/`), the Google Identity Services button locally. The
 * destination is a same-origin `redirect` or `?redirect=`, else `/dashboard/`.
 */
export function LoginModal({ isOpen, onClose, redirect: asked }: LoginModalProps) {
  const { provider, login, loginWithRedirect } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const titleId = useId();
  const descriptionId = useId();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Google's button is a cross-origin iframe, so the dialog itself takes the focus
  const dialogRef = useDialog<HTMLDivElement>({
    open: isOpen,
    onEscape: onClose,
    lockScroll: true,
  });

  if (!isOpen) return null;

  // `searchParams.get` has decoded the value once, as the router expects it.
  const redirect =
    safeRedirectTarget(asked) ?? safeRedirectTarget(searchParams.get("redirect"));

  const handleCredential = async (credential: string) => {
    setError(null);
    try {
      await login(credential);
    } catch {
      setError(t.auth.loginError);
      return;
    }
    onClose();
    router.push(redirect ?? "/dashboard/");
  };

  const handleRedirect = async () => {
    setError(null);
    setLeaving(true);
    try {
      await loginWithRedirect(redirect);
    } catch {
      setLeaving(false);
      setError(t.auth.loginError);
    }
  };

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-[100] animate-fade-in bg-bg-primary/70 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="fixed top-1/2 left-1/2 z-[101] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-2xl border border-glass-border bg-glass-bg p-8 shadow-field-glow backdrop-blur-xl focus:outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-2 text-text-secondary transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          aria-label={t.common.close}
        >
          <X size={20} aria-hidden="true" />
        </button>

        <div className="mb-8 flex flex-col items-center text-center">
          <Mark size={56} />
          <h2
            id={titleId}
            className="mt-4 mb-2 font-heading text-2xl font-light text-text-primary"
          >
            {t.auth.title}
          </h2>
          <p id={descriptionId} className="text-[15px] leading-relaxed text-text-secondary">
            {t.auth.subtitle}
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          {provider === "cognito" ? (
            /* the landing field's ring, turning while the button has the focus */
            <div className="group relative w-full">
              <span
                aria-hidden="true"
                className="conic-ring pointer-events-none absolute -inset-px rounded-full opacity-0 transition-opacity duration-300 group-focus-within:animate-ring-spin group-focus-within:opacity-100"
              />
              <Button
                type="button"
                size="sm"
                className="relative w-full rounded-full py-3"
                disabled={leaving}
                onClick={() => void handleRedirect()}
              >
                {leaving ? t.auth.redirecting : t.auth.continueWithGoogle}
              </Button>
            </div>
          ) : (
            <GoogleLogin
              onSuccess={(credentialResponse) => {
                if (credentialResponse.credential) {
                  void handleCredential(credentialResponse.credential);
                }
              }}
              onError={() => setError(t.auth.loginError)}
              useOneTap
              theme="filled_blue"
              shape="pill"
              text="continue_with"
            />
          )}

          {error && (
            <p role="alert" className="text-center text-sm text-error">
              {error}
            </p>
          )}
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-text-secondary">
          {t.auth.terms}
        </p>
      </div>
    </>
  );
}
