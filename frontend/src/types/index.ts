export interface Repository {
  id: string;
  full_name: string;
  access_state: string;
}
export interface Evidence {
  id: string;
  label: string;
  url: string;
  event_type?: string;
  occurred_at?: string;
  supports_summary?: boolean;
}
export interface Contributor {
  login: string;
  role: string;
}
export interface WorkItem {
  id: string;
  repo_id?: string;
  title_ko: string;
  summary_ko: string;
  category: string;
  status: string;
  confidence?: number;
  version: number;
  excluded: boolean;
  evidence: Evidence[];
  contributors: Contributor[];
  unsupported_claims: string[];
}
export interface Coverage {
  repositories_requested: number;
  repositories_succeeded: number;
  repositories_failed: number;
  is_complete: boolean;
  status: string;
  scope_repos: string[];
  failed_repos: string[];
  excluded_repos?: string[];
  collected_at: string;
  branches_checked: Record<string, string[]>;
  counts?: Partial<
    Record<"events" | "commits" | "pull_requests" | "reviews", number>
  >;
}
export interface Warning {
  code: string;
  message_ko?: string;
  repository?: string;
}
export interface ReportRequest {
  type?: string;
  github_logins: string[];
  repository_ids?: string[];
  start_date: string;
  end_date: string;
  team_id?: string | null;
}
export interface Report {
  id: string;
  status: string;
  revision: number;
  markdown: string;
  work_items: WorkItem[];
  coverage: Coverage;
  warnings: Warning[];
  request: ReportRequest;
}
export interface Job {
  job_id: string;
  status: string;
  stage: string;
  progress_percent: number;
  report_id: string | null;
  error_code: string | null;
  warnings: Warning[];
}
export interface Team {
  id: string;
  name: string;
  github_logins: string[];
  repository_ids: string[];
}
export interface History {
  id: string;
  status: string;
  created_at: string;
  finalized_at?: string | null;
  start_date: string;
  end_date: string;
  type?: string;
  github_logins?: string[];
  repository_count?: number;
  work_item_count?: number;
  team_id?: string | null;
  team_name?: string | null;
  coverage_status: string;
}
export interface Me {
  id: string;
  name: string;
  role: string;
  email: string | null;
  group: string | null;
}
export interface Capabilities {
  adapter_mode: string;
  single_user_mode?: boolean;
  llm_available?: boolean;
  demo_period?: { start_date: string; end_date: string };
}
