import Icon from "./components/Icon";
import { ToastProvider } from "./components/Toast";
import { Banner, EmptyState, LinkButton, Spinner } from "./components/ui";
import Shell from "./layouts/Shell";
import type { NavItem } from "./layouts/Shell";
import { href, useRoute } from "./lib/router";
import { SessionProvider, useSession } from "./lib/session";
import AdminAudit from "./pages/admin/AdminAudit";
import AdminConnections from "./pages/admin/AdminConnections";
import AdminJobs from "./pages/admin/AdminJobs";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminPolicy from "./pages/admin/AdminPolicy";
import AdminUsers from "./pages/admin/AdminUsers";
import HistoryPage from "./pages/HistoryPage";
import HomePage from "./pages/HomePage";
import JobPage from "./pages/JobPage";
import NewReportPage from "./pages/NewReportPage";
import ReportPage from "./pages/ReportPage";
import TeamsPage from "./pages/TeamsPage";

const workspaceNav: NavItem[] = [
  { path: "/", label: "홈", icon: "home" },
  {
    path: "/reports",
    label: "보고서",
    icon: "file",
    match: (p) => p.startsWith("/reports") || p.startsWith("/jobs"),
  },
  { path: "/teams", label: "팀", icon: "users" },
];

const adminNav: NavItem[] = [
  { path: "/admin", label: "개요", icon: "grid" },
  { path: "/admin/connections", label: "연결 상태", icon: "plug" },
  { path: "/admin/jobs", label: "작업 모니터", icon: "activity" },
  { path: "/admin/users", label: "사용자", icon: "users" },
  { path: "/admin/audit", label: "감사 로그", icon: "shield" },
  { path: "/admin/policy", label: "정책·설정", icon: "sliders" },
];

function NotFound() {
  return (
    <EmptyState
      icon="search"
      title="페이지를 찾을 수 없습니다"
      action={
        <LinkButton href={href("/")} variant="primary" icon="home">
          홈으로
        </LinkButton>
      }
    >
      주소가 바뀌었거나 삭제된 화면입니다.
    </EmptyState>
  );
}

function Routes() {
  const route = useRoute();
  const { loading, error, isAdmin } = useSession();
  const [first, second] = route.segments;

  if (first === "admin") {
    const page = loading ? (
      <div className="center-pad">
        <Spinner />
      </div>
    ) : error ? (
      <Banner tone="danger" title="서버에 연결하지 못했습니다">
        {error}
      </Banner>
    ) : !isAdmin ? (
      <EmptyState
        icon="lock"
        title="관리자 권한이 필요합니다"
        action={
          <LinkButton href={href("/")} variant="primary">
            워크스페이스로 이동
          </LinkButton>
        }
      >
        관리자 계정은 배포 설정의 ADMIN_PRINCIPALS로 지정합니다.
      </EmptyState>
    ) : !second ? (
      <AdminOverview />
    ) : second === "connections" ? (
      <AdminConnections />
    ) : second === "jobs" ? (
      <AdminJobs />
    ) : second === "users" ? (
      <AdminUsers />
    ) : second === "audit" ? (
      <AdminAudit />
    ) : second === "policy" ? (
      <AdminPolicy />
    ) : (
      <NotFound />
    );
    return (
      <Shell
        variant="admin"
        path={route.path}
        nav={adminNav}
        footerLink={
          <a className="nav-item" href={href("/")}>
            <Icon name="back" size={18} />
            <span>워크스페이스로</span>
          </a>
        }
      >
        {page}
      </Shell>
    );
  }

  const page = !first ? (
    <HomePage />
  ) : first === "new" ? (
    <NewReportPage
      key={route.query.toString()}
      teamId={route.query.get("team") ?? ""}
    />
  ) : first === "reports" && second ? (
    <ReportPage key={second} reportId={second} />
  ) : first === "reports" ? (
    <HistoryPage />
  ) : first === "jobs" && second ? (
    <JobPage key={second} jobId={second} />
  ) : first === "teams" ? (
    <TeamsPage />
  ) : (
    <NotFound />
  );
  return (
    <Shell
      variant="workspace"
      path={route.path}
      nav={workspaceNav}
      primary={
        <LinkButton href={href("/new")} variant="primary" icon="plus">
          새 보고서
        </LinkButton>
      }
      footerLink={
        isAdmin && (
          <a className="nav-item" href={href("/admin")}>
            <Icon name="shield" size={18} />
            <span>관리자 콘솔</span>
          </a>
        )
      }
    >
      {error && (
        <Banner tone="danger" title="서버에 연결하지 못했습니다">
          {error}
        </Banner>
      )}
      {page}
    </Shell>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <Routes />
      </SessionProvider>
    </ToastProvider>
  );
}
