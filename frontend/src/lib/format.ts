const TZ = "Asia/Seoul";

export const repoOrg = (fullName: string) => fullName.split("/")[0];

export function scopeLabel(scope: {
  repository_ids?: string[];
  repository_count?: number;
  organizations?: string[];
}) {
  const orgs = scope.organizations ?? [];
  const repos = scope.repository_count ?? scope.repository_ids?.length ?? 0;
  const parts = orgs.length ? [`조직 ${orgs.join(", ")} 전체`] : [];
  if (repos || !orgs.length) parts.push(`저장소 ${repos}개`);
  return parts.join(" + ");
}
// Spreadsheets evaluate cells starting with = + - @ (or tab/CR) as formulas; a
// principal or target like "=HYPERLINK(...)" must stay plain text when opened.
export const csvCell = (v: string) =>
  `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

const DAY = 86400000;

export const kstDate = (d: Date = new Date()) =>
  d.toLocaleDateString("sv-SE", { timeZone: TZ });

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY).toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string) {
  return (
    Math.round(
      (new Date(`${end}T00:00:00Z`).getTime() -
        new Date(`${start}T00:00:00Z`).getTime()) /
        DAY,
    ) + 1
  );
}

// Monday-based week in KST.
function weekday(iso: string) {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export interface Preset {
  key: string;
  label: string;
  start: string;
  end: string;
}

export function periodPresets(today = kstDate()): Preset[] {
  const monday = addDays(today, -weekday(today));
  const yesterday = addDays(today, -1);
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = addDays(firstOfMonth, -1);
  const presets: Preset[] = [
    {
      key: "last-week",
      label: "지난주",
      start: addDays(monday, -7),
      end: addDays(monday, -1),
    },
    {
      key: "this-week",
      label: "이번 주",
      start: monday,
      end: yesterday < monday ? monday : yesterday,
    },
    {
      key: "two-weeks",
      label: "최근 2주",
      start: addDays(today, -14),
      end: yesterday,
    },
    {
      key: "last-month",
      label: "지난달",
      start: `${lastMonthEnd.slice(0, 7)}-01`,
      end: lastMonthEnd,
    },
  ];
  return presets.filter((p) => p.start <= p.end && p.end <= today);
}

export function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${Number(m)}.${Number(d)}`;
}

export function periodLabel(start: string, end: string) {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${start.slice(0, 4)}. ${shortDate(start)} – ${sameYear ? "" : `${end.slice(0, 4)}. `}${shortDate(end)}`;
}

// SQLite deployments return naive ISO timestamps; the API always stores UTC.
export const toDate = (value: string) =>
  new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);

export function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return toDate(value).toLocaleString("ko-KR", {
    timeZone: TZ,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fullDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return `${toDate(value).toLocaleString("ko-KR", { timeZone: TZ, hour12: false })} KST`;
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return "—";
  const diff = Date.now() - toDate(value).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}일 전`;
  return dateTime(value);
}

export function duration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  if (seconds < 1) return "1초 미만";
  if (seconds < 60) return `${Math.round(seconds)}초`;
  const m = Math.floor(seconds / 60);
  return `${m}분 ${Math.round(seconds % 60)}초`;
}

export const parseLogins = (value: string) =>
  value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

export const roleLabel: Record<string, string> = {
  author: "작성",
  reviewer: "리뷰",
  committer: "커밋 반영",
  coauthor: "공동 작성",
  unknown: "확인 필요",
};

export const eventLabel: Record<string, string> = {
  pr_opened: "PR 생성",
  pr_merged: "PR 병합",
  pr_closed: "PR 종료",
  commit_authored: "커밋",
  commit_committed: "커밋 반영",
  review_submitted: "리뷰",
};

export const jobStatusLabel: Record<string, string> = {
  queued: "대기",
  running: "진행 중",
  complete: "완료",
  partial: "부분 완료",
  failed: "실패",
  cancelled: "취소",
};

export const reportTypeLabel = (t?: string) =>
  t === "personal" ? "개인" : "팀";

export const initials = (login: string) => login.slice(0, 2).toUpperCase();

// Stable avatar hue per login so the same person keeps one color everywhere.
export function avatarHue(login: string) {
  let h = 0;
  for (const c of login) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
