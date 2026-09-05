"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User } from "@/types/user";
import { jwtDecode } from "jwt-decode";
import { useRouter } from "next/navigation";
import {
  isApiAvailable,
  verifyGoogleToken,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
} from "@/services/api";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credential: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Provides authentication state and methods to the application.
 *
 * Supports two modes:
 * - Backend mode (NEXT_PUBLIC_API_URL set): verifies Google token server-side,
 *   stores our own JWT for API access.
 * - Static mode (no API URL): decodes Google JWT client-side for basic profile info.
 *   This preserves functionality on static GitHub Pages deployments.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const isProd = process.env.NODE_ENV === "production";

  /**
   * Validates a JWT credential and returns the decoded user if valid.
   * Used as fallback when no backend API is available.
   */
  const validateAndDecode = (credential: string): User | null => {
    try {
      const decoded: any = jwtDecode(credential);
      
      // Check for expiration (exp is in seconds)
      const currentTime = Date.now() / 1000;
      if (decoded.exp && decoded.exp < currentTime) {
        console.warn("Token expired");
        return null;
      }

      return {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
      };
    } catch (error) {
      console.error("Invalid token format:", error);
      return null;
    }
  };

  /**
   * Reads the profile cached at login time.
   *
   * Our own JWT carries only { sub, exp }
   */
  const readStoredProfile = (raw: string | null): User | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const savedUserJson = localStorage.getItem(USER_STORAGE_KEY);

    if (savedToken) {
      const decodedUser = validateAndDecode(savedToken);
      if (decodedUser) {
        setUser(readStoredProfile(savedUserJson) ?? decodedUser);
      } else {
        // Token is invalid or expired
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    } else if (!isProd && savedUserJson) {
      try {
        setUser(JSON.parse(savedUserJson));
      } catch (e) {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    }
    
    setIsLoading(false);
  }, [isProd]);

  /**
   * Authenticates a user with a Google credential.
   *
   * If a backend API is configured, sends the Google ID token to the backend
   * for server-side verification and receives our own JWT.
   * Otherwise, falls back to client-side JWT decoding.
   */
  const login = async (credential: string): Promise<void> => {
    if (isApiAvailable()) {
      const response = await verifyGoogleToken(credential);
      const backendUser: User = {
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
        picture: response.user.picture,
      };
      setUser(backendUser);
      localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(backendUser));
      return;
    }

    const decodedUser = validateAndDecode(credential);
    if (decodedUser) {
      setUser(decodedUser);
      localStorage.setItem(TOKEN_STORAGE_KEY, credential);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(decodedUser));
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    router.push("/");
  };


  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}


/**
 * Hook to use the Auth context.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
