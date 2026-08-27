import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import type { Difficulty } from "@/lib/types";
import { IconChevron } from "./Icons";

/**
 * The design-system primitives.
 *
 * Crisp white cards, thin green accents, 8–12px corners, restrained shadows.
 * Every one of these reads its colors from the tokens in `index.css`, so the
 * dark theme needs no component to know it exists.
 */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = "solid" | "outline" | "ghost" | "danger" | "subtle";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold whitespace-nowrap " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-45";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  solid:
    "bg-[var(--brand-solid)] text-[var(--brand-solid-ink)] border border-transparent " +
    "hover:bg-[var(--brand-solid-hover)] shadow-[var(--shadow-sm)]",
  outline:
    "bg-surface text-ink border border-line-strong hover:border-brand hover:text-brand hover:bg-brand-soft",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-surface-2 hover:text-ink",
  subtle: "bg-surface-2 text-ink border border-transparent hover:bg-surface-3",
  danger:
    "bg-transparent text-danger border border-line-strong hover:border-danger hover:bg-danger-soft",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-[12.5px]",
  md: "h-9.5 px-3.5 text-[13.5px]",
  lg: "h-11 px-5 text-[15px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a spinner and blocks interaction. */
  busy?: boolean;
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "outline", size = "md", busy, iconOnly, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || busy}
      className={cx(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        iconOnly && (size === "sm" ? "w-8 px-0" : size === "lg" ? "w-11 px-0" : "w-9.5 px-0"),
        className,
      )}
      {...rest}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
});

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0 [animation:spin_0.7s_linear_infinite]"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" fill="none" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  children,
  as: As = "section",
  ...rest
}: {
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "article" | "aside";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As
      className={cx(
        "rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow)]",
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  hint,
  action,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-start gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] leading-tight font-bold text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{hint}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form fields                                                                 */
/* -------------------------------------------------------------------------- */

const CONTROL =
  "w-full rounded-[10px] border border-line-strong bg-surface px-3 text-[14px] text-ink " +
  "transition-[border-color,box-shadow] placeholder:text-ink-3 " +
  "focus:border-brand-2 focus:outline-none focus:shadow-[var(--ring)] " +
  "disabled:opacity-50 disabled:bg-surface-2";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-bold tracking-[0.09em] text-ink-3 uppercase"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[12px] leading-snug text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(CONTROL, "h-10", className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx(CONTROL, "min-h-20 resize-y py-2", className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cx(CONTROL, "h-10 cursor-pointer appearance-none pr-9", className)}
          {...rest}
        >
          {children}
        </select>
        <IconChevron
          size={15}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rotate-90 text-ink-3"
        />
      </div>
    );
  },
);

/* -------------------------------------------------------------------------- */
/* Segmented control                                                           */
/* -------------------------------------------------------------------------- */

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx(
        "inline-flex items-center gap-0.5 rounded-[11px] border border-line bg-surface-2 p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cx(
              "rounded-[9px] font-semibold whitespace-nowrap transition-all duration-150",
              size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
              active
                ? "bg-surface text-brand shadow-[var(--shadow-sm)]"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Switch                                                                      */
/* -------------------------------------------------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  id?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        id={inputId}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-45",
          checked
            ? "border-transparent bg-[var(--brand-solid)]"
            : "border-line-strong bg-surface-2",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
      <label htmlFor={inputId} className="min-w-0 cursor-pointer select-none">
        <span className="block text-[14px] leading-tight font-semibold text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{hint}</span> : null}
      </label>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                      */
/* -------------------------------------------------------------------------- */

export type BadgeTone = "brand" | "neutral" | "warn" | "danger" | "info" | "outline";

const BADGE_TONES: Record<BadgeTone, string> = {
  brand: "bg-brand-soft text-brand border-transparent",
  neutral: "bg-surface-2 text-ink-2 border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
  outline: "bg-transparent text-ink-2 border-line-strong",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-[0.02em] whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Difficulty badge — AP in forest green, Honors in the lighter green, Regular
 * in gray, exactly as the palette calls for.
 */
export function DifficultyBadge({
  difficulty,
  bump,
  className,
}: {
  difficulty: Difficulty;
  bump?: number;
  className?: string;
}) {
  const style =
    difficulty === "AP"
      ? { color: "var(--lvl-ap)", background: "var(--lvl-ap-soft)" }
      : difficulty === "Honors"
        ? { color: "var(--lvl-honors)", background: "var(--lvl-honors-soft)" }
        : { color: "var(--lvl-regular)", background: "var(--lvl-regular-soft)" };

  const short = difficulty === "Regular" ? "REG" : difficulty === "Honors" ? "HON" : "AP";

  return (
    <span
      style={style}
      title={
        bump === undefined
          ? difficulty
          : `${difficulty} — ${bump > 0 ? `+${bump}` : bump} points added before conversion`
      }
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-extrabold tracking-[0.05em]",
        className,
      )}
    >
      {short}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                    */
/* -------------------------------------------------------------------------- */

export function Progress({
  value,
  tone = "brand",
  height = 8,
  className,
  label,
}: {
  /** 0 to 1. */
  value: number;
  tone?: "brand" | "warn" | "danger";
  height?: number;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  const fill =
    tone === "warn"
      ? "linear-gradient(90deg, var(--warn), color-mix(in oklab, var(--warn) 70%, white))"
      : tone === "danger"
        ? "var(--danger)"
        : "linear-gradient(90deg, var(--brand-solid), var(--brand-2))";

  return (
    <div
      className={cx("w-full overflow-hidden rounded-full bg-surface-3", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, background: fill }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                 */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-14 text-center", className)}>
      {icon ? (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
          {icon}
        </div>
      ) : null}
      <h3 className="text-[16px] font-bold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ink-2">{body}</p>
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Animated number                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Eases a number to its new value instead of snapping. Respects
 * `prefers-reduced-motion` by skipping straight to the target.
 */
export function AnimatedNumber({
  value,
  decimals = 2,
  className,
  duration = 620,
}: {
  value: number | null;
  decimals?: number;
  className?: string;
  duration?: number;
}) {
  const [shown, setShown] = useState(value ?? 0);
  const from = useRef(value ?? 0);
  const frame = useRef(0);

  useEffect(() => {
    if (value === null || !Number.isFinite(value)) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      from.current = value;
      setShown(value);
      return;
    }

    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;
    if (Math.abs(delta) < 10 ** -(decimals + 2)) {
      setShown(value);
      return;
    }

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo — quick to arrive, settles gently.
      const eased = t === 1 ? 1 : 1 - 2 ** (-10 * t);
      setShown(origin + delta * eased);
      if (t < 1) frame.current = requestAnimationFrame(step);
      else from.current = value;
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [value, decimals, duration]);

  if (value === null || !Number.isFinite(value)) {
    return <span className={className}>—</span>;
  }
  return <span className={className}>{shown.toFixed(decimals)}</span>;
}

/* -------------------------------------------------------------------------- */
/* Keyboard hint                                                               */
/* -------------------------------------------------------------------------- */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong bg-surface-2 px-1.5 font-sans text-[10.5px] font-bold text-ink-2">
      {children}
    </kbd>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                    */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden="true" />;
}
