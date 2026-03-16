"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User } from "@/types/user";
import { jwtDecode } from "jwt-decode";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credential: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Provides authentication state and methods to the application.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const isProd = process.env.NODE_ENV === "production";

  /**
   * Validates a JWT credential and returns the decoded user if valid.
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

  const login = (credential: string) => {
    const decodedUser = validateAndDecode(credential);
    if (decodedUser) {
      setUser(decodedUser);
      localStorage.setItem("travel_ai_token", credential);
      // We still store user for quick UI access, but token is the source of truth
      localStorage.setItem("travel_ai_user", JSON.stringify(decodedUser));
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
