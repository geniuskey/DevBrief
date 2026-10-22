import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Icon from "../components/Icon";
import type { IconName } from "../components/Icon";
import { Avatar } from "../components/ui";
import { href } from "../lib/router";
import { useSession } from "../lib/session";
import { useTheme } from "../lib/theme";

export interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  match?: (path: string) => boolean;
}

export default function Shell({
  variant,
  path,
  nav,
  primary,
  footerLink,
  children,
}: {
  variant: "workspace" | "admin";
  path: string;
  nav: NavItem[];
  primary?: ReactNode;
  footerLink?: ReactNode;
  children: ReactNode;
}) {
  const { me, isDemo, capabilities } = useSession();
  const { dark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const active = (item: NavItem) =>
    item.match ? item.match(path) : path === item.path;
  return (
    <div className={`shell shell-${variant} ${open ? "drawer-open" : ""}`}>
      <header className="mobile-bar">
        <button
          type="button"
          className="icon-btn"
          aria-label="메뉴 열기"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? "x" : "menu"} size={20} />
        </button>
        <a className="brand" href={href(variant === "admin" ? "/admin" : "/")}>
          <span className="brand-mark">D</span>
          DevBrief
          {variant === "admin" && <span className="brand-tag">Admin</span>}
        </a>
        <span />
      </header>
      <aside className="sidebar">
        <a className="brand" href={href(variant === "admin" ? "/admin" : "/")}>
          <span className="brand-mark">D</span>
          <span className="brand-text">
            DevBrief
            <small>
              {variant === "admin" ? "관리자 콘솔" : "개발 주간보고"}
            </small>
          </span>
        </a>
        {primary && <div className="sidebar-primary">{primary}</div>}
        <nav aria-label={variant === "admin" ? "관리 메뉴" : "주 메뉴"}>
          {nav.map((item) => (
            <a
              key={item.path}
              href={href(item.path)}
              className={`nav-item ${active(item) ? "active" : ""}`}
              aria-current={active(item) ? "page" : undefined}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          {footerLink}
          <div className="env-chip">
            <span className={`dot ${isDemo ? "dot-warning" : "dot-success"}`} />
            {capabilities
              ? isDemo
                ? "데모 환경 · 외부 전송 없음"
                : "사내 GHES 연결"
              : "연결 확인 중"}
          </div>
          <div className="user-chip">
            <Avatar login={me?.name ?? "?"} size={30} />
            <div>
              <strong>{me?.name ?? "…"}</strong>
              <small>{me?.role === "admin" ? "관리자" : "작성자"}</small>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
              title={dark ? "라이트 모드" : "다크 모드"}
              onClick={toggle}
            >
              <Icon name={dark ? "sun" : "moon"} />
            </button>
          </div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <main className="main" id="main">
        <div className="main-inner">{children}</div>
      </main>
    </div>
  );
}
