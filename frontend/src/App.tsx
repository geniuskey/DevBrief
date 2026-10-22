import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, safeEvidenceUrl } from './api/client';
import type { Job, Report, Repository } from './types';

export default function App() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [logins, setLogins] = useState('alice, bob, carol');
  const [start, setStart] = useState('2026-10-12');
  const [end, setEnd] = useState('2026-10-18');
  const [job, setJob] = useState<Job | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('');
  useEffect(() => {
    api<Repository[]>('/repositories').then(rows => { setRepositories(rows); setSelected(rows.filter(r => !r.full_name.endsWith('restricted')).map(r => r.id)); }).catch(e => setError(e.message));
    api<{adapter_mode: string}>('/settings/capabilities').then(c => setMode(c.adapter_mode)).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    if (!job || ['complete', 'partial', 'failed', 'cancelled'].includes(job.status)) return;
    const id = window.setInterval(() => {
      api<Job>(`/jobs/${job.job_id}`).then(async next => {
        setJob(next);
        if (next.report_id) setReport(await api<Report>(`/reports/${next.report_id}`));
        if (next.status === 'failed') setError(`보고서 생성에 실패했습니다: ${next.error_code}`);
      }).catch(e => setError(e.message));
    }, 1000);
    return () => window.clearInterval(id);
  }, [job]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true); setReport(null);
    try {
      const next = await api<Job>('/reports', {method:'POST', body: JSON.stringify({type:'team', github_logins:logins.split(/[\s,]+/).filter(Boolean), repository_ids:selected, start_date:start, end_date:end, timezone:'Asia/Seoul', policy:'metadata_only'})});
      setJob({...next, stage:'queued', progress_percent:0, report_id:null, warnings:[], error_code:null});
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const running = !!job && ['queued', 'running'].includes(job.status);
  return <div className="shell">
    <aside className="sidebar"><a className="brand" href="/">D<span>DevBrief<small>개발의 기록, 명확하게.</small></span></a><nav aria-label="주 메뉴"><button className="nav active">▧ <span>주간보고</span></button></nav><div className="sidebar-note">GITHUB ENTERPRISE<br/>사내 개발 활동을 근거로 정리합니다.<br/><b>{mode === 'fake' ? '● 데모 환경' : '● 사내 연결 환경'}</b></div></aside>
    <main><header><div><span className="eyebrow">WORKSPACE / WEEKLY REPORT</span><h1>개발 주간보고</h1><p>흩어진 개발 기록을 하나의 업무 이야기로 정리하세요.</p></div><span className="badge">{mode === 'fake' ? 'FAKE DATA · 외부 전송 없음' : 'METADATA ONLY'}</span></header>
      {error && <div role="alert" className="alert">{error}</div>}
      <div className="workspace"><section className="panel setup"><div className="section-title"><span className="step">01</span><h2>수집 범위 설정</h2></div><form onSubmit={submit}>
        <label>GitHub ID<input required value={logins} onChange={e => setLogins(e.target.value)} placeholder="alice, bob"/><small>쉼표 또는 공백으로 여러 ID를 입력하세요.</small></label>
        <div className="dates"><label>시작일<input type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label><label>종료일 (포함)<input type="date" required value={end} onChange={e=>setEnd(e.target.value)}/></label></div><p className="hint">Asia/Seoul (KST) 기준</p>
        <fieldset><legend>대상 저장소 <span>{selected.length}개 선택</span></legend>{repositories.map(repo=><label className="repo" key={repo.id}><input type="checkbox" checked={selected.includes(repo.id)} onChange={e=>setSelected(e.target.checked?[...selected,repo.id]:selected.filter(id=>id!==repo.id))}/><span>{repo.full_name}<small>{repo.full_name.endsWith('restricted') ? '접근 실패 데모' : '허용된 저장소'}</small></span></label>)}</fieldset>
        <div className="policy"><strong>메타데이터만 수집</strong><p>PR 제목·본문, 커밋 메시지, 파일 경로를 사용합니다. 코드 diff와 리뷰 본문은 수집하지 않습니다.</p></div>
        <button className="primary" disabled={busy || running || !selected.length}>{busy || running ? '보고서 생성 중…' : '주간보고 생성 →'}</button>
      </form></section>
      <section className="panel result"><div className="section-title"><span className="step">02</span><h2>보고서 초안</h2>{report && <span className="badge">{report.coverage.status === 'partial' ? '부분 수집' : '수집 완료'}</span>}</div>
        {job && <div className="progress" role="status"><span>{job.stage === 'report_ready' ? '보고서 준비 완료' : job.stage === 'queued' ? '작업 대기 중' : '활동 수집 및 분석 중'} · {job.progress_percent}%</span><progress max="100" value={job.progress_percent}/></div>}
        {!report && !running && <div className="empty"><div>▤</div><h3>이번 주의 기록을 시작하세요</h3><p>사용자와 저장소를 선택하면<br/>근거 링크가 포함된 한국어 초안을 만듭니다.</p><span>PR · 커밋 · 리뷰 → 업무 단위 보고서</span></div>}
        {report && <><div className="coverage">{report.coverage.repositories_succeeded}/{report.coverage.repositories_requested}개 저장소 수집 완료 · {report.work_items.length}개 업무</div>{report.warnings.map((w,i)=><p className="warning" key={i}>{w.message_ko || w.code} {w.repository}</p>)}{report.work_items.map(item=><article className="work-item" key={item.id}><span className="item-status">{item.status}</span><h3>{item.title_ko}</h3><p>{item.summary_ko}</p><p className="contributors">{item.contributors.map(c=>`${c.login} (${c.role})`).join(' · ')}</p><div className="evidence">{item.evidence.map(e=><a key={e.id} href={safeEvidenceUrl(e.url)} target="_blank" rel="noreferrer">↗ {e.label}</a>)}</div></article>)}<details><summary>Markdown 원문</summary><pre>{report.markdown}</pre></details></>}
      </section></div><footer>조회 가능한 저장소의 활동만 포함합니다. 전체 개발량이나 인사 평가를 대표하지 않습니다.</footer>
    </main>
  </div>;
}
