"use client";

import { useLanguage } from "@/context/LanguageContext";

import Link from "next/link";

export default function PlanPage() {
  const { t } = useLanguage();
  const p = t.planPage;

  return (
    <main className="min-h-screen bg-bg-primary flex items-center justify-center">
      <div className="text-center flex flex-col gap-6 px-8">
        <div className="text-6xl">🗺️</div>
        <h1 className="text-4xl font-bold text-white tracking-[-1px]">{p.title}</h1>
        <p className="text-text-secondary text-lg max-w-md">{p.description}</p>
          <Link
            href="/"
            className="inline-flex items-center justify-center bg-accent hover:bg-accent-hover text-white font-semibold px-8 py-3 rounded-lg transition-colors w-fit mx-auto"
          >
            ← Back to Dashboard
          </Link>
      </div>
    </main>
  );
}
