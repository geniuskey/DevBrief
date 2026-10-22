import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";
import Icon from "../../components/Icon";
import { useToast } from "../../components/Toast";
import {
  Avatar,
  Badge,
  Banner,
  Card,
  LoadError,
  PageHeader,
  Skeleton,
} from "../../components/ui";
import { relativeTime } from "../../lib/format";
import type { AdminUser } from "./types";

export default function AdminUsers() {
  const toast = useToast();
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    api<AdminUser[]>("/admin/users")
      .then(setRows)
      .catch((e) => {
        setFailed(true);
        toast.error(errorMessage(e));
      });
  }, [toast, attempt]);
  const retry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };
  const visible = (rows ?? []).filter(
    (u) =>
      u.principal.toLowerCase().includes(q.toLowerCase()) ||
      u.display_name.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="관리자 콘솔"
        title="사용자"
        description="DevBrief에 로그인한 적이 있는 사용자와 활동 현황입니다."
      />
      <Banner tone="info">
        사용자는 SSO 첫 접속 시 자동 등록됩니다. 관리자 권한은 배포 설정의{" "}
        <code>ADMIN_PRINCIPALS</code>, 저장소 접근은 <code>REPO_ACL_JSON</code>
        으로 관리합니다.
      </Banner>
      {failed && <LoadError onRetry={retry} />}
      <Card padded={false}>
        <div className="toolbar-row">
          <label className="search-input">
            <Icon name="search" />
            <input
              aria-label="사용자 검색"
              placeholder="이름 또는 ID 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <span className="muted small">
            {rows ? `${visible.length}명` : ""}
          </span>
        </div>
        {!rows ? (
          !failed && (
            <div className="pad stack">
              <Skeleton h={40} />
              <Skeleton h={40} />
            </div>
          )
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>사용자</th>
                  <th>권한</th>
                  <th>상태</th>
                  <th className="num">보고서</th>
                  <th>최근 활동</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="user-cell">
                        <Avatar login={u.principal} size={28} />
                        <span>
                          <strong>{u.display_name}</strong>
                          <small className="muted mono">{u.principal}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      {u.role === "admin" ? (
                        <Badge tone="brand" icon="shield">
                          관리자
                        </Badge>
                      ) : (
                        <Badge>작성자</Badge>
                      )}
                    </td>
                    <td>
                      {u.active ? (
                        <span className="status-text status-success">
                          <span className="dot dot-success" /> 활성
                        </span>
                      ) : (
                        <span className="status-text muted">
                          <span className="dot" /> 비활성
                        </span>
                      )}
                    </td>
                    <td className="num">{u.report_count}</td>
                    <td className="nowrap">{relativeTime(u.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
