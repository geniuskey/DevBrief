export interface Overview {
  counts: {
    users: number;
    active_users: number;
    teams: number;
    reports: number;
    drafts: number;
    finalized: number;
    work_items: number;
    repositories: number;
    org_scopes?: number;
  };
  jobs_by_status: Record<string, number>;
  daily_reports: { date: string; count: number }[];
}
export interface AdminJob {
  job_id: string;
  principal: string;
  status: string;
  stage: string;
  progress_percent: number;
  error_code: string | null;
  retry_count: number;
  created_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  type: string;
  start_date: string;
  end_date: string;
  login_count: number;
  repository_count: number;
  organizations: string[];
  report_id: string | null;
}
export interface AdminUser {
  id: string;
  principal: string;
  display_name: string;
  role: string;
  active: boolean;
  report_count: number;
  last_seen_at: string | null;
}
export interface Audit {
  id: string;
  time: string;
  principal: string;
  action: string;
  resource_id: string;
  result: string;
}
export interface Policy {
  allowed_repositories: string[];
  org_scopes: string[];
  org_max_repositories: number;
  org_sync_minutes: number;
  allowed_orgs: string[];
  data_policy: string;
  retention_days: number;
  max_pages: number;
  max_events: number;
  settings_source: string;
  note_ko: string;
  deployment?: {
    adapter_mode: string;
    single_user_mode: boolean;
    proxy_auth_mode: string | null;
    ghes_base_url: string;
    llm_model: string;
    report_timezone: string;
    max_pending_jobs: number;
    job_timeout_seconds: number;
  };
}

export const actionLabel: Record<string, string> = {
  "report.requested": "보고서 생성 요청",
  "report.viewed": "보고서 조회",
  "report.history_viewed": "보고서 목록 조회",
  "report.finalized": "보고서 확정",
  "report.exported": "보고서 내보내기",
  "work_item.updated": "업무 항목 수정",
  "team.created": "팀 생성",
  "team.updated": "팀 수정",
  "team.deleted": "팀 삭제",
  "job.cancelled": "작업 취소",
  "connection.ghes_tested": "GHES 연결 검사",
  "connection.llm_tested": "LLM 연결 검사",
  "organization.synced": "조직 저장소 동기화",
  "audit.viewed": "감사 로그 조회",
  "admin.overview_viewed": "운영 개요 조회",
  "admin.jobs_viewed": "작업 목록 조회",
  "admin.users_viewed": "사용자 목록 조회",
};
