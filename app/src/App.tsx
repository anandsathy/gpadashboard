import { useCallback, useEffect, useRef, useState } from "react";

import { StoreProvider, useStore } from "@/store/StoreProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTheme } from "@/hooks/useTheme";
import type { Course, GradeLevel, Term } from "@/lib/types";
import { useRoute, type Route } from "@/router";
import { AppShell } from "@/components/layout/AppShell";
import { ClassForm } from "@/components/ClassForm";
import { CommandPalette } from "@/components/CommandPalette";
import { ShortcutsModal } from "@/components/ShortcutsModal";
import { Skeleton } from "@/components/ui/primitives";
import { Classes } from "@/pages/Classes";
import { Dashboard } from "@/pages/Dashboard";
import { Insights } from "@/pages/Insights";
import { Settings } from "@/pages/Settings";
import { Simulate } from "@/pages/Simulate";
import { Transcript } from "@/pages/Transcript";

export function App() {
  return (
    <ToastProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </ToastProvider>
  );
}

interface EditorState {
  open: boolean;
  course: Course | null;
  preset?: { gradeLevel?: GradeLevel; term?: Term };
}

function Shell() {
  const { settings, ready, dispatch, undo, redo } = useStore();
  const [route, go] = useRoute();
  useTheme(settings.theme);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ open: false, course: null });

  const openAdd = useCallback((preset?: { gradeLevel?: GradeLevel; term?: Term }) => {
    setEditor({ open: true, course: null, preset });
  }, []);

  const openEdit = useCallback((course: Course) => {
    setEditor({ open: true, course });
  }, []);

  const closeEditor = useCallback(() => {
    setEditor((prev) => ({ ...prev, open: false }));
  }, []);

  /* ---- Shortcuts ------------------------------------------------------- */

  // "g" then a letter jumps to a page, vim-style. The pending key expires so a
  // stray "g" never hijacks the next thing typed.
  const pendingGo = useRef(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armGo = useCallback(() => {
    pendingGo.current = true;
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => {
      pendingGo.current = false;
    }, 900);
  }, []);

  const jump = useCallback(
    (target: Route) => {
      if (!pendingGo.current) return false;
      pendingGo.current = false;
      go(target);
      return true;
    },
    [go],
  );

  useEffect(() => () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
  }, []);

  useHotkeys([
    { key: "k", meta: true, whileTyping: true, handler: () => setPaletteOpen(true) },
    { key: "z", meta: true, shift: false, handler: undo },
    { key: "z", meta: true, shift: true, handler: redo },
    { key: "y", meta: true, handler: redo },
    { key: "?", shift: true, handler: () => setShortcutsOpen(true) },
    { key: "/", handler: () => setPaletteOpen(true) },
    { key: "n", meta: false, handler: () => openAdd() },
    {
      key: "s",
      meta: false,
      handler: () => {
        if (jump("simulate")) return;
        dispatch({ type: "update-settings", patch: { simulate: !settings.simulate } });
      },
    },
    { key: "g", meta: false, handler: armGo },
    { key: "d", meta: false, handler: () => jump("dashboard") },
    { key: "c", meta: false, handler: () => jump("classes") },
    { key: "i", meta: false, handler: () => jump("insights") },
    { key: "t", meta: false, handler: () => jump("transcript") },
  ]);

  /* ---- Render ---------------------------------------------------------- */

  return (
    <>
      <AppShell route={route} onNavigate={go} onOpenPalette={() => setPaletteOpen(true)}>
        {!ready ? (
          <LoadingSkeleton />
        ) : route === "dashboard" ? (
          <Dashboard onNavigate={go} onAddClass={() => openAdd()} />
        ) : route === "classes" ? (
          <Classes onEditCourse={openEdit} onAddClass={openAdd} />
        ) : route === "simulate" ? (
          <Simulate onAddClass={() => openAdd()} />
        ) : route === "insights" ? (
          <Insights onAddClass={() => openAdd()} />
        ) : route === "transcript" ? (
          <Transcript onAddClass={() => openAdd()} />
        ) : (
          <Settings />
        )}
      </AppShell>

      <ClassForm
        open={editor.open}
        onClose={closeEditor}
        course={editor.course}
        preset={editor.preset}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={go}
        onAddClass={() => openAdd()}
        route={route}
      />

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}

/** Shown for the few milliseconds it takes to read storage. */
function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading your classes">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[168px] rounded-[var(--radius-lg)]" />
          <Skeleton className="h-[148px] rounded-[var(--radius-lg)]" />
        </div>
        <Skeleton className="h-[332px] rounded-[var(--radius-lg)]" />
      </div>
      <Skeleton className="h-[240px] rounded-[var(--radius-lg)]" />
    </div>
  );
}
