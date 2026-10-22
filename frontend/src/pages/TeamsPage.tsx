import { useState } from "react";
import { api, errorMessage } from "../api/client";
import Icon from "../components/Icon";
import { LoginInput, RepoPicker } from "../components/Pickers";
import { useToast } from "../components/Toast";
import {
  Avatar,
  Button,
  Card,
  Dialog,
  EmptyState,
  LinkButton,
  PageHeader,
} from "../components/ui";
import { href } from "../lib/router";
import { useSession } from "../lib/session";
import type { Team } from "../types";

type Draft = { id?: string; name: string; logins: string[]; repos: string[] };

export default function TeamsPage() {
  const { teams, repositories, repoName, reloadTeams, isDemo } = useSession();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Team | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      await api(draft.id ? `/teams/${draft.id}` : "/teams", {
        method: draft.id ? "PUT" : "POST",
        body: JSON.stringify({
          name: draft.name.trim(),
          github_logins: draft.logins,
          repository_ids: draft.repos,
        }),
      });
      await reloadTeams();
      toast.success(
        draft.id ? "팀 정보를 수정했습니다." : "팀을 만들었습니다.",
      );
      setDraft(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/teams/${removing.id}`, { method: "DELETE" });
      await reloadTeams();
      toast.success(`'${removing.name}' 팀을 삭제했습니다.`);
      setRemoving(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const valid =
    draft && draft.name.trim() && draft.logins.length && draft.repos.length;

  return (
    <>
      <PageHeader
        eyebrow="팀"
        title="팀"
        description="자주 쓰는 대상자·저장소 조합을 저장해 두고 한 번에 보고서를 만듭니다."
        actions={
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setDraft({ name: "", logins: [], repos: [] })}
          >
            새 팀
          </Button>
        }
      />
      {!teams.length ? (
        <Card>
          <EmptyState
            icon="users"
            title="저장된 팀이 없습니다"
            action={
              <Button
                variant="primary"
                icon="plus"
                onClick={() => setDraft({ name: "", logins: [], repos: [] })}
              >
                첫 팀 만들기
              </Button>
            }
          >
            보고서 생성 화면에서 “이 범위를 팀으로 저장”을 선택해도 됩니다.
          </EmptyState>
        </Card>
      ) : (
        <div className="team-grid">
          {teams.map((t) => (
            <Card key={t.id} className="team-card">
              <header className="team-card-head">
                <div className="team-icon">
                  <Icon name="users" size={18} />
                </div>
                <div>
                  <h2>{t.name}</h2>
                  <small className="muted">
                    {t.github_logins.length}명 · 저장소{" "}
                    {t.repository_ids.length}개
                  </small>
                </div>
              </header>
              <div className="member-list">
                {t.github_logins.map((l) => (
                  <span key={l} className="member">
                    <Avatar login={l} size={20} />
                    {l}
                  </span>
                ))}
              </div>
              <ul className="repo-mini">
                {t.repository_ids.map((id) => (
                  <li key={id}>
                    <Icon name="repo" size={12} />
                    {repoName(id)}
                  </li>
                ))}
              </ul>
              <footer className="team-card-foot">
                <LinkButton
                  href={href(`/new?team=${t.id}`)}
                  variant="primary"
                  size="sm"
                  icon="plus"
                >
                  보고서 만들기
                </LinkButton>
                <span className="spacer" />
                <Button
                  size="sm"
                  variant="ghost"
                  icon="edit"
                  onClick={() =>
                    setDraft({
                      id: t.id,
                      name: t.name,
                      logins: t.github_logins,
                      repos: t.repository_ids,
                    })
                  }
                >
                  편집
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="trash"
                  aria-label={`${t.name} 삭제`}
                  onClick={() => setRemoving(t)}
                />
              </footer>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={!!draft}
        wide
        title={draft?.id ? "팀 편집" : "새 팀"}
        description="팀 이름과 대상자, 저장소를 지정합니다."
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!valid}
              onClick={() => void save()}
            >
              {draft?.id ? "변경 저장" : "팀 만들기"}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="stack">
            <label className="field">
              <span className="field-label">팀 이름</span>
              <input
                maxLength={100}
                value={draft.name}
                placeholder="예: 비전팀"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <LoginInput
              label="구성원 GitHub ID"
              value={draft.logins}
              onChange={(logins) => setDraft({ ...draft, logins })}
            />
            <div className="field">
              <span className="field-label">저장소</span>
              <RepoPicker
                repositories={repositories}
                selected={draft.repos}
                onChange={(repos) => setDraft({ ...draft, repos })}
                isDemo={isDemo}
              />
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!removing}
        title="팀을 삭제할까요?"
        onClose={() => setRemoving(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              취소
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => void remove()}
            >
              삭제
            </Button>
          </>
        }
      >
        <p>
          <b>{removing?.name}</b> 팀 설정을 삭제합니다. 이미 만든 보고서는
          그대로 남습니다.
        </p>
      </Dialog>
    </>
  );
}
