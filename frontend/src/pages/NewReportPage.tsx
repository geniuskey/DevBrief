import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, errorMessage } from "../api/client";
import Icon from "../components/Icon";
import { LoginInput, OrgPicker, RepoPicker } from "../components/Pickers";
import { useToast } from "../components/Toast";
import {
  AvatarStack,
  Banner,
  Button,
  Card,
  PageHeader,
  Segmented,
  Spinner,
} from "../components/ui";
import {
  daysBetween,
  kstDate,
  periodLabel,
  periodPresets,
  repoOrg,
  scopeLabel,
} from "../lib/format";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import type { Job, Team } from "../types";

const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(\[bot\])?$/;

export default function NewReportPage({
  teamId: initialTeam,
}: {
  teamId: string;
}) {
  const session = useSession();
  const { repositories, organizations, teams, isDemo, capabilities, loading } =
    session;
  const toast = useToast();
  const today = kstDate();
  const presets = periodPresets(today);
  const demoPeriod = capabilities?.demo_period;

  const [teamId, setTeamId] = useState("");
  const [type, setType] = useState<"team" | "personal">("team");
  const [logins, setLogins] = useState<string[]>([]);
  const [start, setStart] = useState(presets[0]?.start ?? today);
  const [end, setEnd] = useState(presets[0]?.end ?? today);
  const [selected, setSelected] = useState<string[]>([]);
  const [orgs, setOrgs] = useState<string[]>([]);
  const [saveTeam, setSaveTeam] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  // Seed defaults once session data arrives: a saved team, else demo values.
  useEffect(() => {
    if (loading || ready) return;
    const team = teams.find((t) => t.id === initialTeam);
    if (team) applyTeam(team);
    else if (isDemo) {
      setLogins(["alice", "bob", "carol"]);
      setSelected(
        repositories
          .filter((r) => !r.full_name.endsWith("/restricted"))
          .map((r) => r.id),
      );
    } else setSelected(repositories.length === 1 ? [repositories[0].id] : []);
    if (isDemo && demoPeriod) {
      setStart(demoPeriod.start_date);
      setEnd(demoPeriod.end_date);
    }
    setReady(true);
  }, [loading]);

  function applyTeam(team: Team) {
    setTeamId(team.id);
    setLogins(team.github_logins);
    setSelected(team.repository_ids);
    setOrgs(team.organizations ?? []);
    setType("team");
    setSaveTeam(false);
  }

  // Repositories inside a whole-org scope are collected anyway; don't send them twice.
  const repoIds = selected.filter((id) => {
    const repo = repositories.find((r) => r.id === id);
    return !repo || !orgs.includes(repoOrg(repo.full_name));
  });
  const days = start && end ? daysBetween(start, end) : 0;
  const problems: string[] = [];
  if (!logins.length) problems.push("대상 GitHub ID를 1명 이상 입력하세요.");
  if (logins.some((l) => !LOGIN.test(l)))
    problems.push("형식이 올바르지 않은 GitHub ID가 있습니다.");
  if (logins.length > 50) problems.push("GitHub ID는 최대 50명입니다.");
  if (!start || !end || days < 1)
    problems.push("종료일은 시작일 이후여야 합니다.");
  else if (days > 93) problems.push("조회 기간은 최대 93일입니다.");
  if (end > today) problems.push("미래 날짜는 조회할 수 없습니다.");
  if (!repoIds.length && !orgs.length)
    problems.push("저장소 또는 조직을 1개 이상 선택하세요.");
  if (repoIds.length > 20)
    problems.push("저장소는 최대 20개까지 선택할 수 있습니다.");
  if (saveTeam && !teamName.trim())
    problems.push("저장할 팀 이름을 입력하세요.");
  const activePreset = presets.find((p) => p.start === start && p.end === end);
  const isDemoPeriod =
    demoPeriod &&
    demoPeriod.start_date === start &&
    demoPeriod.end_date === end;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (problems.length) return;
    setBusy(true);
    try {
      let team = teamId || null;
      if (saveTeam) {
        const created = await api<Team>("/teams", {
          method: "POST",
          body: JSON.stringify({
            name: teamName.trim(),
            github_logins: logins,
            repository_ids: repoIds,
            organizations: orgs,
          }),
        });
        team = created.id;
        // A retry after a failed report request must reuse, not duplicate, the team.
        setTeamId(created.id);
        setSaveTeam(false);
        await session.reloadTeams();
        toast.success(`'${created.name}' 팀을 저장했습니다.`);
      }
      const job = await api<Job>("/reports", {
        method: "POST",
        body: JSON.stringify({
          type,
          github_logins: logins,
          repository_ids: repoIds,
          organizations: orgs,
          start_date: start,
          end_date: end,
          timezone: "Asia/Seoul",
          policy: "metadata_only",
          team_id: team,
        }),
      });
      navigate(`/jobs/${job.job_id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  }

  if (!ready)
    return (
      <div className="center-pad">
        <Spinner />
      </div>
    );

  return (
    <form className="page-form" onSubmit={submit} noValidate>
      <PageHeader
        eyebrow="보고서"
        title="주간보고 만들기"
        description="대상자·기간·저장소를 고르면 활동을 수집해 근거가 달린 초안을 만듭니다."
      />
      <div className="compose">
        <div className="compose-main">
          <Card
            className="step-card"
            title={
              <>
                <span className="step-num">1</span>대상자
              </>
            }
            description="저장된 팀을 불러오거나 GitHub ID를 직접 입력합니다."
          >
            {teams.length > 0 && (
              <div className="field">
                <span className="field-label">저장된 팀</span>
                <div className="chip-row">
                  <button
                    type="button"
                    className={`chip ${!teamId ? "active" : ""}`}
                    onClick={() => setTeamId("")}
                  >
                    직접 입력
                  </button>
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`chip ${teamId === t.id ? "active" : ""}`}
                      onClick={() => applyTeam(t)}
                    >
                      <Icon name="users" size={14} />
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="field">
              <span className="field-label">보고서 형식</span>
              <Segmented
                label="보고서 형식"
                value={type}
                onChange={setType}
                items={[
                  { value: "team", label: "팀 보고서" },
                  { value: "personal", label: "개인 보고서" },
                ]}
              />
              <small className="field-hint">
                {type === "team"
                  ? "공동 업무는 한 번만 표시하고 참여 역할을 구분합니다."
                  : "입력한 사람의 활동만 정리합니다."}
              </small>
            </div>
            <LoginInput
              value={logins}
              onChange={(v) => {
                setLogins(v);
                setTeamId("");
              }}
            />
          </Card>

          <Card
            className="step-card"
            title={
              <>
                <span className="step-num">2</span>조회 기간
              </>
            }
            description="프리셋을 고르거나 시작일과 종료일을 지정합니다."
          >
            <div className="chip-row">
              {isDemo && demoPeriod && (
                <button
                  type="button"
                  className={`chip ${isDemoPeriod ? "active" : ""}`}
                  onClick={() => {
                    setStart(demoPeriod.start_date);
                    setEnd(demoPeriod.end_date);
                  }}
                >
                  데모 기간
                </button>
              )}
              {presets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`chip ${activePreset?.key === p.key && !isDemoPeriod ? "active" : ""}`}
                  onClick={() => {
                    setStart(p.start);
                    setEnd(p.end);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="date-row">
              <label className="field">
                <span className="field-label">시작일</span>
                <input
                  type="date"
                  value={start}
                  max={today}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <Icon name="arrow" className="muted-icon date-arrow" />
              <label className="field">
                <span className="field-label">종료일 (포함)</span>
                <input
                  type="date"
                  value={end}
                  max={today}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
            <small className="field-hint">
              {days > 0 ? `${days}일간` : ""} · Asia/Seoul(KST) 기준 · 최대 93일
            </small>
          </Card>

          <Card
            className="step-card"
            title={
              <>
                <span className="step-num">3</span>대상 저장소
              </>
            }
            description="관리자가 허용한 조직·저장소만 표시됩니다."
          >
            <OrgPicker
              organizations={organizations}
              selected={orgs}
              onChange={(v) => {
                setOrgs(v);
                setTeamId("");
              }}
            />
            <RepoPicker
              repositories={repositories}
              selected={selected}
              coveredOrgs={orgs}
              onChange={(ids) => {
                setSelected(ids);
                setTeamId("");
              }}
              isDemo={isDemo}
            />
          </Card>
        </div>

        <aside className="compose-side">
          <Card className="summary-card" title="요약">
            <dl className="summary">
              <div>
                <dt>대상</dt>
                <dd>
                  {logins.length ? (
                    <>
                      <AvatarStack logins={logins} max={5} />
                      <span>{logins.length}명</span>
                    </>
                  ) : (
                    <span className="muted">미입력</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>기간</dt>
                <dd>
                  {days > 0 ? `${periodLabel(start, end)} · ${days}일` : "—"}
                </dd>
              </div>
              <div>
                <dt>저장소</dt>
                <dd>
                  {scopeLabel({ repository_ids: repoIds, organizations: orgs })}
                </dd>
              </div>
              <div>
                <dt>형식</dt>
                <dd>{type === "team" ? "팀 보고서" : "개인 보고서"}</dd>
              </div>
            </dl>
            {!teamId && (
              <div className="save-team">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={saveTeam}
                    onChange={(e) => setSaveTeam(e.target.checked)}
                  />
                  이 범위를 팀으로 저장
                </label>
                {saveTeam && (
                  <input
                    aria-label="팀 이름"
                    placeholder="팀 이름 (예: 비전팀)"
                    maxLength={100}
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                  />
                )}
              </div>
            )}
            {problems.length > 0 && (
              <ul className="problems" aria-live="polite">
                {problems.map((p) => (
                  <li key={p}>
                    <Icon name="info" size={14} />
                    {p}
                  </li>
                ))}
              </ul>
            )}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="block"
              loading={busy}
              disabled={problems.length > 0}
              iconAfter="arrow"
            >
              주간보고 생성
            </Button>
            <p className="fine">
              <Icon name="lock" size={12} /> 메타데이터만 수집 · 코드 diff와
              리뷰 본문 제외
            </p>
          </Card>
          {isDemo && (
            <Banner tone="info" title="데모 환경">
              가상 데이터로 동작합니다. <b>example-org/restricted</b>를 선택하면
              일부 저장소 수집 실패 상황을 확인할 수 있습니다.
            </Banner>
          )}
        </aside>
      </div>
    </form>
  );
}
