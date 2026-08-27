import { useEffect } from "react";

import type { ThemeChoice } from "@/lib/types";

/**
 * Applies the theme choice to the document.
 *
 * "system" is not a third palette — it resolves to light or dark and follows
 * the OS live, which is why the media query listener stays attached rather than
 * being read once at startup.
 */
export function useTheme(choice: ThemeChoice): void {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const resolved = choice === "system" ? (media.matches ? "dark" : "light") : choice;
      document.documentElement.dataset.theme = resolved;

      // Keep the browser chrome (address bar, notch) in step with the page.
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
      if (meta) meta.content = resolved === "dark" ? "#0a1009" : "#014421";
    };

    apply();
    if (choice !== "system") return;

    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [choice]);
}
