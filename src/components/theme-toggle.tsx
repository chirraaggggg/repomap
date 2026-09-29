"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

const THEME_EVENT = "repotutor:theme-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset["theme"] === "light" ? "light" : "dark";
}

function getServerSnapshot(): Theme {
  return "dark";
}

/** Applies a theme to the document, persists it, and notifies subscribers. */
function applyTheme(next: Theme): void {
  document.documentElement.dataset["theme"] = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    // storage unavailable (private mode) — theme still applies for the session
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    applyTheme(theme === "dark" ? "light" : "dark");
  }, [theme]);

  const nextLabel = theme === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={`Switch to ${nextLabel} theme`}
      title={`Switch to ${nextLabel} theme`}
      className="text-[var(--text-secondary)] hover:text-[var(--text)]"
    >
      {/* Both icons rendered; CSS shows the one matching the active theme,
          so the correct icon appears even before hydration. */}
      <Sun className="theme-icon-sun h-4 w-4" />
      <Moon className="theme-icon-moon h-4 w-4" />
    </Button>
  );
}
