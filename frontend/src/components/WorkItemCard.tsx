import { useEffect, useState } from "react";
import { safeEvidenceUrl } from "../api/client";
import Icon from "./Icon";
import type { IconName } from "./Icon";
import { Avatar, Badge, Button } from "./ui";
import { dateTime, eventLabel, roleLabel } from "../lib/format";
import type { Evidence, WorkItem } from "../types";

function evidenceIcon(e: Evidence): IconName {
  const t = e.event_type ?? e.label;
  if (/review|리뷰/.test(t)) return "review";
  if (/pr|PR/.test(t)) return "pr";
  return "commit";
}

export default function WorkItemCard({
  item,
  repo,
  editable,
  busy,
  onSave,
  onEditing,
}: {
  item: WorkItem;
  repo?: string;
  editable: boolean;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
  onEditing: (id: string, editing: boolean) => void;
}) {
  const [editing, setEditingState] = useState(false);
  const setEditing = (value: boolean) => {
    setEditingState(value);
    onEditing(item.id, value);
  };
  // A card can unmount mid-edit (tab switch, filter, refetch); release its lock.
  useEffect(() => () => onEditing(item.id, false), [item.id, onEditing]);
  const [title, setTitle] = useState(item.title_ko);
  const [summary, setSummary] = useState(item.summary_ko);
  const [showAll, setShowAll] = useState(false);
  const evidence = showAll ? item.evidence : item.evidence.slice(0, 6);
  const counts = item.evidence.reduce<Record<string, number>>((acc, e) => {
    const k = evidenceIcon(e);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <article
      className={`work-item ${item.excluded ? "excluded" : ""} ${editing ? "editing" : ""}`}
      aria-label={item.title_ko}
    >
      <header className="work-item-head">
        <div className="badges">
          <Badge tone="brand">{item.category}</Badge>
          <Badge>{item.status}</Badge>
          {repo && (
            <span className="repo-tag">
              <Icon name="repo" size={12} />
              {repo.split("/").pop()}
            </span>
          )}
          {item.excluded && (
            <Badge tone="warning" icon="eyeOff">
              보고서에서 제외
            </Badge>
          )}
        </div>
        {editable && !editing && (
          <div className="item-actions">
            <Button
              size="sm"
              variant="ghost"
              icon="edit"
              disabled={busy}
              onClick={() => {
                setTitle(item.title_ko);
                setSummary(item.summary_ko);
                setEditing(true);
              }}
            >
              수정
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={item.excluded ? "eye" : "eyeOff"}
              disabled={busy}
              onClick={() => void onSave({ excluded: !item.excluded })}
            >
              {item.excluded ? "다시 포함" : "제외"}
            </Button>
          </div>
        )}
      </header>

      {editing ? (
        <form
          className="item-edit"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onSave({ title_ko: title, summary_ko: summary }))
              setEditing(false);
          }}
        >
          <label className="field">
            <span className="field-label">
              업무 제목 <small>{title.length}/300</small>
            </span>
            <input
              required
              maxLength={300}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">
              수행 내용 <small>{summary.length}/4000</small>
            </span>
            <textarea
              required
              rows={4}
              maxLength={4000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <div className="row-end">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button
              type="submit"
              variant="primary"
              icon="check"
              loading={busy}
              disabled={!title.trim() || !summary.trim()}
            >
              수정 저장
            </Button>
          </div>
        </form>
      ) : (
        <>
          <h3>{item.title_ko}</h3>
          <p className="work-item-summary">{item.summary_ko}</p>
        </>
      )}

      <div className="contributors" aria-label="참여자">
        {item.contributors.map((c) => (
          <span key={`${c.login}-${c.role}`} className="contributor">
            <Avatar login={c.login} size={20} />
            <span>{c.login}</span>
            <span className="role">{roleLabel[c.role] ?? c.role}</span>
          </span>
        ))}
      </div>

      {item.unsupported_claims.length > 0 && (
        <div className="claims">
          <Icon name="alert" size={14} />
          <div>
            <strong>근거로 확인되지 않은 내용</strong>
            <ul>
              {item.unsupported_claims.map((claim, i) => (
                <li key={i}>{claim}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <footer className="evidence">
        <div className="evidence-head">
          <span>근거 {item.evidence.length}건</span>
          <span className="muted">
            {[
              counts.pr && `PR ${counts.pr}`,
              counts.commit && `커밋 ${counts.commit}`,
              counts.review && `리뷰 ${counts.review}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <div className="evidence-list">
          {evidence.map((e) => {
            const url = safeEvidenceUrl(e.url);
            const label = e.label;
            const meta = [
              e.event_type && eventLabel[e.event_type],
              e.occurred_at && dateTime(e.occurred_at),
            ]
              .filter(Boolean)
              .join(" · ");
            return url ? (
              <a
                key={e.id}
                className="evidence-chip"
                href={url}
                target="_blank"
                rel="noreferrer"
                title={meta}
              >
                <Icon name={evidenceIcon(e)} size={13} />
                {label}
                <Icon name="external" size={11} className="muted-icon" />
              </a>
            ) : (
              <span key={e.id} className="evidence-chip" title={meta}>
                <Icon name={evidenceIcon(e)} size={13} />
                {label}
              </span>
            );
          })}
          {item.evidence.length > 6 && (
            <button
              type="button"
              className="text-link small"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "접기" : `+${item.evidence.length - 6}건 더 보기`}
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
