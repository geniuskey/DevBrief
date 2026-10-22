import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import Icon from "../components/Icon";
import ReportList from "../components/ReportList";
import {
  AvatarStack,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  Skeleton,
  Stat,
} from "../components/ui";
import { useToast } from "../components/Toast";
import { kstDate, periodLabel, periodPresets } from "../lib/format";
import { href } from "../lib/router";
import { useSession } from "../lib/session";
import type { History } from "../types";

export default function HomePage() {
  const { me, teams, isDemo, capabilities } = useSession();
  const toast = useToast();
  const [rows, setRows] = useState<History[] | null>(null);
  useEffect(() => {
    api<History[]>("/reports")
      .then(setRows)
      .catch((e) => {
        setRows([]);
        toast.error(errorMessage(e));
      });
  }, [toast]);
  const today = new Date().toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const lastWeek =
    isDemo && capabilities?.demo_period
      ? {
          start: capabilities.demo_period.start_date,
          end: capabilities.demo_period.end_date,
        }
      : periodPresets(kstDate())[0];
  const drafts = rows?.filter((r) => r.status === "draft") ?? [];
  const month = kstDate().slice(0, 7);
  const finalizedThisMonth =
    rows?.filter(
      (r) =>
        r.status === "finalized" &&
        (r.finalized_at ?? r.created_at).slice(0, 7) === month,
    ).length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow={today}
        title={`안녕하세요, ${me?.name ?? ""}님`}
        description="흩어진 PR·커밋·리뷰를 근거가 남는 업무 단위 주간보고로 정리합니다."
      />
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <Icon name="sparkle" size={14} /> 이번 주 할 일
          </span>
          <h2>
            {lastWeek
              ? `${periodLabel(lastWeek.start, lastWeek.end)} 주간보고를 만들어 보세요`
              : "주간보고를 만들어 보세요"}
          </h2>
          <p>
            대상자와 저장소를 고르면 활동을 수집하고, 근거 링크가 달린 한국어
            초안을 만들어 드립니다. 검토 후 확정하면 Markdown·HTML로 내보낼 수
            있습니다.
          </p>
          <div className="hero-actions">
            <LinkButton
              href={href("/new")}
              variant="primary"
              size="lg"
              icon="plus"
            >
              새 보고서 만들기
            </LinkButton>
            {teams.length > 0 && (
              <LinkButton
                href={href(`/new?team=${teams[0].id}`)}
                size="lg"
                icon="users"
              >
                {teams[0].name}으로 시작
              </LinkButton>
            )}
          </div>
        </div>
        <ol className="hero-steps" aria-label="진행 순서">
          <li>
            <span>1</span>
            <div>
              <strong>범위 선택</strong>
              <small>대상자·기간·저장소</small>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>자동 수집·요약</strong>
              <small>메타데이터만, diff 제외</small>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>검토 후 확정</strong>
              <small>근거 확인 · 편집 · 내보내기</small>
            </div>
          </li>
        </ol>
      </section>

      <div className="stats-grid">
        <Stat
          icon="file"
          label="전체 보고서"
          value={rows ? rows.length : "–"}
        />
        <Stat
          icon="edit"
          label="검토 대기 초안"
          value={rows ? drafts.length : "–"}
          tone={drafts.length ? "brand" : undefined}
          hint={drafts.length ? "확정 전 근거를 확인하세요" : "모두 확정됨"}
        />
        <Stat
          icon="check"
          label="이번 달 확정"
          value={rows ? finalizedThisMonth : "–"}
        />
        <Stat icon="users" label="저장된 팀" value={teams.length} />
      </div>

      <div className="home-grid">
        <Card
          title="최근 보고서"
          actions={
            <a className="text-link" href={href("/reports")}>
              전체 보기 <Icon name="chevronRight" size={14} />
            </a>
          }
          padded={false}
        >
          {!rows ? (
            <div className="pad stack">
              <Skeleton h={44} />
              <Skeleton h={44} />
              <Skeleton h={44} />
            </div>
          ) : rows.length ? (
            <ReportList rows={rows.slice(0, 6)} />
          ) : (
            <EmptyState icon="file" title="아직 만든 보고서가 없습니다">
              첫 주간보고를 만들면 이곳에 표시됩니다.
            </EmptyState>
          )}
        </Card>
        <div className="stack">
          <Card
            title="팀 바로 시작"
            actions={
              <a className="text-link" href={href("/teams")}>
                관리 <Icon name="chevronRight" size={14} />
              </a>
            }
            padded={false}
          >
            {teams.length ? (
              <ul className="team-quick">
                {teams.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    <a href={href(`/new?team=${t.id}`)}>
                      <span>
                        <strong>{t.name}</strong>
                        <small>
                          {t.github_logins.length}명 · 저장소{" "}
                          {t.repository_ids.length}개
                        </small>
                      </span>
                      <AvatarStack logins={t.github_logins} max={3} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="pad muted small">
                자주 쓰는 대상자·저장소 조합을 팀으로 저장하면 한 번에 보고서를
                만들 수 있습니다.
              </div>
            )}
          </Card>
          <Card className="policy-card">
            <div className="policy-head">
              <Icon name="lock" size={18} />
              <strong>메타데이터만 사용합니다</strong>
            </div>
            <p>
              PR 제목·본문, 커밋 메시지, 파일 경로만 분석합니다. 코드 diff와
              리뷰 본문은 저장하거나 분석하지 않습니다.
            </p>
            <p className="muted small">
              조회 가능한 저장소 활동만 포함하며, 전체 개발량이나 인사 평가를
              대표하지 않습니다.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
