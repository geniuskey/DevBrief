import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api/client";
import AdminView from "./components/AdminView";
import HistoryView from "./components/HistoryView";
import ReportView from "./components/ReportView";
import type { Job, Report, Repository, Team } from "./types";

export default function App() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [logins, setLogins] = useState("alice, bob, carol");
  const [start, setStart] = useState("2026-10-12");
  const [end, setEnd] = useState("2026-10-18");
  const [job, setJob] = useState<Job | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("");
  const [role, setRole] = useState("author");
  const [view, setView] = useState<"create" | "history" | "admin">("create");
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [reportType, setReportType] = useState("team");
  useEffect(() => {
    api<Repository[]>("/repositories")
      .then((rows) => {
        setRepositories(rows);
        setSelected(
          rows
            .filter((r) => !r.full_name.endsWith("restricted"))
            .map((r) => r.id),
        );
      })
      .catch((e) => setError(e.message));
    api<{ adapter_mode: string }>("/settings/capabilities")
      .then((c) => {
        setMode(c.adapter_mode);
        if (c.adapter_mode === "real") {
          setLogins("");
          const now = new Date();
          const last = new Date(now.getTime() - 86400000);
          const first = new Date(now.getTime() - 7 * 86400000);
          setStart(
            first.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
          );
          setEnd(last.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
        }
      })
      .catch((e) => setError(e.message));
    api<{ role: string }>("/me")
      .then((u) => setRole(u.role))
      .catch((e) => setError(e.message));
    api<Team[]>("/teams")
      .then(setTeams)
      .catch((e) => setError(e.message));
    const saved = sessionStorage.getItem("devbrief-job");
    if (saved)
      api<Job>(`/jobs/${encodeURIComponent(saved)}`)
        .then(async (j) => {
          setJob(j);
          if (j.report_id)
            setReport(await api<Report>(`/reports/${j.report_id}`));
        })
        .catch(() => sessionStorage.removeItem("devbrief-job"));
  }, []);
  useEffect(() => {
    if (
      !job ||
      ["complete", "partial", "failed", "cancelled"].includes(job.status)
    )
      return;
    let stopped = false;
    let timer: number;
    async function poll() {
      try {
        const next = await api<Job>(`/jobs/${job!.job_id}`);
        if (stopped) return;
        const result = next.report_id
          ? await api<Report>(`/reports/${next.report_id}`)
          : null;
        if (stopped) return;
        if (result) setReport(result);
        setJob(next);
        if (next.status === "failed")
          setError(`보고서 생성에 실패했습니다: ${next.error_code}`);
      } catch (e) {
        if (!stopped) setError((e as Error).message);
        timer = window.setTimeout(() => void poll(), 3000);
      }
    }
    timer = window.setTimeout(() => void poll(), 800);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [job]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    setReport(null);
    try {
      const next = await api<Job>("/reports", {
        method: "POST",
        body: JSON.stringify({
          type: reportType,
          github_logins: logins.split(/[\s,]+/).filter(Boolean),
          repository_ids: selected,
          start_date: start,
          end_date: end,
          timezone: "Asia/Seoul",
          policy: "metadata_only",
          team_id: teamId || null,
        }),
      });
      sessionStorage.setItem("devbrief-job", next.job_id);
      setJob({
        ...next,
        stage: "queued",
        progress_percent: 0,
        report_id: null,
        warnings: [],
        error_code: null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveTeam() {
    setBusy(true);
    try {
      const team = await api<Team>("/teams", {
        method: "POST",
        body: JSON.stringify({
          name: teamName,
          github_logins: logins.split(/[\s,]+/).filter(Boolean),
          repository_ids: selected,
        }),
      });
      setTeams(await api<Team[]>("/teams"));
      setTeamId(team.id);
      setTeamName("");
      setNotice("현재 사용자와 저장소를 팀으로 저장했습니다.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!job) return;
    try {
      await api(`/jobs/${job.job_id}/cancel`, { method: "POST" });
      setJob({ ...job, status: "cancelled", stage: "cancelled" });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const running = !!job && ["queued", "running"].includes(job.status);
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          D
          <span>
            DevBrief<small>개발의 기록, 명확하게.</small>
          </span>
        </a>
        <nav aria-label="주 메뉴">
          <button
            className={`nav ${view === "create" ? "active" : ""}`}
            onClick={() => setView("create")}
          >
            ▧ <span>주간보고</span>
          </button>
          <button
            className={`nav ${view === "history" ? "active" : ""}`}
            onClick={() => setView("history")}
          >
            ◷ <span>히스토리</span>
          </button>
          {role === "admin" && (
            <button
              className={`nav ${view === "admin" ? "active" : ""}`}
              onClick={() => setView("admin")}
            >
              ⚙ <span>관리</span>
            </button>
          )}
        </nav>
        <div className="sidebar-note">
          GITHUB ENTERPRISE
          <br />
          사내 개발 활동을 근거로 정리합니다.
          <br />
          <b>{mode === "fake" ? "● 데모 환경" : "● 사내 연결 환경"}</b>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">WORKSPACE / WEEKLY REPORT</span>
            <h1>개발 주간보고</h1>
            <p>흩어진 개발 기록을 하나의 업무 이야기로 정리하세요.</p>
          </div>
          <span className="badge">
            {mode === "fake" ? "FAKE DATA · 외부 전송 없음" : "METADATA ONLY"}
          </span>
        </header>
        {error && (
          <div role="alert" className="alert">
            {error}
            <button
              className="dismiss"
              aria-label="오류 닫기"
              onClick={() => setError("")}
            >
              ×
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="toast">
            {notice}
          </p>
        )}
        {view === "history" ? (
          <HistoryView
            onError={setError}
            onOpen={(r) => {
              setReport(r);
              setJob(null);
              setView("create");
            }}
          />
        ) : view === "admin" ? (
          <AdminView onError={setError} />
        ) : (
          <div className="workspace">
            <section className="panel setup">
              <div className="section-title">
                <span className="step">01</span>
                <h2>수집 범위 설정</h2>
              </div>
              <form onSubmit={submit}>
                <fieldset disabled={busy || running} className="form-fields">
                  <label>
                    저장된 팀
                    <select
                      value={teamId}
                      onChange={(e) => {
                        setTeamId(e.target.value);
                        const t = teams.find((t) => t.id === e.target.value);
                        if (t) {
                          setLogins(t.github_logins.join(", "));
                          setSelected(t.repository_ids);
                        }
                      }}
                    >
                      <option value="">직접 입력</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    GitHub ID
                    <input
                      required
                      value={logins}
                      onChange={(e) => {
                        setLogins(e.target.value);
                        setTeamId("");
                      }}
                      placeholder="alice, bob"
                    />
                    <small>쉼표 또는 공백으로 여러 ID를 입력하세요.</small>
                  </label>
                  <label>
                    보고서 형식
                    <select
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value)}
                    >
                      <option value="team">팀 보고서</option>
                      <option value="personal">개인 보고서</option>
                    </select>
                  </label>
                  <div className="dates">
                    <label>
                      시작일
                      <input
                        type="date"
                        required
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                      />
                    </label>
                    <label>
                      종료일 (포함)
                      <input
                        type="date"
                        required
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                      />
                    </label>
                  </div>
                  <p className="hint">Asia/Seoul (KST) 기준 · 최대 93일</p>
                  <fieldset>
                    <legend>
                      대상 저장소 <span>{selected.length}개 선택</span>
                    </legend>
                    {repositories.map((repo) => (
                      <label className="repo" key={repo.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(repo.id)}
                          onChange={(e) => {
                            setSelected(
                              e.target.checked
                                ? [...selected, repo.id]
                                : selected.filter((id) => id !== repo.id),
                            );
                            setTeamId("");
                          }}
                        />
                        <span>
                          {repo.full_name}
                          <small>
                            {mode === "fake" &&
                            repo.full_name.endsWith("restricted")
                              ? "접근 실패 데모"
                              : "허용된 저장소"}
                          </small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <details className="save-team">
                    <summary>현재 범위를 팀으로 저장</summary>
                    <label>
                      팀 이름
                      <input
                        value={teamName}
                        maxLength={100}
                        onChange={(e) => setTeamName(e.target.value)}
                      />
                    </label>
                    <button
                      className="secondary"
                      type="button"
                      disabled={
                        !teamName.trim() || !selected.length || !logins.trim()
                      }
                      onClick={() => void saveTeam()}
                    >
                      팀 저장
                    </button>
                  </details>
                  <div className="policy">
                    <strong>메타데이터만 수집</strong>
                    <p>
                      PR 제목·본문, 커밋 메시지, 파일 경로를 사용합니다. 코드
                      diff와 리뷰 본문은 저장하거나 분석에 사용하지 않습니다.
                    </p>
                  </div>
                  <button className="primary" disabled={!selected.length}>
                    {busy || running ? "보고서 생성 중…" : "주간보고 생성 →"}
                  </button>
                </fieldset>
              </form>
            </section>
            <section className="panel result">
              <div className="section-title">
                <span className="step">02</span>
                <h2>보고서 초안</h2>
                {report && (
                  <span className="badge">
                    {report.coverage.status === "partial"
                      ? "부분 수집"
                      : "수집 완료"}
                  </span>
                )}
              </div>
              {job && (
                <div className="progress" role="status">
                  <span>
                    {job.stage === "report_ready"
                      ? "보고서 준비 완료"
                      : job.stage === "queued"
                        ? "작업 대기 중"
                        : job.stage === "cancelled"
                          ? "작업 취소"
                          : job.stage === "failed"
                            ? "생성 실패"
                            : job.stage === "analyzing"
                              ? "한국어 요약 및 근거 검증 중"
                              : "활동 수집 및 분석 중"}{" "}
                    · {job.progress_percent}%
                  </span>
                  <progress max="100" value={job.progress_percent} />
                  {running && (
                    <button className="secondary" onClick={() => void cancel()}>
                      작업 취소
                    </button>
                  )}
                </div>
              )}
              {!report && !running && (
                <div className="empty">
                  <div>▤</div>
                  <h3>이번 주의 기록을 시작하세요</h3>
                  <p>
                    사용자와 저장소를 선택하면
                    <br />
                    근거 링크가 포함된 한국어 초안을 만듭니다.
                  </p>
                  <span>PR · 커밋 · 리뷰 → 업무 단위 보고서</span>
                </div>
              )}
              {report && (
                <ReportView
                  key={report.id}
                  report={report}
                  onChange={setReport}
                  onError={setError}
                />
              )}
            </section>
          </div>
        )}
        <footer>
          조회 가능한 저장소의 활동만 포함합니다. 전체 개발량이나 인사 평가를
          대표하지 않습니다.
        </footer>
      </main>
    </div>
  );
}
