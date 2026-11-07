import Link from "next/link";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Dell '96 primitives: sharp corners, hairline borders, hard shadows. */
/* ------------------------------------------------------------------ */

const TINT_CLASS = {
  olive: "bg-tint-olive",
  sage: "bg-tint-sage",
  salmon: "bg-tint-salmon",
  peach: "bg-tint-peach",
  lime: "bg-tint-lime",
  sky: "bg-tint-sky",
  steel: "bg-tint-steel",
  periwinkle: "bg-tint-periwinkle",
} as const;

export type Tint = keyof typeof TINT_CLASS;

export function tintClass(tint: Tint): string {
  return TINT_CLASS[tint];
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Section eyebrow: Arial Black title on a flat tint block. */
export function Eyebrow({
  tint,
  children,
  size = "lg",
  className,
}: {
  tint: Tint;
  children: ReactNode;
  size?: "lg" | "md";
  className?: string;
}) {
  return (
    <h1
      className={cx(
        "font-display font-black leading-none text-ink uppercase",
        size === "lg" ? "px-4 py-[18px] text-[30px]" : "px-4 py-3.5 text-[22px]",
        tintClass(tint),
        className,
      )}
    >
      {children}
    </h1>
  );
}

/** White title bar with a hairline underneath — top of every ribbon card. */
export function CardTitleBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("bg-canvas border-b border-ink px-3 py-1.5 flex gap-2.5 items-baseline flex-wrap", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <span className="font-ui font-bold text-sm">{children}</span>;
}

export function CardSub({ children }: { children: ReactNode }) {
  return <span className="font-body text-xs text-[#333]">{children}</span>;
}

/** Bordered card shell. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("border border-ink relative", className)}>{children}</div>;
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="bg-canvas border border-ink font-ui font-bold text-[11px] px-2 py-[3px] whitespace-nowrap">
      {children}
    </span>
  );
}

export function ChipRow({ chips, className }: { chips: string[]; className?: string }) {
  return (
    <div className={cx("flex gap-1.5 flex-wrap", className)}>
      {chips.map((chip) => (
        <Chip key={chip}>{chip}</Chip>
      ))}
    </div>
  );
}

/** Yellow hand-cut GIF-style sticker with hard shadow. */
export function Sticker({
  children,
  rotate = 0,
  className,
}: {
  children: ReactNode;
  rotate?: number;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-block bg-sticker border border-ink font-ui font-bold text-[11px] px-2 py-[3px] shadow-hard text-ink whitespace-nowrap",
        className,
      )}
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    >
      {children}
    </span>
  );
}

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  href?: string;
  className?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
};

/** Square button. Renders a Link when href is given. */
export function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  className,
  type = "button",
  onClick,
  disabled,
}: ButtonProps) {
  const classes = cx(
    "inline-flex items-center justify-center border border-ink font-ui font-bold uppercase text-center leading-none cursor-pointer",
    "hover:bg-primary hover:text-canvas hover:border-ink transition-none disabled:opacity-60 disabled:cursor-wait",
    size === "md" ? "text-xs px-4 py-2" : "text-[11px] px-2.5 py-1.5",
    variant === "primary" ? "bg-ink text-canvas" : "bg-canvas text-ink",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** Striped placeholder standing in for a beveled GIF photograph. */
export function Photo({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cx(
        "photo-stripes border border-ink shadow-hard-lg flex items-center justify-center text-center font-mono text-[11px] text-[#666] p-2",
        className,
      )}
      role="img"
      aria-label={label}
    >
      {label}
    </div>
  );
}

/** Red round award-seal used for the Purchase Confidence Score. */
export function ConfidenceSeal({ score }: { score: number }) {
  return (
    <div
      className="w-[74px] h-[74px] rounded-full bg-primary border-2 border-ink text-canvas flex flex-col items-center justify-center shadow-hard shrink-0"
      aria-label={`Purchase confidence ${score} out of 100`}
    >
      <span className="font-display font-black text-2xl leading-none">{score}</span>
      <span className="font-ui font-bold text-[8px] tracking-[.04em]">CONFIDENCE</span>
    </div>
  );
}

/** Hairline confidence bar with percentage label. */
export function ConfidenceBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-[70px] h-2.5 border border-ink bg-canvas">
        <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-ui font-bold text-[11px]">{pct}%</span>
    </div>
  );
}

/** Single-use red CTA block (max one per page). */
export function CtaBlock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("bg-primary text-canvas border border-ink p-4 font-body text-sm leading-[1.4]", className)}>
      {children}
    </div>
  );
}

/* Form chrome: 1px border, square corners, Times body text (spec: text-input). */
export const INPUT =
  "border border-ink px-2.5 py-[7px] font-body text-sm text-ink bg-canvas outline-none focus:bg-sticker/30";
export const LABEL = "font-ui font-bold text-[11px] uppercase";

/* Table chrome */
export const TH = "px-3 py-1.5 text-left font-ui font-bold text-[11px] border-b border-ink whitespace-nowrap";
export const TD = "px-3 py-1.5 border-b border-ink font-body text-[13px] align-middle";
export const TD_BOLD = "px-3 py-1.5 border-b border-ink font-ui font-bold text-[13px] align-middle";
