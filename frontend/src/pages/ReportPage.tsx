import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../api/client";
import Icon from "../components/Icon";
import { CoverageBadge, StatusBadge } from "../components/ReportList";
import { useToast } from "../components/Toast";
import WorkItemCard from "../components/WorkItemCard";
import {
  Avatar,
  Banner,
  Button,
  Card,
  EmptyState,
  LinkButton,
  Skeleton,
  Stat,
  Tabs,
} from "../components/ui";
import {
  daysBetween,
  fullDateTime,
  periodLabel,
  reportTypeLabel,
} from "../lib/format";
import { Markdown } from "../lib/markdown";
import { href } from "../lib/router";
import { useSession } from "../lib/session";
import type { Report, WorkItem } from "../types";

type Tab = "items" | "preview" | "scope";

export default function ReportPage({ reportId }: { reportId: string }) {
  const { teams, repoName } = useSession();
  const toast = useToast();
  const [report, setReport] = useState<Report | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("items");
  const [person, setPerson] = useState("");
  const [category, setCategory] = useState("");
  const [hideExcluded, setHideExcluded] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string[]>([]);
  const onEditing = useCallback(
    (id: string, on: boolean) =>
      setEditing((all) => (on ? [...all, id] : all.filter((x) => x !== id))),
    [],
  );

  const load = useCallback(async () => {
    const next = await api<Report>(`/reports/${encodeURIComponent(reportId)}`);
    setReport(next);
    return next;
  }, [reportId]);

  useEffect(() => {
    load().catch((e) => {
      setMissing(true);
      toast.error(errorMessage(e));
    });
  }, [load, toast]);

  const people = useMemo(
    () =>
      report
        ? [
            ...new Set(
              report.work_items.flatMap((i) =>
                i.contributors.map((c) => c.login),
              ),
            ),
          ]
        : [],
    [report],
  );
  const categories = useMemo(
    () =>
      report ? [...new Set(report.work_items.map((i) => i.category))] : [],
    [report],
  );

  if (missing)
    return (
      <EmptyState
        icon="search"
        title="보고서를 찾을 수 없습니다"
        action={
          <LinkButton href={href("/reports")} variant="primary">
            보고서 목록
          </LinkButton>
        }
      >
        삭제되었거나 접근 권한이 없는 보고서입니다.
      </EmptyState>
    );
  if (!report)
    return (
      <div className="stack">
        <Skeleton h={28} w="40%" />
        <Skeleton h={18} w="60%" />
        <div className="stats-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={86} />
          ))}
        </div>
        <Skeleton h={180} />
        <Skeleton h={180} />
      </div>
    );

  const draft = report.status === "draft";
  const { coverage } = report;
  const included = report.work_items.filter((i) => !i.excluded);
  const excludedCount = report.work_items.length - included.length;
  const visible = report.work_items.filter(
    (i) =>
      (!person || i.contributors.some((c) => c.login === person)) &&
      (!category || i.category === category) &&
      (!hideExcluded || !i.excluded),
  );
  const team = teams.find((t) => t.id === report.request.team_id);
  const title = `${team?.name ?? `${reportTypeLabel(report.request.type)}`} 개발 주간보고`;
  const notices = report.warnings.filter((w) => w.code !== "COVERAGE_BOUNDARY");
  const boundary = report.warnings.find((w) => w.code === "COVERAGE_BOUNDARY");

  async function saveItem(item: WorkItem, patch: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/reports/${report!.id}/work-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: item.version, ...patch }),
      });
      setReviewed(false);
      await load();
      toast.success(
        "excluded" in patch
          ? patch.excluded
            ? "보고서에서 제외했습니다."
            : "보고서에 다시 포함했습니다."
          : "수정 내용을 저장했습니다.",
      );
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      await load().catch(() => undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    setBusy(true);
    try {
      await api(`/reports/${report!.id}/finalize`, {
        method: "POST",
        body: JSON.stringify({ revision: report!.revision }),
      });
      await load();
      toast.success("보고서를 확정했습니다.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(report!.markdown);
      toast.success("Markdown을 복사했습니다.");
    } catch {
      toast.error("클립보드 접근이 차단되었습니다. MD 다운로드를 이용하세요.");
    }
  }

  return (
    <div className="report-page">
      <nav className="breadcrumb" aria-label="위치">
        <a href={href("/reports")}>보고서</a>
        <Icon name="chevronRight" size={14} />
        <span>
          {periodLabel(report.request.start_date, report.request.end_date)}
        </span>
      </nav>
      <div className="page-header">
        <div>
          <div className="title-row">
            <h1>{title}</h1>
            <StatusBadge status={report.status} />
            <CoverageBadge status={coverage.status} />
          </div>
          <div className="meta-row">
            <span>
              <Icon name="calendar" size={14} />
              {periodLabel(
                report.request.start_date,
                report.request.end_date,
              )}{" "}
              ·{" "}
              {daysBetween(report.request.start_date, report.request.end_date)}
              일
            </span>
            <span className="people">
              <Icon name="users" size={14} />
              {report.request.github_logins.join(", ")}
            </span>
            <span>
              <Icon name="history" size={14} />
              수정 v{report.revision}
            </span>
          </div>
        </div>
        <div className="page-actions">
          <Button icon="copy" onClick={() => void copy()}>
            Markdown 복사
          </Button>
          <LinkButton
            href={`/api/v1/reports/${report.id}/export?format=md`}
            icon="download"
          >
            MD 다운로드
          </LinkButton>
          <LinkButton
            href={`/api/v1/reports/${report.id}/export?format=html`}
            icon="download"
          >
            HTML 다운로드
          </LinkButton>
        </div>
      </div>

      {!draft && (
        <Banner tone="success" title="확정된 보고서입니다">
          더 이상 수정할 수 없습니다. 내보내기로 공유하세요.
        </Banner>
      )}
      {coverage.repositories_failed > 0 && (
        <Banner
          tone="warning"
          title={`${coverage.repositories_failed}개 저장소를 수집하지 못했습니다`}
          action={
            <Button size="sm" variant="ghost" onClick={() => setTab("scope")}>
              수집 범위 보기
            </Button>
          }
        >
          {coverage.failed_repos.join(", ")} — 해당 저장소의 활동은 보고서에
          포함되지 않았습니다.
        </Banner>
      )}
      {notices
        .filter((w) => w.code !== "REPO_NOT_ACCESSIBLE")
        .map((w, i) => (
          <Banner key={i} tone="warning">
            {w.message_ko ?? w.code} {w.repository}
          </Banner>
        ))}

      <div className="stats-grid stats-6">
        <Stat
          label="포함 업무"
          value={included.length}
          hint={excludedCount ? `${excludedCount}건 제외` : undefined}
        />
        <Stat label="기여자" value={people.length} />
        <Stat label="PR" value={coverage.counts?.pull_requests ?? "–"} />
        <Stat label="커밋" value={coverage.counts?.commits ?? "–"} />
        <Stat label="리뷰" value={coverage.counts?.reviews ?? "–"} />
        <Stat
          label="저장소"
          value={`${coverage.repositories_succeeded}/${coverage.repositories_requested}`}
          tone={coverage.repositories_failed ? "warning" : undefined}
        />
      </div>

      <Tabs
        label="보고서 보기"
        value={tab}
        onChange={setTab}
        items={[
          {
            value: "items",
            label: "업무 항목",
            count: report.work_items.length,
          },
          { value: "preview", label: "문서 미리보기" },
          { value: "scope", label: "수집 범위" },
        ]}
      />

      {tab === "items" && (
        <div className="tab-panel">
          <div className="filter-bar">
            <div className="chip-row" role="group" aria-label="기여자별 보기">
              <button
                type="button"
                className={`chip ${!person ? "active" : ""}`}
                onClick={() => setPerson("")}
              >
                팀 전체
              </button>
              {people.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`chip ${person === p ? "active" : ""}`}
                  onClick={() => setPerson(person === p ? "" : p)}
                >
                  <Avatar login={p} size={18} />
                  {p}
                </button>
              ))}
            </div>
            <div className="filter-side">
              {categories.length > 1 && (
                <select
                  aria-label="분류"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">모든 분류</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              )}
              {excludedCount > 0 && (
                <label className="check small">
                  <input
                    type="checkbox"
                    checked={hideExcluded}
                    onChange={(e) => setHideExcluded(e.target.checked)}
                  />
                  제외 항목 숨기기
                </label>
              )}
            </div>
          </div>
          {!visible.length ? (
            <EmptyState icon="search" title="표시할 업무가 없습니다">
              {report.work_items.length
                ? "필터 조건을 바꿔 보세요."
                : "선택한 기간에 해당하는 활동이 없습니다."}
            </EmptyState>
          ) : (
            <div className="work-items">
              {visible.map((item) => (
                <WorkItemCard
                  key={`${item.id}-${item.version}`}
                  item={item}
                  repo={item.repo_id ? repoName(item.repo_id) : undefined}
                  editable={draft}
                  busy={busy}
                  onSave={(patch) => saveItem(item, patch)}
                  onEditing={onEditing}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "preview" && (
        <Card className="doc-card">
          <Markdown source={report.markdown} />
        </Card>
      )}

      {tab === "scope" && (
        <div className="tab-panel stack">
          <Card title="저장소별 수집 결과" padded={false}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>저장소</th>
                    <th>결과</th>
                    <th>확인한 브랜치·PR</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.scope_repos.map((r) => {
                    const failed = coverage.failed_repos.includes(r);
                    return (
                      <tr key={r}>
                        <td className="mono">{r}</td>
                        <td>
                          {failed ? (
                            <span className="status-text status-danger">
                              <Icon name="alert" size={14} /> 조회 실패
                            </span>
                          ) : (
                            <span className="status-text status-success">
                              <Icon name="check" size={14} /> 수집 완료
                            </span>
                          )}
                        </td>
                        <td className="muted">
                          {coverage.branches_checked[r]?.join(", ") || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="수집 정보">
            <dl className="kv">
              <div>
                <dt>최종 수집</dt>
                <dd>{fullDateTime(coverage.collected_at)}</dd>
              </div>
              <div>
                <dt>수집 이벤트</dt>
                <dd>{coverage.counts?.events ?? "—"}건</dd>
              </div>
              <div>
                <dt>수집 정책</dt>
                <dd>메타데이터만 (diff·리뷰 본문 제외)</dd>
              </div>
            </dl>
            {boundary && <p className="muted small">{boundary.message_ko}</p>}
          </Card>
        </div>
      )}

      {draft && (
        <div className="finalize-bar">
          <label className="check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            근거 링크와 수집 누락을 확인했습니다.
          </label>
          {editing.length > 0 && (
            <span className="muted small">
              편집 중인 업무를 먼저 저장하세요.
            </span>
          )}
          <Button
            variant="primary"
            icon="check"
            loading={busy}
            disabled={!reviewed || editing.length > 0}
            onClick={() => void finalize()}
          >
            보고서 확정
          </Button>
        </div>
      )}
    </div>
  );
}
