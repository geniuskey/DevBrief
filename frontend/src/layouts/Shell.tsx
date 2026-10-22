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

function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M9 8h7a8 8 0 0 1 0 16H9zm4 4v8h3a4 4 0 0 0 0-8z"
      />
    </svg>
  );
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
  const admin = variant === "admin";
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
        <a className="brand" href={href(admin ? "/admin" : "/")}>
          <BrandMark size={24} />
          DevBrief
          {admin && <span className="brand-tag">관리자</span>}
        </a>
        <span />
      </header>
      <aside className="sidebar">
        <a className="brand" href={href(admin ? "/admin" : "/")}>
          <BrandMark />
          <span className="brand-text">
            DevBrief
            <small>{admin ? "관리자 콘솔" : "개발 주간보고"}</small>
          </span>
        </a>
        {primary && <div className="sidebar-primary">{primary}</div>}
        <nav aria-label={admin ? "관리 메뉴" : "주 메뉴"}>
          <span className="nav-label">{admin ? "관리" : "워크스페이스"}</span>
          {nav.map((item) => (
            <a
              key={item.path}
              href={href(item.path)}
              className={`nav-item ${active(item) ? "active" : ""}`}
              aria-current={active(item) ? "page" : undefined}
            >
              <Icon name={item.icon} size={16} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          {footerLink}
          <div className="env-chip">
            <span className={`dot ${isDemo ? "dot-warning" : "dot-success"}`} />
            {capabilities ? (
              isDemo ? (
                <span>
                  <strong>데모 환경</strong> · 외부 전송 없음
                </span>
              ) : (
                <span>
                  <strong>사내 GHES</strong> 연결
                </span>
              )
            ) : (
              "연결 확인 중"
            )}
          </div>
          <div className="user-chip">
            <Avatar login={me?.name ?? "?"} size={28} />
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
