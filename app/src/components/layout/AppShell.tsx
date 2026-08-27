import { useState, type ReactNode } from "react";

import { useStore } from "@/store/StoreProvider";
import { MOD_KEY } from "@/hooks/useHotkeys";
import { initialsOf } from "@/lib/format";
import { ROUTE_TITLES, ROUTES, type Route } from "@/router";
import {
  IconClasses,
  IconDashboard,
  IconGoogle,
  IconInsights,
  IconLaurel,
  IconRedo,
  IconSearch,
  IconSettings,
  IconSimulate,
  IconTranscript,
  IconUndo,
} from "@/components/ui/Icons";
import { Badge, Button, cx } from "@/components/ui/primitives";

/**
 * The application shell: a sidebar on desktop, a bottom bar on phones, and a
 * sticky header carrying the sync state, undo/redo, and the account button.
 */

const NAV_ICONS: Record<Route, (props: { size?: number }) => ReactNode> = {
  dashboard: IconDashboard,
  classes: IconClasses,
  simulate: IconSimulate,
  insights: IconInsights,
  transcript: IconTranscript,
  settings: IconSettings,
};

/** The four that earn a slot in the phone's bottom bar. */
const MOBILE_ROUTES: Route[] = ["dashboard", "classes", "simulate", "insights"];

export function AppShell({
  route,
  onNavigate,
  onOpenPalette,
  children,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
  onOpenPalette: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar route={route} onNavigate={onNavigate} onOpenPalette={onOpenPalette} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar route={route} onOpenPalette={onOpenPalette} />
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pt-5 pb-28 sm:px-6 lg:pb-12">
          {children}
        </main>
        <Footer />
      </div>

      <MobileNav route={route} onNavigate={onNavigate} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sidebar                                                                     */
/* -------------------------------------------------------------------------- */

function Sidebar({
  route,
  onNavigate,
  onOpenPalette,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
  onOpenPalette: () => void;
}) {
  const { settings } = useStore();

  return (
    // The <aside> stretches the full document height so the surface colour runs
    // all the way down; the column inside it is what actually sticks.
    <aside className="no-print hidden w-[220px] shrink-0 border-r border-line bg-surface lg:block">
      <div className="sticky top-0 flex h-dvh flex-col">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <IconLaurel size={24} className="shrink-0 text-brand" />
        <div className="min-w-0 leading-tight">
          <div className="text-[15px] font-extrabold tracking-[-0.03em] text-brand">
            GPA Dashboard
          </div>
          <div className="text-[10px] font-bold tracking-[0.11em] text-ink-3 uppercase">
            Class of {settings.graduationYear}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="mx-3 mb-4 flex items-center gap-2 rounded-[10px] border border-line-strong bg-surface-2 px-2.5 py-2 text-left text-[13px] text-ink-3 transition-colors hover:border-brand hover:text-ink"
      >
        <IconSearch size={15} />
        <span className="flex-1">Search…</span>
        <span className="text-[11px] font-bold">{MOD_KEY}K</span>
      </button>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {ROUTES.map((item) => {
          const NavIcon = NAV_ICONS[item];
          const active = item === route;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onNavigate(item)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] font-semibold transition-colors",
                active
                  ? "bg-brand-soft text-brand"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {active ? (
                <span className="absolute top-1/2 -left-3 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
              ) : null}
              <NavIcon size={17} />
              {ROUTE_TITLES[item]}
              {item === "simulate" && settings.simulate ? (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-warn" title="Simulation is on" />
              ) : null}
            </button>
          );
        })}
      </nav>

        <SidebarAccount />
      </div>
    </aside>
  );
}

function SidebarAccount() {
  const { profile, signedIn, signIn, signOut, authReady } = useStore();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (!signedIn) {
    return (
      <div className="border-t border-line p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          busy={busy || !authReady}
          onClick={() => run(signIn)}
        >
          {busy || !authReady ? null : <IconGoogle size={15} />}
          Sign in to sync
        </Button>
        <p className="mt-2 px-1 text-[11px] leading-snug text-ink-3">
          Everything works signed out — your classes just stay on this device.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-1.5">
        <Avatar />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[12.5px] font-bold text-ink">
            {profile.name ?? "Signed in"}
          </div>
          <div className="truncate text-[11px] text-ink-3">{profile.email}</div>
        </div>
      </div>
      <Button variant="ghost" size="sm" className="mt-1 w-full" busy={busy} onClick={() => run(signOut)}>
        Sign out
      </Button>
    </div>
  );
}

export function Avatar({ size = 30 }: { size?: number }) {
  const { profile } = useStore();

  if (profile.photoURL) {
    return (
      <img
        src={profile.photoURL}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-full border border-line-strong object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border border-line-strong bg-brand-soft text-[11px] font-extrabold text-brand"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initialsOf(profile.name)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Top bar                                                                     */
/* -------------------------------------------------------------------------- */

function TopBar({ route, onOpenPalette }: { route: Route; onOpenPalette: () => void }) {
  const { canUndo, canRedo, undo, redo, settings, signedIn, signIn, authReady } = useStore();

  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center gap-2 px-4 sm:px-6">
        <div className="flex items-center gap-2 lg:hidden">
          <IconLaurel size={21} className="text-brand" />
          <span className="text-[15px] font-extrabold tracking-[-0.03em] text-brand">
            GPA Dashboard
          </span>
        </div>

        <h1 className="hidden text-[15px] font-bold text-ink lg:block">{ROUTE_TITLES[route]}</h1>

        {settings.simulate ? (
          <Badge tone="warn" className="hidden sm:inline-flex" title="Projected grades are included in every total">
            Simulating
          </Badge>
        ) : null}

        <div className="flex-1" />

        <SyncPill />

        <div className="hidden items-center gap-1 sm:flex">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            disabled={!canUndo}
            onClick={undo}
            title="Undo"
            aria-label="Undo"
          >
            <IconUndo size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            disabled={!canRedo}
            onClick={redo}
            title="Redo"
            aria-label="Redo"
          >
            <IconRedo size={16} />
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={onOpenPalette}
          title={`Search (${MOD_KEY}K)`}
          aria-label="Search"
          className="lg:hidden"
        >
          <IconSearch size={16} />
        </Button>

        {signedIn ? (
          <Avatar size={28} />
        ) : (
          <Button variant="outline" size="sm" onClick={signIn} disabled={!authReady}>
            <IconGoogle size={14} />
            <span className="hidden sm:inline">Sign in</span>
          </Button>
        )}
      </div>
    </header>
  );
}

const SYNC_STYLES: Record<string, { dot: string; text: string }> = {
  local: { dot: "bg-ink-3", text: "text-ink-3" },
  connecting: { dot: "bg-brand animate-pulse", text: "text-ink-3" },
  saving: { dot: "bg-brand animate-pulse", text: "text-ink-3" },
  synced: { dot: "bg-brand-2", text: "text-brand-2" },
  offline: { dot: "bg-warn", text: "text-warn" },
  error: { dot: "bg-danger", text: "text-danger" },
};

const SYNC_LABELS: Record<string, string> = {
  local: "On this device",
  connecting: "Connecting",
  saving: "Saving",
  synced: "Synced",
  offline: "Offline",
  error: "Error",
};

function SyncPill() {
  const { sync, syncMessage } = useStore();
  const style = SYNC_STYLES[sync] ?? SYNC_STYLES.local!;

  return (
    <span
      title={syncMessage}
      className={cx("hidden items-center gap-1.5 text-[12px] font-semibold md:inline-flex", style.text)}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", style.dot)} />
      {SYNC_LABELS[sync]}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile navigation                                                           */
/* -------------------------------------------------------------------------- */

function MobileNav({ route, onNavigate }: { route: Route; onNavigate: (route: Route) => void }) {
  const { settings } = useStore();

  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-50 border-t border-line bg-[color-mix(in_oklab,var(--surface)_94%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="grid grid-cols-5">
        {MOBILE_ROUTES.map((item) => {
          const NavIcon = NAV_ICONS[item];
          const active = item === route;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onNavigate(item)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "relative flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-bold transition-colors",
                active ? "text-brand" : "text-ink-3",
              )}
            >
              {active ? (
                <span className="absolute top-0 h-[2.5px] w-8 rounded-b-full bg-brand" />
              ) : null}
              <NavIcon size={19} />
              {ROUTE_TITLES[item]}
              {item === "simulate" && settings.simulate ? (
                <span className="absolute top-2 right-[calc(50%-16px)] h-1.5 w-1.5 rounded-full bg-warn" />
              ) : null}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onNavigate("settings")}
          aria-current={route === "settings" || route === "transcript" ? "page" : undefined}
          className={cx(
            "relative flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-bold transition-colors",
            route === "settings" || route === "transcript" ? "text-brand" : "text-ink-3",
          )}
        >
          {route === "settings" || route === "transcript" ? (
            <span className="absolute top-0 h-[2.5px] w-8 rounded-b-full bg-brand" />
          ) : null}
          <IconSettings size={19} />
          More
        </button>
      </div>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Footer                                                                      */
/* -------------------------------------------------------------------------- */

function Footer() {
  return (
    <footer className="no-print mx-auto w-full max-w-[1180px] px-4 pb-6 sm:px-6 lg:pb-8">
      <p className="border-t border-line pt-4 text-[11.5px] leading-relaxed text-ink-3">
        GPA Dashboard calculates from the weighting rule set in Settings. Your school's registrar is
        the authority on your official transcript — check the numbers here against it before they
        matter.
      </p>
    </footer>
  );
}
