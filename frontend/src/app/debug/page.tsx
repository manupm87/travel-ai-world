"use client";

import { useRouter, notFound } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function DebugPage() {
  // Prevent access in production
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const router = useRouter();
  const { isAuthenticated, user } = useAuth();

  const handleMockLogin = () => {
    const testUser = {
      id: "test-user-123",
      name: "Test User ✈",
      email: "test@example.com",
      picture: "https://api.dicebear.com/7.x/avataaars/svg?seed=test"
    };
    
    // Set storage directly as proof for the user
    localStorage.setItem("travel_ai_user", JSON.stringify(testUser));
    
    // In dev mode, AuthContext will pick this up on refresh
    window.location.href = "/dashboard";
  };

  const handleClearAuth = () => {
    localStorage.removeItem("travel_ai_user");
    localStorage.removeItem("travel_ai_token");
    window.location.href = "/";
  };

  return (
    <main className="min-h-screen bg-bg-primary text-white">
      <Header />
      <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
        <h1 className="text-4xl font-heading mb-8">Debug & Verification</h1>
        
        <div className="bg-bg-card border border-border rounded-2xl p-8 mb-8">
          <h2 className="text-xl font-medium mb-4">Auth State Information</h2>
          <div className="space-y-2 mb-6 text-text-secondary">
            <p>Status: <span className={isAuthenticated ? "text-accent" : "text-text-muted"}>
              {isAuthenticated ? "Authenticated" : "Guest"}
            </span></p>
            {isAuthenticated && (
              <pre className="bg-black/30 p-4 rounded-lg mt-2 overflow-x-auto text-xs">
                {JSON.stringify(user, null, 2)}
              </pre>
            )}
          </div>

          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleMockLogin}
              className="px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-xl transition-all font-medium"
            >
              🚀 1. Inject Test User & Go to Dashboard
            </button>
            <button
              onClick={handleClearAuth}
              className="px-6 py-3 bg-transparent border border-border hover:bg-white/5 text-white rounded-xl transition-all"
            >
              🧹 Clear Session
            </button>
          </div>
        </div>

        <div className="text-sm text-text-muted">
          <p>This page exists to prove the storage injection works as described in the code. In development mode, the `AuthContext` is designed to pick up a JSON object from `localStorage` if no valid JWT is present, facilitating automated testing and rapid prototyping.</p>
        </div>
      </div>
      <Footer />
    </main>
  );
}
