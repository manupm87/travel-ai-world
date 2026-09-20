"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, Map, User as UserIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useClickOutside } from "@/hooks/useClickOutside";
import type { User } from "@/types/user";
import { cn } from "@/utils/cn";

interface UserMenuProps {
  /** `dropdown` is the header avatar menu; `inline` the mobile drawer block. */
  variant?: "dropdown" | "inline";
  /** Opens the login modal (owned by the header). */
  onLogin: () => void;
  /** Called after login/logout is triggered, e.g. to close the drawer. */
  onAfterAction?: () => void;
}

function Avatar({ user, size }: { user: User; size: number }) {
  if (user.picture) {
    return (
      <Image
        src={user.picture}
        alt={user.name}
        width={size}
        height={size}
        className={cn(
          "rounded-full object-cover border border-accent/30",
          size >= 48 ? "w-12 h-12" : "w-9 h-9 shadow-accent-glow"
        )}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "rounded-full bg-accent/20 flex items-center justify-center text-accent border border-accent/30",
        size >= 48 ? "w-12 h-12" : "w-9 h-9"
      )}
    >
      <UserIcon size={size >= 48 ? 24 : 18} />
    </span>
  );
}

/**
 * Signed-out: a login trigger. Signed-in: the profile and a logout action.
 * Logging out clears the session and leaves protected pages by going home;
 * that navigation is deliberately here, not in the auth context.
 */
export function UserMenu({ variant = "dropdown", onLogin, onAfterAction }: UserMenuProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(rootRef, close, open);

  const handleLogin = () => {
    onAfterAction?.();
    onLogin();
  };

  const handleLogout = () => {
    setOpen(false);
    onAfterAction?.();
    logout();
    router.push("/");
  };

  if (!isAuthenticated || !user) {
    if (variant === "inline") {
      return (
        <button
          type="button"
          onClick={handleLogin}
          className="text-2xl font-medium text-text-primary hover:text-accent transition-colors cursor-pointer"
        >
          {t.auth.login}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={handleLogin}
        title={t.auth.login}
        aria-label={t.auth.login}
        className="w-9 h-9 rounded-full bg-bg-secondary border border-border-soft flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-accent/30 transition-all hover:bg-bg-surface cursor-pointer"
      >
        <LogIn size={18} aria-hidden="true" />
      </button>
    );
  }

  if (variant === "inline") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Avatar user={user} size={48} />
          <div>
            <p className="text-text-primary font-medium">{user.name}</p>
            <p className="text-text-secondary text-sm">{user.email}</p>
          </div>
        </div>
        <Link
          href="/dashboard"
          onClick={onAfterAction}
          className="flex items-center gap-3 text-xl font-medium text-text-primary hover:text-accent transition-colors"
        >
          <Map size={24} aria-hidden="true" />
          {t.nav.dashboard}
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 text-xl font-medium text-text-primary hover:text-accent transition-colors cursor-pointer"
        >
          <LogOut size={24} aria-hidden="true" />
          {t.auth.logout}
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t.nav.userMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
      >
        <Avatar user={user} size={36} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t.nav.userMenu}
          className="absolute top-full right-0 mt-2 w-48 bg-glass-bg backdrop-blur-xl border border-glass-border rounded-xl shadow-2xl py-2 animate-scale-in origin-top-right"
        >
          <div className="px-4 py-2 border-b border-border mb-1">
            <p className="text-[12px] font-semibold text-text-primary truncate">{user.name}</p>
            <p className="text-[10px] text-text-secondary truncate">{user.email}</p>
          </div>
          <Link
            href="/dashboard"
            role="menuitem"
            onClick={close}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] font-medium text-text-secondary hover:text-text-primary hover:bg-accent-soft transition-colors"
          >
            <Map size={14} aria-hidden="true" />
            {t.nav.dashboard}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] font-medium text-text-secondary hover:text-error hover:bg-error/5 transition-colors cursor-pointer"
          >
            <LogOut size={14} aria-hidden="true" />
            {t.auth.logout}
          </button>
        </div>
      )}
    </div>
  );
}
