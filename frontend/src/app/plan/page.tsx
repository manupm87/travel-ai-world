"use client";

import { useLanguage } from "@/context/LanguageContext";

export default function PlanPage() {
  const { t } = useLanguage();
  const p = t.planPage;

  return (
    <main className="min-h-screen bg-[#0A0A12] flex items-center justify-center">
      <div className="text-center flex flex-col gap-6 px-8">
        <div className="text-6xl">🗺️</div>
        <h1 className="text-4xl font-bold text-white tracking-[-1px]">{p.title}</h1>
        <p className="text-[#8888AA] text-lg max-w-md">{p.description}</p>
        <a
          href="/"
          className="inline-flex items-center justify-center bg-[#4F6EF7] hover:bg-[#3B5BDB] text-white font-semibold px-8 py-3 rounded-lg transition-colors w-fit mx-auto"
        >
          {p.back}
        </a>
      </div>
    </main>
  );
}
