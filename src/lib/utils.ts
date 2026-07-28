import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Locale } from "@/i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(iso: string, locale: Locale = "en") {
  const difference = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(difference / 60_000));
  if (minutes < 1) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "second");
  }
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: "always",
  });
  if (minutes < 60) return formatter.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  return formatter.format(-Math.floor(hours / 24), "day");
}
