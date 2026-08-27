import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useToast } from "@/components/ui/Toast";
import {
  readStudent,
  signInWithGoogle,
  signOutOfGoogle,
  watchAuth,
  watchStudent,
  writeStudent,
} from "@/firebase/client";
import { firebaseConfigured } from "@/firebase/config";
import type { AppData, Profile, Settings, SyncStatus } from "@/lib/types";
import { hydrate, serialize } from "./migrate";
import { clearLocal, loadLocal, localStorageAvailable, saveLocal, saveTheme } from "./persist";
import { initialState, reducer, type Action, type StoreState } from "./reducer";

/**
 * The one place where the reducer, the browser, and the cloud meet.
 *
 * Rules that keep this honest:
 *   - `localStorage` is written on every change, synchronously enough that a
 *     crash loses nothing.
 *   - Firestore is a *sync layer*, never a dependency. Signed out, offline, or
 *     with Firebase blocked entirely, the app is fully functional.
 *   - A snapshot from another device is applied through the same `hydrate`
 *     used for disk, so a malformed remote document cannot break the UI.
 */

interface StoreApi {
  data: AppData;
  settings: Settings;
  dispatch: (action: Action) => void;
  ready: boolean;

  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  profile: Profile;
  signedIn: boolean;
  authReady: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;

  sync: SyncStatus;
  syncMessage: string;
  lastSavedAt: number | null;

  /** Replaces the whole document — used by import and by the sample seeder. */
  replaceAll: (data: AppData, label: string) => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

/** Convenience: the settings object on its own, which most components want. */
export function useSettings(): Settings {
  return useStore().settings;
}

const EMPTY_PROFILE: Profile = { name: null, email: null, photoURL: null, uid: null };

const CLOUD_DEBOUNCE_MS = 700;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const { toast } = useToast();

  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [sync, setSync] = useState<SyncStatus>("local");
  const [syncMessage, setSyncMessage] = useState("Saved on this device");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  /** Set while a remote snapshot is being applied, to avoid echoing it back. */
  const applyingRemote = useRef(false);
  const cloudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef<string>("");
  /** The reducer state, readable from callbacks without re-subscribing. */
  const stateRef = useRef<StoreState>(state);
  stateRef.current = state;

  /* ---------------------------------------------------------------------- */
  /* 1. Read from disk, once, before anything renders for real              */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const { data, found, migrated } = loadLocal();
    dispatch({ type: "hydrate", data, ready: true });

    if (!localStorageAvailable()) {
      setSync("offline");
      setSyncMessage("This browser is blocking storage — changes last for this session only");
    } else if (migrated) {
      toast(`Brought ${data.courses.length} classes over from the old version.`, {
        tone: "good",
        duration: 7000,
      });
    } else if (found) {
      setSyncMessage("Saved on this device");
    }
    // Intentionally runs once: this is the boot read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------------- */
  /* 2. Write to disk on every change                                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!state.ready) return;
    const ok = saveLocal(state.data);
    if (ok) setLastSavedAt(Date.now());
  }, [state.data, state.ready]);

  /* The theme lives in its own key so the pre-paint script can read it. */
  useEffect(() => {
    if (!state.ready) return;
    saveTheme(state.data.settings.theme);
  }, [state.data.settings.theme, state.ready]);

  /* ---------------------------------------------------------------------- */
  /* 3. Auth                                                                */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!firebaseConfigured) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    watchAuth((user) => {
      if (cancelled) return;
      setAuthReady(true);
      setProfile(
        user
          ? {
              name: user.displayName,
              email: user.email,
              photoURL: user.photoURL,
              uid: user.uid,
            }
          : EMPTY_PROFILE,
      );
    }).then((fn) => {
      if (cancelled) fn();
      else unsubscribe = fn;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* 4. First sync after sign-in, then a live listener                      */
  /* ---------------------------------------------------------------------- */

  const uid = profile.uid;

  useEffect(() => {
    if (!uid || !state.ready) {
      if (!uid) {
        setSync("local");
        setSyncMessage(
          localStorageAvailable() ? "Saved on this device" : "Session only — storage is blocked",
        );
      }
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    setSync("connecting");
    setSyncMessage("Loading your classes…");

    (async () => {
      try {
        const remoteRaw = await readStudent(uid);
        if (cancelled) return;

        const local = stateRef.current.data;
        const remote = remoteRaw ? hydrate(remoteRaw) : null;

        /*
         * Reconciliation, in plain terms:
         *   - Cloud has classes and is not older than what is on this device →
         *     the cloud wins, because it is what every other device sees.
         *   - Cloud is empty (a first sign-in, or guest work being adopted) →
         *     push what is on this device up.
         *   - Both have classes and this device is strictly newer → push up.
         */
        const remoteHasWork = (remote?.courses.length ?? 0) > 0;
        const localHasWork = local.courses.length > 0;
        const localIsNewer = remote ? local.updatedAt > remote.updatedAt : true;

        if (remote && remoteHasWork && !(localHasWork && localIsNewer)) {
          applyingRemote.current = true;
          dispatch({ type: "hydrate", data: remote });
          lastPushed.current = JSON.stringify(serialize(remote).courses);
          applyingRemote.current = false;

          if (localHasWork && local.courses.length !== remote.courses.length) {
            toast("Loaded the copy saved in your account.", { tone: "neutral" });
          }
        } else if (localHasWork || !remoteHasWork) {
          await writeStudent(uid, serialize(local));
          lastPushed.current = JSON.stringify(serialize(local).courses);
          if (localHasWork && !remoteHasWork) {
            toast(`Saved ${local.courses.length} classes to your account.`, { tone: "good" });
          }
        }

        if (cancelled) return;
        setSync("synced");
        setSyncMessage("Synced to your account");

        unsubscribe = await watchStudent(
          uid,
          (raw) => {
            const next = hydrate(raw);
            const currentCourses = JSON.stringify(stateRef.current.data.courses);
            if (JSON.stringify(next.courses) === currentCourses) return;

            applyingRemote.current = true;
            dispatch({ type: "hydrate", data: next });
            applyingRemote.current = false;
            setSync("synced");
            setSyncMessage("Updated from another device");
          },
          () => {
            setSync("offline");
            setSyncMessage("Sync paused — still saving on this device");
          },
        );

        if (cancelled) unsubscribe?.();
      } catch {
        if (cancelled) return;
        setSync("offline");
        setSyncMessage("Couldn't reach the cloud — saved on this device");
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // `state.ready` gates the first run; the rest is keyed on the signed-in user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, state.ready]);

  /* ---------------------------------------------------------------------- */
  /* 5. Push local changes up, debounced                                    */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!uid || !state.ready || applyingRemote.current) return;

    const payload = serialize(state.data);
    const fingerprint = JSON.stringify(payload.courses) + JSON.stringify(payload.settings);
    if (fingerprint === lastPushed.current) return;

    setSync("saving");
    setSyncMessage("Saving…");

    if (cloudTimer.current) clearTimeout(cloudTimer.current);
    cloudTimer.current = setTimeout(async () => {
      try {
        await writeStudent(uid, payload);
        lastPushed.current = fingerprint;
        setSync("synced");
        setSyncMessage("Synced to your account");
        setLastSavedAt(Date.now());
      } catch {
        setSync("offline");
        setSyncMessage("Couldn't reach the cloud — saved on this device");
      }
    }, CLOUD_DEBOUNCE_MS);

    return () => {
      if (cloudTimer.current) clearTimeout(cloudTimer.current);
    };
  }, [state.data, state.revision, state.ready, uid]);

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  const undo = useCallback(() => {
    const entry = stateRef.current.past[stateRef.current.past.length - 1];
    if (!entry) return;
    dispatch({ type: "undo" });
    toast(`Undid ${entry.label}.`, {
      tone: "neutral",
      action: { label: "Redo", onClick: () => dispatch({ type: "redo" }) },
    });
  }, [toast]);

  const redo = useCallback(() => {
    const entry = stateRef.current.future[0];
    if (!entry) return;
    dispatch({ type: "redo" });
    toast(`Redid ${entry.label}.`, { tone: "neutral" });
  }, [toast]);

  const signIn = useCallback(async () => {
    const result = await signInWithGoogle();
    if (!result.ok && result.reason !== "cancelled") {
      toast(result.message, { tone: "warn", duration: 6000 });
    }
  }, [toast]);

  const signOut = useCallback(async () => {
    await signOutOfGoogle();
    setProfile(EMPTY_PROFILE);
    setSync("local");
    setSyncMessage("Saved on this device");
    lastPushed.current = "";
    // The transcript stays on this device on purpose: signing out should not
    // look like the app deleted a student's work. Settings → Erase does that.
    toast("Signed out. Your classes are still on this device.", { tone: "neutral" });
  }, [toast]);

  const replaceAll = useCallback(
    (data: AppData, label: string) => {
      dispatch({ type: "hydrate", data });
      toast(label, { tone: "good" });
    },
    [toast],
  );

  const value = useMemo<StoreApi>(
    () => ({
      data: state.data,
      settings: state.data.settings,
      dispatch,
      ready: state.ready,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      undo,
      redo,
      profile,
      signedIn: Boolean(profile.uid),
      authReady,
      signIn,
      signOut,
      sync,
      syncMessage,
      lastSavedAt,
      replaceAll,
    }),
    [
      state.data,
      state.ready,
      state.past.length,
      state.future.length,
      undo,
      redo,
      profile,
      authReady,
      signIn,
      signOut,
      sync,
      syncMessage,
      lastSavedAt,
      replaceAll,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** Wipes local coursework. Exported for the Settings page's destructive action. */
export function eraseLocalData(): void {
  clearLocal();
}
