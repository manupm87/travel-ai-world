"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User } from "@/types/user";
import { jwtDecode } from "jwt-decode";
import { useRouter } from "next/navigation";
import { isApiAvailable, verifyGoogleToken } from "@/services/api";

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

  useEffect(() => {
    const savedToken = localStorage.getItem("travel_ai_token");
    const savedUserJson = localStorage.getItem("travel_ai_user");

    if (savedToken) {
      const decodedUser = validateAndDecode(savedToken);
      if (decodedUser) {
        setUser(decodedUser);
      } else {
        // Token is invalid or expired
        localStorage.removeItem("travel_ai_token");
        localStorage.removeItem("travel_ai_user");
      }
    } else if (!isProd && savedUserJson) {
      // In Development, allow plain JSON injection for testing/browser agent
      try {
        setUser(JSON.parse(savedUserJson));
      } catch (e) {
        localStorage.removeItem("travel_ai_user");
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
      try {
        const response = await verifyGoogleToken(credential);
        const backendUser: User = {
          id: response.user.id,
          email: response.user.email,
          name: response.user.name,
          picture: response.user.picture,
        };
        setUser(backendUser);
        localStorage.setItem("travel_ai_token", response.access_token);
        localStorage.setItem("travel_ai_user", JSON.stringify(backendUser));
      } catch (error) {
        console.error("Backend auth failed, falling back to client-side:", error);
        // Graceful fallback to client-side decode
        const decodedUser = validateAndDecode(credential);
        if (decodedUser) {
          setUser(decodedUser);
          localStorage.setItem("travel_ai_token", credential);
          localStorage.setItem("travel_ai_user", JSON.stringify(decodedUser));
        }
      }
    } else {
      // Static mode — no backend available
      const decodedUser = validateAndDecode(credential);
      if (decodedUser) {
        setUser(decodedUser);
        localStorage.setItem("travel_ai_token", credential);
        localStorage.setItem("travel_ai_user", JSON.stringify(decodedUser));
      }
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("travel_ai_token");
    localStorage.removeItem("travel_ai_user");
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
