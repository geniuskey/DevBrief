import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Icon from "./Icon";
import type { IconName } from "./Icon";
import { avatarHue, initials } from "../lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size,
  icon,
  iconAfter,
  loading,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "lg";
  icon?: IconName;
  iconAfter?: IconName;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${size ? `btn-${size}` : ""} ${className ?? ""}`}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading ? <Spinner /> : icon && <Icon name={icon} />}
      {children}
      {iconAfter && !loading && <Icon name={iconAfter} />}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "secondary",
  size,
  icon,
  children,
  download,
}: {
  href: string;
  variant?: Variant;
  size?: "sm" | "lg";
  icon?: IconName;
  children: ReactNode;
  download?: boolean;
}) {
  return (
    <a
      href={href}
      className={`btn btn-${variant} ${size ? `btn-${size}` : ""}`}
      download={download || undefined}
    >
      {icon && <Icon name={icon} />}
      {children}
    </a>
  );
}

export type Tone =
  "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export function Badge({
  tone = "neutral",
  icon,
  dot,
  children,
}: {
  tone?: Tone;
  icon?: IconName;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="dot" />}
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function Skeleton({ h = 16, w }: { h?: number; w?: string }) {
  return <span className="skeleton" style={{ height: h, width: w }} />;
}

export function Card({
  children,
  className,
  title,
  description,
  actions,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
}) {
  return (
    <section
      className={`card ${padded ? "" : "card-flush"} ${className ?? ""}`}
    >
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon = "file",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={22} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Banner({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const icon: IconName =
    tone === "success" ? "check" : tone === "info" ? "info" : "alert";
  return (
    <div className={`banner banner-${tone}`}>
      <Icon name={icon} size={18} />
      <div className="banner-body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Banner
      tone="danger"
      title="데이터를 불러오지 못했습니다"
      action={
        <Button size="sm" icon="refresh" onClick={onRetry}>
          다시 시도
        </Button>
      }
    >
      잠시 후 다시 시도하세요.
    </Banner>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: Tone;
}) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""}`}>
      <div className="stat-label">
        {icon && <Icon name={icon} size={14} />}
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Avatar({ login, size = 24 }: { login: string; size?: number }) {
  const hue = avatarHue(login);
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        ["--hue" as string]: hue,
      }}
      title={login}
      aria-hidden="true"
    >
      {initials(login)}
    </span>
  );
}

export function AvatarStack({
  logins,
  max = 4,
}: {
  logins: string[];
  max?: number;
}) {
  return (
    <span className="avatar-stack" aria-label={logins.join(", ")}>
      {logins.slice(0, max).map((l) => (
        <Avatar key={l} login={l} />
      ))}
      {logins.length > max && (
        <span className="avatar avatar-more">+{logins.length - max}</span>
      )}
    </span>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className={value === item.value ? "active" : ""}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="tab-count">{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="radio"
          aria-checked={value === item.value}
          className={value === item.value ? "active" : ""}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Callers pass inline handlers; a ref keeps focus setup tied to `open` only.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current
      ?.querySelector<HTMLElement>("input, textarea, select, button")
      ?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key !== "Tab" || !ref.current) return;
      // Keep keyboard focus inside the modal.
      const items = [
        ...ref.current.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])",
        ),
      ];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = ref.current.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        className={`dialog ${wide ? "dialog-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <header>
          <div>
            <h2 id="dialog-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="닫기"
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "brand",
  label,
}: {
  value: number;
  tone?: Tone;
  label?: string;
}) {
  return (
    <div
      className={`progress-track progress-${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
