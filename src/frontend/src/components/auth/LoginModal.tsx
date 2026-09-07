"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";
import { X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { safeRedirectPath } from "@/utils/safeRedirect";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * A modal that provides Google Sign-In options.
 *
 * After a successful sign-in it honours a `?redirect=` query parameter, but
 * only for same-origin paths (see `safeRedirectPath`); otherwise it goes to
 * the dashboard.
 */
export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { login } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCredential = async (credential: string) => {
    setError(null);
    try {
      await login(credential);
    } catch {
      setError(t.auth.loginError);
      return;
    }
    onClose();
    router.push(safeRedirectPath(searchParams.get("redirect")) ?? "/dashboard");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-bg-primary/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-bg-card border border-border rounded-2xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-text-secondary hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center text-2xl mx-auto mb-4">
            ✈
          </div>
          <h2 className="text-2xl font-heading font-medium text-white mb-2">
            {t.auth.welcomeBack}
          </h2>
          <p className="text-text-secondary">
            Join Travel AI World to save your itineraries and explore the world.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
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

          {error && (
            <p role="alert" className="text-sm text-center text-red-400">
              {error}
            </p>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-text-secondary leading-relaxed">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
