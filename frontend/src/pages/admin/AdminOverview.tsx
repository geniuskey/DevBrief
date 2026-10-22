import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";
import { ColumnChart, StatusBar } from "../../components/Charts";
import Icon from "../../components/Icon";
import { useToast } from "../../components/Toast";
import {
  Card,
  LoadError,
  PageHeader,
  Skeleton,
  Stat,
} from "../../components/ui";
import { relativeTime, shortDate } from "../../lib/format";
import { href } from "../../lib/router";
import { JobStatus } from "./AdminJobs";
import { actionLabel } from "./types";
import type { AdminJob, Audit, Overview, Policy } from "./types";

export default function AdminOverview() {
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [logs, setLogs] = useState<Audit[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let warned = false;
    const fail = (e: unknown) => {
      setFailed(true);
      if (!warned) toast.error(errorMessage(e));
      warned = true;
    };
    api<Overview>("/admin/overview").then(setData).catch(fail);
    api<AdminJob[]>("/admin/jobs?limit=6").then(setJobs).catch(fail);
    api<Audit[]>("/admin/audit-logs?limit=8").then(setLogs).catch(fail);
    api<Policy>("/admin/policy").then(setPolicy).catch(fail);
  }, [toast, attempt]);

  const s = data?.jobs_by_status ?? {};
  const totalJobs = Object.values(s).reduce((a, b) => a + b, 0);
  const finalizeRate =
    data && data.counts.reports
      ? Math.round((data.counts.finalized / data.counts.reports) * 100)
      : 0;
  const dep = policy?.deployment;

  return (
    <>
      <PageHeader
        eyebrow="관리자 콘솔"
        title="운영 개요"
        description="서비스 사용 현황과 작업 상태, 최근 활동을 한눈에 확인합니다."
      />
      {failed && (
        <LoadError
          onRetry={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      )}
      <div className="stats-grid">
        {data ? (
          <>
            <Stat
              icon="users"
              label="사용자"
              value={data.counts.active_users}
              hint={`전체 ${data.counts.users}명 · 팀 ${data.counts.teams}개`}
            />
            <Stat
              icon="file"
              label="보고서"
              value={data.counts.reports}
              hint={`초안 ${data.counts.drafts} · 확정 ${data.counts.finalized}`}
            />
            <Stat
              icon="check"
              label="확정률"
              value={`${finalizeRate}%`}
              hint={`업무 항목 ${data.counts.work_items}건`}
            />
            <Stat
              icon="alert"
              label="실패 작업"
              value={s.failed ?? 0}
              tone={s.failed ? "danger" : undefined}
              hint={`진행 중 ${(s.queued ?? 0) + (s.running ?? 0)}건`}
            />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} h={92} />)
        )}
      </div>

      <div className="admin-grid">
        <Card
          title="최근 14일 보고서 생성"
          description="KST 기준 일별 생성 건수"
        >
          {data ? (
            <ColumnChart
              label="최근 14일 일별 보고서 생성 건수"
              data={data.daily_reports.map((d) => ({
                key: d.date,
                label: shortDate(d.date),
                value: d.count,
              }))}
            />
          ) : (
            <Skeleton h={180} />
          )}
        </Card>
        <Card title="작업 상태" description={`누적 ${totalJobs}건`}>
          <StatusBar
            parts={[
              {
                key: "complete",
                label: "완료",
                value: s.complete ?? 0,
                tone: "good",
              },
              {
                key: "partial",
                label: "부분 완료",
                value: s.partial ?? 0,
                tone: "warning",
              },
              {
                key: "running",
                label: "진행·대기",
                value: (s.running ?? 0) + (s.queued ?? 0),
                tone: "info",
              },
              {
                key: "cancelled",
                label: "취소",
                value: s.cancelled ?? 0,
                tone: "muted",
              },
              {
                key: "failed",
                label: "실패",
                value: s.failed ?? 0,
                tone: "critical",
              },
            ]}
          />
          {dep && (
            <dl className="kv kv-compact">
              <div>
                <dt>수집 모드</dt>
                <dd>
                  {dep.adapter_mode === "fake"
                    ? "데모 (가상 데이터)"
                    : "사내 GHES"}
                </dd>
              </div>
              <div>
                <dt>인증</dt>
                <dd>
                  {dep.single_user_mode
                    ? "단일 사용자 (localhost)"
                    : dep.proxy_auth_mode === "oauth2_proxy"
                      ? "oauth2-proxy SSO"
                      : "서명 프록시"}
                </dd>
              </div>
              <div>
                <dt>LLM 모델</dt>
                <dd className="mono">{dep.llm_model}</dd>
              </div>
            </dl>
          )}
        </Card>
      </div>

      <div className="admin-grid">
        <Card
          title="최근 작업"
          padded={false}
          actions={
            <a className="text-link" href={href("/admin/jobs")}>
              작업 모니터 <Icon name="chevronRight" size={14} />
            </a>
          }
        >
          <ul className="activity">
            {jobs.map((j) => (
              <li key={j.job_id}>
                <JobStatus status={j.status} />
                <div>
                  <strong>{j.principal}</strong>
                  <small>
                    {j.start_date} ~ {j.end_date} · {j.login_count}명 · 저장소{" "}
                    {j.repository_count}개
                  </small>
                </div>
                <time>{relativeTime(j.created_at)}</time>
              </li>
            ))}
            {!jobs.length && <li className="muted">작업 기록이 없습니다.</li>}
          </ul>
        </Card>
        <Card
          title="최근 감사 기록"
          padded={false}
          actions={
            <a className="text-link" href={href("/admin/audit")}>
              전체 보기 <Icon name="chevronRight" size={14} />
            </a>
          }
        >
          <ul className="activity">
            {logs.map((l) => (
              <li key={l.id}>
                <span
                  className={`dot ${l.result === "ok" ? "dot-success" : "dot-danger"}`}
                />
                <div>
                  <strong>{actionLabel[l.action] ?? l.action}</strong>
                  <small>{l.principal}</small>
                </div>
                <time>{relativeTime(l.time)}</time>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
