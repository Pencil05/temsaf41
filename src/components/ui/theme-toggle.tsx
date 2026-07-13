"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;
    localStorage.setItem("tems-theme", nextTheme);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle grid size-10 shrink-0 place-items-center rounded-xl border border-sky-200/70 bg-white/80 text-[#12345b] shadow-sm backdrop-blur-xl hover:border-[#d6b86a] hover:text-[#9a741d] focus:outline-none focus:ring-4 focus:ring-sky-200/60 ${className}`}
      aria-label="สลับโหมดมืดและสว่าง"
      title="สลับโหมดมืดและสว่าง"
    >
      <Sun className="theme-icon-light size-5" aria-hidden="true" />
      <Moon className="theme-icon-dark size-5" aria-hidden="true" />
    </button>
  );
}
