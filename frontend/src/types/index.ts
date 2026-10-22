export interface Repository {
  id: string;
  full_name: string;
  access_state: string;
}
export interface Evidence {
  id: string;
  label: string;
  url: string;
}
export interface WorkItem {
  id: string;
  title_ko: string;
  summary_ko: string;
  category: string;
  status: string;
  version: number;
  excluded: boolean;
  evidence: Evidence[];
  contributors: { login: string; role: string }[];
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
  collected_at: string;
  branches_checked: Record<string, string[]>;
}
export interface Warning {
  code: string;
  message_ko?: string;
  repository?: string;
}
export interface Report {
  id: string;
  status: string;
  revision: number;
  markdown: string;
  work_items: WorkItem[];
  coverage: Coverage;
  warnings: Warning[];
  request: { github_logins: string[]; start_date: string; end_date: string };
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
  start_date: string;
  end_date: string;
  coverage_status: string;
}
