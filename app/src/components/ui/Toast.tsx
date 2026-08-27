import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Toasts.
 *
 * Deliberately plain: a message, an optional single action (almost always
 * "Undo"), and a timer. They stack bottom-left on desktop and full-width at the
 * bottom on phones, where they clear the mobile nav bar.
 */

export type ToastTone = "neutral" | "good" | "warn" | "danger";

export interface ToastOptions {
  tone?: ToastTone;
  /** Milliseconds on screen. Pass `0` to require a dismissal. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface Toast extends ToastOptions {
  id: number;
  message: string;
}

interface ToastApi {
  toast: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const DEFAULT_DURATION = 4200;
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      const duration = options.duration ?? DEFAULT_DURATION;

      setToasts((list) => [...list, { id, message, ...options }].slice(-MAX_VISIBLE));

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  // Clear every pending timer if the provider ever unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 bottom-20 z-[80] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-5 sm:left-5 sm:max-w-sm sm:items-start"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONE_ACCENT: Record<ToastTone, string> = {
  neutral: "bg-brand",
  good: "bg-brand-2",
  warn: "bg-warn",
  danger: "bg-danger",
};

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const tone = toast.tone ?? "neutral";

  return (
    <div
      role="status"
      className="anim-pop pointer-events-auto flex w-full items-center gap-3 overflow-hidden rounded-xl border border-line bg-surface py-2.5 pr-2.5 pl-0 shadow-[var(--shadow-lg)]"
    >
      <span className={`h-9 w-1 shrink-0 rounded-r-full ${TONE_ACCENT[tone]}`} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink">{toast.message}</p>

      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          className="shrink-0 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-semibold text-brand transition-colors hover:border-brand hover:bg-brand-soft"
        >
          {toast.action.label}
        </button>
      ) : null}

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path
            d="M3 3l8 8M11 3l-8 8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
