import { useId, useState } from "react";
import Icon from "./Icon";
import { Avatar } from "./ui";
import { parseLogins } from "../lib/format";
import type { Repository } from "../types";

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

export function RepoPicker({
  repositories,
  selected,
  onChange,
  isDemo,
  disabled,
}: {
  repositories: Repository[];
  selected: string[];
  onChange: (ids: string[]) => void;
  isDemo?: boolean;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const visible = repositories.filter((r) =>
    r.full_name.toLowerCase().includes(q.toLowerCase()),
  );
  const allSelected =
    visible.length > 0 && visible.every((r) => selected.includes(r.id));
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
          {selected.length}/{repositories.length}개 선택
        </span>
        <button
          type="button"
          className="text-link"
          onClick={() =>
            onChange(
              allSelected
                ? selected.filter((id) => !visible.some((r) => r.id === id))
                : [...new Set([...selected, ...visible.map((r) => r.id)])],
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
          return (
            <label
              key={repo.id}
              className={`repo-option ${selected.includes(repo.id) ? "checked" : ""}`}
            >
              <input
                type="checkbox"
                checked={selected.includes(repo.id)}
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
