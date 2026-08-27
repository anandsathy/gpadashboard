import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * Offline support.
 *
 * Registered after load so it never competes with the first paint, and only in
 * a production build — a service worker caching a dev bundle is a debugging
 * nightmare nobody asked for.
 */
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    // Resolved against the document so the same build registers correctly at a
    // domain root and under a GitHub Pages project path.
    const swUrl = new URL("sw.js", document.baseURI);
    navigator.serviceWorker.register(swUrl).catch(() => {
      // A blocked or unsupported service worker is not an error worth surfacing:
      // the app works fine without it.
    });
  });
}
