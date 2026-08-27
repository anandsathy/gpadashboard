/**
 * Firebase project configuration.
 *
 * The web API key is a public project identifier, not a secret — it ships in
 * every Firebase web app and is safe in a git repository. What actually protects
 * a student's grades is the Firestore rule in `firestore.rules` (a signed-in
 * user can read and write `students/{their own uid}` and nothing else) together
 * with the Authorized Domains list in Firebase Console → Authentication.
 *
 * Every value can be overridden with a `VITE_FIREBASE_*` environment variable,
 * which is how you would point a fork at a different project without touching
 * the source.
 */

const env = import.meta.env;

export const FIREBASE_CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyDPiWRbd-qO6VUP7wjQJuzioVlC-d_3SKo",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "gpaproject-368dc.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "gpaproject-368dc",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "gpaproject-368dc.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "89130836764",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:89130836764:web:d7346271e2ea92d31fd0d9",
} as const;

/** The app runs perfectly well with no Firebase at all — it just stays local. */
export const firebaseConfigured = Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

/** Firestore collection holding one document per student, keyed by auth uid. */
export const STUDENTS_COLLECTION = "students";
