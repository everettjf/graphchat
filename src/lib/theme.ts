import { useSyncExternalStore } from "react";

export type ThemePreference = "light" | "dark" | null;
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "graphchat-theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

let preference: ThemePreference = (() => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
})();

const listeners = new Set<() => void>();

export function resolveTheme(): ResolvedTheme {
  return preference ?? (media.matches ? "dark" : "light");
}

function apply() {
  document.documentElement.dataset.theme = resolveTheme();
}

export function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, next);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // storage unavailable; keep the in-memory preference
  }
  apply();
  listeners.forEach((listener) => listener());
}

export function toggleTheme() {
  setThemePreference(resolveTheme() === "dark" ? "light" : "dark");
}

media.addEventListener("change", () => {
  if (preference) return;
  apply();
  listeners.forEach((listener) => listener());
});

apply();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, resolveTheme, () => "light");
}
