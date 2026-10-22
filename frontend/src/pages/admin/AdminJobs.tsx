import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";
import Icon from "../../components/Icon";
import { useToast } from "../../components/Toast";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  ProgressBar,
  Segmented,
} from "../../components/ui";
import type { Tone } from "../../components/ui";
import {
  dateTime,
  duration,
  jobStatusLabel,
  reportTypeLabel,
} from "../../lib/format";
import { href } from "../../lib/router";
import type { AdminJob } from "./types";

const tones: Record<string, Tone> = {
  queued: "info",
  running: "info",
  complete: "success",
  partial: "warning",
  failed: "danger",
  cancelled: "neutral",
};

export function JobStatus({ status }: { status: string }) {
  return (
    <Badge tone={tones[status] ?? "neutral"} dot>
      {jobStatusLabel[status] ?? status}
    </Badge>
  );
}

type Filter = "" | "running" | "complete" | "partial" | "failed" | "cancelled";

export default function AdminJobs() {
  const toast = useToast();
  const [rows, setRows] = useState<AdminJob[] | null>(null);
  const [filter, setFilter] = useState<Filter>("");
  const [auto, setAuto] = useState(true);
  const [cancelling, setCancelling] = useState("");

  const load = useCallback(async () => {
    const all = await api<AdminJob[]>("/admin/jobs?limit=200");
    setRows(all);
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(errorMessage(e)));
    if (!auto) return;
    const timer = window.setInterval(
      () => void load().catch(() => undefined),
      5000,
    );
    return () => window.clearInterval(timer);
  }, [load, auto, toast]);

  async function cancel(job: AdminJob) {
    setCancelling(job.job_id);
    try {
      await api(`/jobs/${job.job_id}/cancel`, { method: "POST" });
      toast.success("작업을 취소했습니다.");
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCancelling("");
    }
  }

  const visible = (rows ?? []).filter((r) =>
    !filter
      ? true
      : filter === "running"
        ? r.status === "running" || r.status === "queued"
        : r.status === filter,
  );
  const count = (f: Filter) =>
    (rows ?? []).filter((r) =>
      f === "running"
        ? r.status === "running" || r.status === "queued"
        : r.status === f,
    ).length;

  return (
    <>
      <PageHeader
        eyebrow="관리자 콘솔"
        title="작업 모니터"
        description="보고서 생성 작업의 진행 상태와 실패 원인을 확인하고, 멈춘 작업을 취소합니다."
        actions={
          <>
            <label className="check small">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
              />
              5초마다 새로고침
            </label>
            <Button
              icon="refresh"
              onClick={() =>
                void load().catch((e) => toast.error(errorMessage(e)))
              }
            >
              새로고침
            </Button>
          </>
        }
      />
      <Card padded={false}>
        <div className="toolbar-row">
          <Segmented
            label="상태 필터"
            value={filter}
            onChange={setFilter}
            items={[
              { value: "", label: `전체 ${rows?.length ?? ""}` },
              { value: "running", label: `진행 ${count("running")}` },
              { value: "complete", label: `완료 ${count("complete")}` },
              { value: "partial", label: `부분 ${count("partial")}` },
              { value: "failed", label: `실패 ${count("failed")}` },
              { value: "cancelled", label: `취소 ${count("cancelled")}` },
            ]}
          />
        </div>
        {rows && !visible.length ? (
          <EmptyState icon="activity" title="해당하는 작업이 없습니다" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>상태</th>
                  <th>요청자</th>
                  <th>범위</th>
                  <th>진행</th>
                  <th>요청 시각</th>
                  <th>소요</th>
                  <th>오류</th>
                  <th aria-label="동작" />
                </tr>
              </thead>
              <tbody>
                {visible.map((j) => {
                  const running =
                    j.status === "running" || j.status === "queued";
                  return (
                    <tr key={j.job_id}>
                      <td>
                        <JobStatus status={j.status} />
                      </td>
                      <td>
                        <strong>{j.principal}</strong>
                      </td>
                      <td>
                        <div>
                          {j.start_date} ~ {j.end_date}
                        </div>
                        <small className="muted">
                          {reportTypeLabel(j.type)} · {j.login_count}명 · 저장소{" "}
                          {j.repository_count}개
                        </small>
                      </td>
                      <td className="progress-cell">
                        <ProgressBar
                          value={j.progress_percent}
                          tone={
                            j.status === "failed"
                              ? "danger"
                              : running
                                ? "brand"
                                : "success"
                          }
                          label="진행률"
                        />
                        <small className="muted">
                          {j.stage} · {j.progress_percent}%
                        </small>
                      </td>
                      <td className="nowrap">{dateTime(j.created_at)}</td>
                      <td className="nowrap">{duration(j.duration_seconds)}</td>
                      <td>
                        {j.error_code ? (
                          <code className="code-danger">{j.error_code}</code>
                        ) : (
                          <span className="muted">—</span>
                        )}
                        {j.retry_count > 1 && (
                          <small className="muted">
                            {" "}
                            시도 {j.retry_count}회
                          </small>
                        )}
                      </td>
                      <td className="row-actions">
                        {j.report_id && (
                          <a
                            className="icon-btn"
                            href={href(`/reports/${j.report_id}`)}
                            title="보고서 열기"
                            aria-label="보고서 열기"
                          >
                            <Icon name="file" />
                          </a>
                        )}
                        {running && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon="stop"
                            loading={cancelling === j.job_id}
                            onClick={() => void cancel(j)}
                          >
                            취소
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
