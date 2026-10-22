import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import Icon from "../components/Icon";
import ReportList from "../components/ReportList";
import { useToast } from "../components/Toast";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  Segmented,
  Skeleton,
} from "../components/ui";
import { href } from "../lib/router";
import type { History } from "../types";

type Status = "all" | "draft" | "finalized";

export default function HistoryPage() {
  const toast = useToast();
  const [rows, setRows] = useState<History[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    api<History[]>(`/reports?${query}`)
      .then((r) => active && setRows(r))
      .catch((e) => {
        if (!active) return;
        setRows([]);
        toast.error(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [from, to, toast]);

  const needle = q.trim().toLowerCase();
  const filtered = (rows ?? []).filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (!needle ||
        r.team_name?.toLowerCase().includes(needle) ||
        r.github_logins?.some((l) => l.includes(needle))),
  );
  const groups = filtered.reduce<Record<string, History[]>>((acc, r) => {
    const key = r.start_date.slice(0, 7);
    (acc[key] ??= []).push(r);
    return acc;
  }, {});
  const drafts = rows?.filter((r) => r.status === "draft").length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="워크스페이스"
        title="보고서 기록"
        description="생성한 주간보고를 기간·상태별로 찾아 다시 열 수 있습니다."
        actions={
          <LinkButton href={href("/new")} variant="primary" icon="plus">
            새 보고서
          </LinkButton>
        }
      />
      <Card padded={false}>
        <div className="toolbar-row">
          <Segmented
            label="상태"
            value={status}
            onChange={setStatus}
            items={[
              { value: "all", label: `전체 ${rows?.length ?? ""}` },
              { value: "draft", label: `초안 ${drafts}` },
              {
                value: "finalized",
                label: `확정 ${(rows?.length ?? 0) - drafts}`,
              },
            ]}
          />
          <label className="search-input">
            <Icon name="search" />
            <input
              aria-label="팀 또는 GitHub ID 검색"
              placeholder="팀 또는 GitHub ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <div className="date-filter">
            <input
              type="date"
              aria-label="조회 시작"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="muted">~</span>
            <input
              type="date"
              aria-label="조회 종료"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        {!rows ? (
          <div className="pad stack">
            <Skeleton h={52} />
            <Skeleton h={52} />
            <Skeleton h={52} />
          </div>
        ) : !filtered.length ? (
          <EmptyState
            icon="file"
            title={
              rows.length
                ? "조건에 맞는 보고서가 없습니다"
                : "저장된 보고서가 없습니다"
            }
            action={
              !rows.length && (
                <LinkButton href={href("/new")} variant="primary" icon="plus">
                  첫 보고서 만들기
                </LinkButton>
              )
            }
          >
            {rows.length
              ? "필터를 바꿔 보세요."
              : "주간보고를 만들면 이곳에 쌓입니다."}
          </EmptyState>
        ) : (
          Object.entries(groups).map(([month, items]) => (
            <div key={month} className="group">
              <h3 className="group-title">
                {month.slice(0, 4)}년 {Number(month.slice(5))}월
                <span>{items.length}</span>
              </h3>
              <ReportList rows={items} />
            </div>
          ))
        )}
      </Card>
    </>
  );
}
