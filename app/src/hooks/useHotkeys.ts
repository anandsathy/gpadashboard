import { useEffect, useRef } from "react";

/**
 * Global keyboard shortcuts.
 *
 * The important part is the guard: a shortcut must never fire while someone is
 * typing a course name, so anything originating in an input, textarea, select,
 * or contenteditable is ignored unless the binding explicitly asks otherwise.
 */

export interface Hotkey {
  /** Lowercase `event.key`, e.g. "k", "/", "?", "z". */
  key: string;
  meta?: boolean; // ⌘ on macOS, Ctrl elsewhere — either satisfies this
  shift?: boolean;
  alt?: boolean;
  /** Fire even while a text field has focus. Default false. */
  whileTyping?: boolean;
  handler: (event: KeyboardEvent) => void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function useHotkeys(hotkeys: Hotkey[], enabled = true): void {
  // Held in a ref so re-created handler closures never re-bind the listener.
  const ref = useRef(hotkeys);
  ref.current = hotkeys;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTyping(event.target);
      const key = event.key.toLowerCase();
      const meta = event.metaKey || event.ctrlKey;

      for (const hotkey of ref.current) {
        if (key !== hotkey.key.toLowerCase()) continue;
        if (Boolean(hotkey.meta) !== meta) continue;
        if (hotkey.shift !== undefined && hotkey.shift !== event.shiftKey) continue;
        if (hotkey.alt !== undefined && hotkey.alt !== event.altKey) continue;
        if (typing && !hotkey.whileTyping) continue;

        event.preventDefault();
        hotkey.handler(event);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** True on Apple platforms, so shortcut hints can show ⌘ instead of Ctrl. */
export const isApple =
  typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

export const MOD_KEY = isApple ? "⌘" : "Ctrl";
