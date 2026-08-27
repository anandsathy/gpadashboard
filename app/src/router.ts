import { useCallback, useEffect, useState } from "react";

/**
 * A hash router, hand-rolled in forty lines.
 *
 * Hash routing is not a compromise here — it is the right call. The app is
 * published to GitHub Pages, which serves static files and cannot rewrite
 * unknown paths to `index.html`, so a history-API route would 404 on reload.
 * Hashes work everywhere, including from a `file://` copy.
 */

export const ROUTES = ["dashboard", "classes", "simulate", "insights", "transcript", "settings"] as const;

export type Route = (typeof ROUTES)[number];

export const ROUTE_TITLES: Record<Route, string> = {
  dashboard: "Dashboard",
  classes: "Classes",
  simulate: "Simulate",
  insights: "Insights",
  transcript: "Transcript",
  settings: "Settings",
};

const isRoute = (value: string): value is Route => (ROUTES as readonly string[]).includes(value);

export function currentRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  return isRoute(raw) ? raw : "dashboard";
}

export function navigate(route: Route): void {
  if (currentRoute() === route) return;
  window.location.hash = `#/${route}`;
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === "undefined" ? "dashboard" : currentRoute(),
  );

  useEffect(() => {
    const onChange = () => {
      setRoute(currentRoute());
      // A route change should start at the top, the way a page load would.
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  useEffect(() => {
    document.title =
      route === "dashboard" ? "GPA Dashboard" : `${ROUTE_TITLES[route]} · GPA Dashboard`;
  }, [route]);

  const go = useCallback((next: Route) => navigate(next), []);

  return [route, go];
}
