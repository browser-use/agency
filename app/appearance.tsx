"use client";

import { useEffect, useSyncExternalStore } from "react";

type Appearance = "system" | "light" | "dark";
const STORAGE_KEY = "agency-appearance";
const CHANGE_EVENT = "agency-appearance-change";
let sessionChoice: Appearance | null = null;

function readAppearance(): Appearance {
  if (sessionChoice) return sessionChoice;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* Private browsing can still use an in-session choice. */ }
  return "system";
}

function subscribeAppearance(callback: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    sessionChoice = null;
    callback();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function subscribeSystem(callback: () => void) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function useAppearance() {
  const preference = useSyncExternalStore(subscribeAppearance, readAppearance, () => "system" as const);
  const systemDark = useSyncExternalStore(subscribeSystem, () => window.matchMedia("(prefers-color-scheme: dark)").matches, () => false);
  return { preference, resolved: preference === "system" ? (systemDark ? "dark" : "light") : preference };
}

export function AppearanceControl() {
  const { preference } = useAppearance();
  return (
    <label className="appearance-control">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10 3a7 7 0 0 1 0 14Z" fill="currentColor" /></svg>
      <span className="sr-only">Appearance</span>
      <select aria-label="Appearance" value={preference} onChange={(event) => {
        const next = event.target.value as Appearance;
        sessionChoice = next;
        try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Keep the in-session choice. */ }
        window.dispatchEvent(new Event(CHANGE_EVENT));
      }}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
      </select>
    </label>
  );
}

export function AppearanceRuntime() {
  const { resolved } = useAppearance();
  useEffect(() => {
    // Read the browser at effect time so hydration's server fallback cannot
    // overwrite the saved appearance applied by the prepaint script.
    const choice = readAppearance();
    const actual = choice === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : choice;
    document.documentElement.dataset.theme = actual;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", actual === "dark" ? "#172630" : "#edf2f5");
  }, [resolved]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${height}px`);
      document.documentElement.dataset.compactViewport = String(height < 560);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
      document.documentElement.style.removeProperty("--app-height");
      delete document.documentElement.dataset.compactViewport;
    };
  }, []);
  return null;
}
