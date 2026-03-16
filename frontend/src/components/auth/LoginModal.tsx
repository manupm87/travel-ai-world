"use client";

import React from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { X } from "lucide-react";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

import { useRouter, useSearchParams } from "next/navigation";

/**
 * A modal that provides Google Sign-In options.
 */
export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { login } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  if (!isOpen) return null;

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
                login(credentialResponse.credential);
                onClose();
                
                // Handle redirection
                const redirect = searchParams.get("redirect");
                if (redirect) {
                  router.push(decodeURIComponent(redirect));
                } else {
                  router.push("/dashboard");
                }
              }
            }}

            onError={() => {
              console.error("Login Failed");
            }}
            useOneTap
            theme="filled_blue"
            shape="pill"
            text="continue_with"
          />

        </div>

        <p className="mt-8 text-center text-xs text-text-secondary leading-relaxed">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
