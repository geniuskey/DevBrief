import { useId, useState } from "react";
import Icon from "./Icon";
import { Avatar } from "./ui";
import { parseLogins, repoOrg } from "../lib/format";
import type { Organization, Repository } from "../types";

const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(\[bot\])?$/;

export function LoginInput({
  value,
  onChange,
  label = "GitHub ID",
  disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const commit = (text: string) => {
    const next = parseLogins(text).map((s) => s.toLowerCase());
    if (!next.length) return;
    onChange([...new Set([...value, ...next])]);
    setDraft("");
  };
  const invalid = value.filter((l) => !LOGIN.test(l));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`tag-input ${disabled ? "disabled" : ""}`}>
        {value.map((login) => (
          <span
            key={login}
            className={`tag ${LOGIN.test(login) ? "" : "tag-invalid"}`}
          >
            <Avatar login={login} size={18} />
            {login}
            <button
              type="button"
              aria-label={`${login} 제거`}
              disabled={disabled}
              onClick={() => onChange(value.filter((l) => l !== login))}
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          disabled={disabled}
          placeholder={value.length ? "ID 추가" : "예: alice, bob"}
          onChange={(e) => {
            const v = e.target.value;
            if (/[\s,]$/.test(v)) commit(v);
            else setDraft(v);
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[\s,]/.test(text)) {
              e.preventDefault();
              commit(draft + text);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => commit(draft)}
        />
      </div>
      <small className={invalid.length ? "field-error" : "field-hint"}>
        {invalid.length
          ? `형식이 올바르지 않은 ID: ${invalid.join(", ")}`
          : "Enter, 쉼표 또는 공백으로 여러 명을 추가합니다. 최대 50명."}
      </small>
    </div>
  );
}

export function OrgPicker({
  organizations,
  selected,
  onChange,
  disabled,
}: {
  organizations: Organization[];
  selected: string[];
  onChange: (orgs: string[]) => void;
  disabled?: boolean;
}) {
  if (!organizations.length) return null;
  return (
    <div className="field">
      <span className="field-label">조직 전체</span>
      <div className="chip-row">
        {organizations.map((o) => {
          const on = selected.includes(o.login);
          return (
            <button
              key={o.login}
              type="button"
              className={`chip ${on ? "active" : ""}`}
              aria-pressed={on}
              disabled={disabled}
              onClick={() =>
                onChange(
                  on
                    ? selected.filter((s) => s !== o.login)
                    : [...selected, o.login],
                )
              }
            >
              <Icon name={on ? "check" : "grid"} size={14} />
              {o.login}
              <small className="muted">{o.repository_count}개</small>
            </button>
          );
        })}
      </div>
      <small className="field-hint">
        조직을 고르면 보고서를 만들 때마다 그 조직의 저장소 목록을 새로 확인해
        모두 조사합니다. 새로 생긴 저장소도 자동 포함되고, 기간 내 push가 없는
        저장소는 건너뜁니다.
      </small>
    </div>
  );
}

export function RepoPicker({
  repositories,
  selected,
  onChange,
  coveredOrgs = [],
  isDemo,
  disabled,
}: {
  repositories: Repository[];
  selected: string[];
  onChange: (ids: string[]) => void;
  coveredOrgs?: string[];
  isDemo?: boolean;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const covered = (r: Repository) => coveredOrgs.includes(repoOrg(r.full_name));
  const visible = repositories.filter((r) =>
    r.full_name.toLowerCase().includes(q.toLowerCase()),
  );
  const selectable = visible.filter((r) => !covered(r));
  const allSelected =
    selectable.length > 0 && selectable.every((r) => selected.includes(r.id));
  const coveredCount = repositories.filter(covered).length;
  const pickedCount = selected.filter((id) =>
    repositories.some((r) => r.id === id && !covered(r)),
  ).length;
  return (
    <fieldset className="repo-picker" disabled={disabled}>
      <legend className="sr-only">대상 저장소</legend>
      <div className="repo-toolbar">
        {repositories.length > 5 && (
          <label className="search-input">
            <Icon name="search" />
            <input
              placeholder="저장소 검색"
              aria-label="저장소 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
        )}
        <span className="muted small">
          {coveredCount > 0 && `조직 포함 ${coveredCount}개 · `}
          {pickedCount}/{repositories.length - coveredCount}개 선택
        </span>
        <button
          type="button"
          className="text-link"
          disabled={!selectable.length}
          onClick={() =>
            onChange(
              allSelected
                ? selected.filter((id) => !selectable.some((r) => r.id === id))
                : [...new Set([...selected, ...selectable.map((r) => r.id)])],
            )
          }
        >
          {allSelected ? "모두 해제" : "모두 선택"}
        </button>
      </div>
      <div className="repo-list">
        {visible.map((repo) => {
          const [org, name] = repo.full_name.split("/");
          const demoFail = isDemo && repo.full_name.endsWith("/restricted");
          const viaOrg = covered(repo);
          const checked = viaOrg || selected.includes(repo.id);
          return (
            <label
              key={repo.id}
              className={`repo-option ${checked ? "checked" : ""} ${viaOrg ? "covered" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={viaOrg}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, repo.id]
                      : selected.filter((id) => id !== repo.id),
                  )
                }
              />
              <span className="check-box" aria-hidden="true">
                <Icon name="check" size={12} />
              </span>
              <Icon name="repo" className="muted-icon" />
              <span className="repo-name">
                <span aria-hidden="true">
                  <span className="muted">{org}/</span>
                  <strong>{name}</strong>
                </span>
                <span className="sr-only">{repo.full_name}</span>
              </span>
              {viaOrg && (
                <span className="repo-note repo-note-info">조직 전체 포함</span>
              )}
              {demoFail && <span className="repo-note">접근 실패 데모</span>}
            </label>
          );
        })}
        {!visible.length && (
          <p className="muted small pad">조건에 맞는 저장소가 없습니다.</p>
        )}
      </div>
    </fieldset>
  );
}
