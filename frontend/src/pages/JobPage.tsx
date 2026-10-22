import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import Icon from "../components/Icon";
import { useToast } from "../components/Toast";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  LinkButton,
  ProgressBar,
  Spinner,
} from "../components/ui";
import { href, navigate } from "../lib/router";
import type { Job } from "../types";

const STEPS = [
  { key: "queued", label: "요청 접수", hint: "작업 대기열에 등록했습니다" },
  {
    key: "collecting",
    label: "활동 수집",
    hint: "PR·커밋·리뷰 메타데이터를 가져옵니다",
  },
  {
    key: "analyzing",
    label: "요약·근거 검증",
    hint: "업무 단위로 묶고 한국어 요약을 검증합니다",
  },
  {
    key: "rendering",
    label: "보고서 작성",
    hint: "근거 링크가 포함된 초안을 만듭니다",
  },
];
const STAGE_INDEX: Record<string, number> = {
  queued: 0,
  collecting: 1,
  analyzing: 2,
  rendering: 3,
  saving: 3,
  report_ready: 4,
};
const FINISHED = ["complete", "partial", "failed", "cancelled"];

export default function JobPage({ jobId }: { jobId: string }) {
  const toast = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [missing, setMissing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let stopped = false;
    let loaded = false;
    let timer = 0;
    async function poll() {
      try {
        const next = await api<Job>(`/jobs/${encodeURIComponent(jobId)}`);
        if (stopped) return;
        loaded = true;
        setJob(next);
        if (next.report_id) {
          timer = window.setTimeout(
            () => navigate(`/reports/${next.report_id}`, true),
            700,
          );
          return;
        }
        if (FINISHED.includes(next.status)) return;
        timer = window.setTimeout(() => void poll(), 900);
      } catch (e) {
        if (stopped) return;
        if (!loaded) setMissing(true);
        toast.error(errorMessage(e));
        timer = window.setTimeout(() => void poll(), 3000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [jobId, toast]);

  async function cancel() {
    setCancelling(true);
    try {
      await api(`/jobs/${jobId}/cancel`, { method: "POST" });
      setJob((j) => j && { ...j, status: "cancelled", stage: "cancelled" });
      toast.info("작업을 취소했습니다.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCancelling(false);
    }
  }

  if (missing && !job)
    return (
      <EmptyState
        icon="search"
        title="작업을 찾을 수 없습니다"
        action={
          <LinkButton href={href("/new")} variant="primary">
            새 보고서 만들기
          </LinkButton>
        }
      />
    );
  if (!job)
    return (
      <div className="center-pad">
        <Spinner />
      </div>
    );

  const index = STAGE_INDEX[job.stage] ?? 1;
  const failed = job.status === "failed";
  const cancelled = job.status === "cancelled";
  const done = !!job.report_id;
  const running = !FINISHED.includes(job.status);

  return (
    <div className="job-wrap">
      <Card className="job-card">
        <div className="job-head">
          <div
            className={`job-orb ${failed ? "orb-danger" : done ? "orb-success" : cancelled ? "orb-muted" : ""}`}
          >
            {failed ? (
              <Icon name="alert" size={26} />
            ) : done ? (
              <Icon name="check" size={26} />
            ) : cancelled ? (
              <Icon name="stop" size={26} />
            ) : (
              <span className="orb-spin" />
            )}
          </div>
          <h1>
            {failed
              ? "보고서 생성에 실패했습니다"
              : cancelled
                ? "작업을 취소했습니다"
                : done
                  ? "보고서 준비 완료"
                  : "보고서를 만들고 있습니다"}
          </h1>
          <p className="muted">
            {done
              ? "잠시 후 보고서 화면으로 이동합니다."
              : running
                ? "창을 닫아도 작업은 계속됩니다. 보고서 기록에서 다시 열 수 있습니다."
                : ""}
          </p>
        </div>
        <div role="status" className="job-progress">
          <div className="job-progress-label">
            <span>{STEPS[Math.min(index, 3)].label}</span>
            <strong>{job.progress_percent}%</strong>
          </div>
          <ProgressBar
            value={job.progress_percent}
            tone={failed ? "danger" : done ? "success" : "brand"}
            label="진행률"
          />
        </div>
        <ol className="stepper">
          {STEPS.map((step, i) => {
            const state =
              i < index || done
                ? "done"
                : i === index && running
                  ? "current"
                  : i === index && failed
                    ? "error"
                    : "todo";
            return (
              <li key={step.key} className={`step-${state}`}>
                <span className="step-marker">
                  {state === "done" ? (
                    <Icon name="check" size={12} />
                  ) : state === "error" ? (
                    <Icon name="x" size={12} />
                  ) : state === "current" ? (
                    <span className="pulse" />
                  ) : (
                    i + 1
                  )}
                </span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.hint}</small>
                </div>
              </li>
            );
          })}
        </ol>
        {failed && (
          <Banner tone="danger" title="오류 코드">
            {job.error_code ?? "UNKNOWN"} — 범위를 줄이거나 잠시 후 다시
            시도하세요. 문제가 계속되면 관리자에게 오류 코드를 전달하세요.
          </Banner>
        )}
        {job.warnings
          .filter((w) => w.code !== "COVERAGE_BOUNDARY")
          .map((w, i) => (
            <Banner key={i} tone="warning">
              {w.message_ko ?? w.code} {w.repository && <b>{w.repository}</b>}
            </Banner>
          ))}
        <div className="job-actions">
          {running && (
            <Button
              icon="stop"
              loading={cancelling}
              onClick={() => void cancel()}
            >
              작업 취소
            </Button>
          )}
          {done && (
            <LinkButton
              href={href(`/reports/${job.report_id}`)}
              variant="primary"
              icon="file"
            >
              보고서 열기
            </LinkButton>
          )}
          {(failed || cancelled) && (
            <LinkButton href={href("/new")} variant="primary" icon="refresh">
              다시 만들기
            </LinkButton>
          )}
        </div>
      </Card>
    </div>
  );
}
