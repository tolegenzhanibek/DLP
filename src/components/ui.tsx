import {
  forwardRef, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Level, ReviewStatus } from "../lib/types";
import { IconCheck, IconEye, IconEyeOff, IconShield, IconX } from "./icons";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary", loading, block, children, className = "", ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; block?: boolean }) {
  return (
    <button
      className={`btn btn-${variant}${block ? " btn-block" : ""} ${className}`}
      disabled={loading || rest.disabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner small /> : children}
    </button>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return <span className={`spinner${small ? " spinner-sm" : ""}`} role="status" aria-label="loading" />;
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  /** Small status icon shown inside the field, on the right (see InputStatus). */
  status?: ReactNode;
  trailing?: ReactNode;
  /** Visually hide the label (it stays for screen readers) and use it as placeholder. */
  hideLabel?: boolean;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, status, trailing, hideLabel, className = "", placeholder, ...rest }, ref,
) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "field-label"}>
        <span>{label}</span>
      </label>
      <div className={`field-control${error ? " has-error" : ""}`}>
        <input ref={ref} id={id} aria-invalid={Boolean(error) || undefined}
          placeholder={placeholder ?? (hideLabel ? label : undefined)} {...rest} />
        {status && <span className="field-status">{status}</span>}
        {trailing}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
});

/** Live-check indicator inside an input: spinner, green check or red cross. */
export function InputStatus({ state, label }: { state: "checking" | "ok" | "bad" | null; label?: string }) {
  if (!state) return null;
  if (state === "checking") return <Spinner small />;
  return (
    <span className={`input-status ${state}`} role="img" aria-label={label}>
      {state === "ok" ? <IconCheck /> : <IconX />}
    </span>
  );
}

export function TextArea({ label, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field-label"><span>{label}</span></label>
      <div className="field-control"><textarea id={id} {...rest} /></div>
    </div>
  );
}

export function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field-label"><span>{label}</span></label>
      <div className="field-control">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </div>
  );
}

/** Eye toggle. Pass the same `visible` state to several fields to share one eye. */
export function EyeButton({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="eye" onClick={onToggle}
      aria-label={visible ? t("common.hidePassword") : t("common.showPassword")} aria-pressed={visible}>
      {visible ? <IconEyeOff /> : <IconEye />}
    </button>
  );
}

export function PasswordField({ visible, onToggle, showEye = true, ...rest }: Omit<FieldProps, "type" | "trailing"> & {
  visible: boolean; onToggle: () => void; showEye?: boolean;
}) {
  return (
    <Field type={visible ? "text" : "password"} autoCapitalize="off" spellCheck={false}
      trailing={showEye ? <EyeButton visible={visible} onToggle={onToggle} /> : undefined} {...rest} />
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      className={`toggle${checked ? " on" : ""}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

/** One sheet for every edit dialog: [Cancel] Title [Done]. */
export function Modal({ open, title, onClose, onDone, doneLabel, doneLoading, doneDisabled, children }: {
  open: boolean; title: string; onClose: () => void; onDone?: () => void; doneLabel?: string;
  doneLoading?: boolean; doneDisabled?: boolean; children: ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="modal-head">
          <button type="button" className="link-btn" onClick={onClose}>{t("common.cancel")}</button>
          <h2>{title}</h2>
          {onDone ? (
            <button type="button" className="link-btn strong" onClick={onDone} disabled={doneLoading || doneDisabled}>
              {doneLoading ? <Spinner small /> : doneLabel ?? t("common.done")}
            </button>
          ) : <span />}
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function LoadingState() {
  const { t } = useTranslation();
  return <div className="state"><Spinner /><span className="sr-only">{t("common.loading")}</span></div>;
}

export function EmptyState({ text, icon, action }: { text: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <div className="state-icon">{icon ?? <IconShield />}</div>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="state state-error" role="alert">
      <p>{text ?? t("common.error")}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>{t("common.retry")}</Button>}
    </div>
  );
}

export function LevelBadge({ level, large }: { level: Level; large?: boolean }) {
  const { t } = useTranslation();
  return <span className={`level level-${level}${large ? " level-lg" : ""}`}>{t(`levels.${level}`)}</span>;
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const { t } = useTranslation();
  return <span className={`review review-${status}`}>{t(`review.${status}`)}</span>;
}

export function Avatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initials = name.slice(0, 2).toUpperCase();
  return url && !broken ? (
    <img className="avatar" src={url} alt="" width={size} height={size} onError={() => setBroken(true)}
      style={{ width: size, height: size }} />
  ) : (
    <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</span>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="var(--text)" />
        <path d="M16 6.5 9 9.2v5.6c0 4.6 3 8.3 7 9.7 4-1.4 7-5.1 7-9.7V9.2z" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="m12.6 15.6 2.4 2.4 4.6-4.8" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="logo-text">Senim</span>
    </span>
  );
}

let toastTimer: number | undefined;
export function toast(message: string, kind: "ok" | "error" = "ok") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast show toast-${kind}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el?.classList.remove("show"), 3200);
}
