import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useStore } from "@/store/StoreProvider";
import { formatPercent } from "@/lib/format";
import { termLabel } from "@/lib/gpa";
import { percentToLetter } from "@/lib/scale";
import { ROUTE_TITLES, ROUTES, type Route } from "@/router";
import {
  IconChevron,
  IconClasses,
  IconMoon,
  IconPlus,
  IconRedo,
  IconSearch,
  IconSun,
  IconTarget,
  IconUndo,
} from "@/components/ui/Icons";
import { cx, Kbd } from "@/components/ui/primitives";

/**
 * ⌘K.
 *
 * Three groups: pages, the classes on the transcript, and the actions worth
 * reaching without a mouse. Matching is subsequence-based — "apcs" finds
 * "AP Computer Science" — and ranked so a prefix hit always beats a scattered
 * one.
 */

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: "Pages" | "Classes" | "Actions";
  icon?: ReactNode;
  keywords?: string;
  run: () => void;
}

/**
 * Subsequence match with a score. Returns -1 for no match; higher is better.
 * Consecutive characters and word-start hits are what earn points.
 */
function score(haystack: string, needle: string): number {
  if (needle === "") return 0;
  const text = haystack.toLowerCase();
  const query = needle.toLowerCase();

  let total = 0;
  let cursor = 0;
  let streak = 0;

  for (const char of query) {
    const found = text.indexOf(char, cursor);
    if (found === -1) return -1;

    // Landing on the start of a word is worth more than landing mid-word.
    const atWordStart = found === 0 || /[\s·(\-/]/.test(text[found - 1] ?? "");
    streak = found === cursor ? streak + 1 : 0;
    total += 1 + streak * 2 + (atWordStart ? 3 : 0);
    cursor = found + 1;
  }

  // A shorter haystack matching the same query is the better hit.
  return total + Math.max(0, 12 - haystack.length / 4);
}

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onAddClass,
  route,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (route: Route) => void;
  onAddClass: () => void;
  route: Route;
}) {
  const { data, settings, dispatch, canUndo, canRedo, undo, redo } = useStore();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];

    for (const item of ROUTES) {
      if (item === route) continue;
      list.push({
        id: `route:${item}`,
        label: ROUTE_TITLES[item],
        hint: "Go to page",
        group: "Pages",
        icon: <IconChevron size={15} />,
        run: () => onNavigate(item),
      });
    }

    list.push(
      {
        id: "action:add",
        label: "Add a class",
        hint: "Opens the class editor",
        group: "Actions",
        icon: <IconPlus size={15} />,
        keywords: "new course create",
        run: onAddClass,
      },
      {
        id: "action:simulate",
        label: settings.simulate ? "Turn off simulation" : "Turn on simulation",
        hint: "Projected grades in every total",
        group: "Actions",
        icon: <IconTarget size={15} />,
        keywords: "what if hypothetical projection",
        run: () => dispatch({ type: "update-settings", patch: { simulate: !settings.simulate } }),
      },
      {
        id: "action:theme",
        label: settings.theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        group: "Actions",
        icon: settings.theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />,
        keywords: "appearance mode night",
        run: () =>
          dispatch({
            type: "update-settings",
            patch: { theme: settings.theme === "dark" ? "light" : "dark" },
          }),
      },
      {
        id: "action:print",
        label: "Print the transcript",
        group: "Actions",
        icon: <IconClasses size={15} />,
        keywords: "pdf export paper",
        run: () => {
          onNavigate("transcript");
          setTimeout(() => window.print(), 350);
        },
      },
    );

    if (canUndo) {
      list.push({
        id: "action:undo",
        label: "Undo",
        group: "Actions",
        icon: <IconUndo size={15} />,
        run: undo,
      });
    }
    if (canRedo) {
      list.push({
        id: "action:redo",
        label: "Redo",
        group: "Actions",
        icon: <IconRedo size={15} />,
        run: redo,
      });
    }

    for (const course of data.courses) {
      list.push({
        id: `course:${course.id}`,
        label: course.name,
        hint: `${termLabel(course.gradeLevel, course.term)} · ${course.difficulty}${
          course.percent === null
            ? " · ungraded"
            : ` · ${formatPercent(course.percent, 1)} (${percentToLetter(course.percent)})`
        }`,
        group: "Classes",
        icon: <IconClasses size={15} />,
        keywords: `${course.subject} ${course.difficulty} grade ${course.gradeLevel}`,
        run: () => onNavigate("classes"),
      });
    }

    return list;
  }, [data.courses, settings.simulate, settings.theme, route, canUndo, canRedo, dispatch, onNavigate, onAddClass, undo, redo]);

  const results = useMemo(() => {
    if (query.trim() === "") {
      return commands.filter((c) => c.group !== "Classes").slice(0, 9);
    }
    return commands
      .map((command) => ({
        command,
        rank: Math.max(
          score(command.label, query),
          score(`${command.label} ${command.keywords ?? ""} ${command.hint ?? ""}`, query) - 4,
        ),
      }))
      .filter((entry) => entry.rank >= 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 12)
      .map((entry) => entry.command);
  }, [commands, query]);

  // Reset whenever the palette opens, and whenever the result set changes.
  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({
      block: "nearest",
    });
  }, [index]);

  if (!open) return null;

  const commit = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    // Let the palette unmount before the action re-renders the page under it.
    requestAnimationFrame(command.run);
  };

  let lastGroup = "";

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-start justify-center p-4 pt-[12vh]">
      <div
        className="anim-fade absolute inset-0 bg-[rgba(6,20,12,0.42)] backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="anim-pop relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <IconSearch size={17} className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((i) => (i + 1) % Math.max(1, results.length));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((i) => (i - 1 + results.length) % Math.max(1, results.length));
              } else if (event.key === "Enter") {
                event.preventDefault();
                commit(results[index]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="Search pages, classes, and actions…"
            className="h-13 min-w-0 flex-1 bg-transparent py-4 text-[15px] text-ink outline-none placeholder:text-ink-3"
            aria-label="Search"
          />
          <Kbd>esc</Kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13.5px] text-ink-3">
              Nothing matches “{query}”.
            </p>
          ) : (
            results.map((command, i) => {
              const showGroup = command.group !== lastGroup;
              lastGroup = command.group;
              const active = i === index;

              return (
                <div key={command.id}>
                  {showGroup ? (
                    <div className="px-2.5 pt-3 pb-1 text-[10px] font-bold tracking-[0.11em] text-ink-3 uppercase">
                      {command.group}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    data-active={active}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => commit(command)}
                    className={cx(
                      "flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors",
                      active ? "bg-brand-soft text-brand" : "text-ink hover:bg-surface-2",
                    )}
                  >
                    <span className={cx("shrink-0", active ? "text-brand" : "text-ink-3")}>
                      {command.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">
                        {command.label}
                      </span>
                      {command.hint ? (
                        <span className="block truncate text-[11.5px] text-ink-3">{command.hint}</span>
                      ) : null}
                    </span>
                    {active ? <Kbd>↵</Kbd> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-ink-3">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Kbd>?</Kbd> shortcuts
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
