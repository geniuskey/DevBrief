import Icon from "./Icon";
import { AvatarStack, Badge } from "./ui";
import { periodLabel, relativeTime, reportTypeLabel } from "../lib/format";
import { href } from "../lib/router";
import type { History } from "../types";

export function StatusBadge({ status }: { status: string }) {
  return status === "finalized" ? (
    <Badge tone="success" icon="check">
      확정
    </Badge>
  ) : (
    <Badge tone="brand" dot>
      초안
    </Badge>
  );
}

export function CoverageBadge({ status }: { status: string }) {
  return status === "complete" ? (
    <Badge tone="neutral">수집 완료</Badge>
  ) : (
    <Badge tone="warning" icon="alert">
      부분 수집
    </Badge>
  );
}

export default function ReportList({ rows }: { rows: History[] }) {
  return (
    <ul className="report-list">
      {rows.map((row) => (
        <li key={row.id}>
          <a className="report-row" href={href(`/reports/${row.id}`)}>
            <span className="report-row-icon">
              <Icon name="file" size={18} />
            </span>
            <span className="report-row-main">
              <strong>
                {row.team_name ?? `${reportTypeLabel(row.type)} 보고서`} ·{" "}
                {periodLabel(row.start_date, row.end_date)}
              </strong>
              <small>
                {row.work_item_count !== undefined &&
                  `업무 ${row.work_item_count}건 · `}
                {row.repository_count !== undefined &&
                  `저장소 ${row.repository_count}개 · `}
                {relativeTime(row.created_at)} 생성
              </small>
            </span>
            <span className="report-row-meta">
              {row.github_logins && <AvatarStack logins={row.github_logins} />}
              <CoverageBadge status={row.coverage_status} />
              <StatusBadge status={row.status} />
              <Icon name="chevronRight" className="muted-icon" />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
