import type { FirebaseApp } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import type { Firestore, Unsubscribe } from "firebase/firestore";

import type { AppData } from "@/lib/types";
import { FIREBASE_CONFIG, STUDENTS_COLLECTION, firebaseConfigured } from "./config";

/**
 * A thin, lazily-loaded Firebase wrapper.
 *
 * The SDK is imported dynamically so it never lands in the first paint, and so
 * that a blocked CDN, an offline device, or a project that was never configured
 * degrades to local-only mode instead of a white screen. Every export here
 * either resolves or reports a reason — none of them throw at the caller.
 */

interface Bundle {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let bundlePromise: Promise<Bundle | null> | null = null;

async function load(): Promise<Bundle | null> {
  if (!firebaseConfigured) return null;

  const [{ initializeApp, getApps, getApp }, authMod, dbMod] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/firestore"),
  ]);

  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  const auth = authMod.getAuth(app);

  // Offline persistence means a reload on a train still shows your grades.
  // It fails in private windows and in some embedded webviews, so the plain
  // in-memory Firestore is the fallback rather than an error.
  let db: Firestore;
  try {
    db = dbMod.initializeFirestore(app, {
      localCache: dbMod.persistentLocalCache({
        tabManager: dbMod.persistentMultipleTabManager(),
      }),
    });
  } catch {
    db = dbMod.getFirestore(app);
  }

  return { app, auth, db };
}

export function firebase(): Promise<Bundle | null> {
  if (!bundlePromise) {
    bundlePromise = load().catch((error) => {
      console.warn("[gpa] Firebase unavailable — staying local", error);
      return null;
    });
  }
  return bundlePromise;
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export async function watchAuth(handler: (user: User | null) => void): Promise<Unsubscribe> {
  const fb = await firebase();
  if (!fb) {
    handler(null);
    return () => {};
  }
  const { onAuthStateChanged } = await import("firebase/auth");
  return onAuthStateChanged(fb.auth, handler, () => handler(null));
}

export type SignInOutcome =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "unconfigured" | "unavailable" | "failed"; message: string };

export async function signInWithGoogle(): Promise<SignInOutcome> {
  const fb = await firebase();
  if (!fb) {
    return {
      ok: false,
      reason: firebaseConfigured ? "unavailable" : "unconfigured",
      message: firebaseConfigured
        ? "Couldn't reach Firebase. Your work is still saved on this device."
        : "Google sign-in isn't configured for this build.",
    };
  }

  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import("firebase/auth");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    await signInWithPopup(fb.auth, provider);
    return { ok: true };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";

    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      return { ok: false, reason: "cancelled", message: "Sign-in cancelled." };
    }

    // Plenty of browsers block the popup outright. Redirect is the way through.
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      try {
        await signInWithRedirect(fb.auth, provider);
        return { ok: true };
      } catch {
        /* fall through to the generic failure below */
      }
    }

    if (code === "auth/unauthorized-domain") {
      return {
        ok: false,
        reason: "failed",
        message: "This domain isn't on the Firebase authorized list yet.",
      };
    }

    return { ok: false, reason: "failed", message: "Sign-in failed. You can keep working locally." };
  }
}

export async function signOutOfGoogle(): Promise<void> {
  const fb = await firebase();
  if (!fb) return;
  const { signOut } = await import("firebase/auth");
  await signOut(fb.auth).catch(() => {});
}

/* -------------------------------------------------------------------------- */
/* Firestore                                                                   */
/* -------------------------------------------------------------------------- */

export async function readStudent(uid: string): Promise<unknown | null> {
  const fb = await firebase();
  if (!fb) return null;
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(fb.db, STUDENTS_COLLECTION, uid));
  return snap.exists() ? snap.data() : null;
}

export async function writeStudent(uid: string, data: AppData): Promise<void> {
  const fb = await firebase();
  if (!fb) return;
  const { doc, setDoc } = await import("firebase/firestore");
  await setDoc(doc(fb.db, STUDENTS_COLLECTION, uid), data, { merge: true });
}

/**
 * Live updates from other devices.
 *
 * Writes this tab just made come back through the same listener, so
 * `hasPendingWrites` is checked before handing anything upstream — otherwise
 * every keystroke would round-trip and fight the local state.
 */
export async function watchStudent(
  uid: string,
  onData: (data: unknown) => void,
  onError: (error: unknown) => void,
): Promise<Unsubscribe> {
  const fb = await firebase();
  if (!fb) return () => {};
  const { doc, onSnapshot } = await import("firebase/firestore");

  return onSnapshot(
    doc(fb.db, STUDENTS_COLLECTION, uid),
    (snap) => {
      if (!snap.exists()) return;
      if (snap.metadata.hasPendingWrites) return;
      onData(snap.data());
    },
    onError,
  );
}
