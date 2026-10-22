import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { History, Report } from "../types";
export default function HistoryView({
  onOpen,
  onError,
}: {
  onOpen: (r: Report) => void;
  onError: (s: string) => void;
}) {
  const [rows, setRows] = useState<History[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    api<History[]>(`/reports?${query}`)
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) => {
        if (active) onError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [from, to, onError]);
  return (
    <section className="panel">
      <h2>보고서 히스토리</h2>
      <div className="filters">
        <label>
          조회 시작
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          조회 종료
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {loading ? (
        <p role="status">목록을 불러오는 중…</p>
      ) : !rows.length ? (
        <p className="muted">저장된 보고서가 없습니다.</p>
      ) : (
        rows.map((row) => (
          <button
            className="history-row"
            key={row.id}
            onClick={() =>
              api<Report>(`/reports/${row.id}`)
                .then(onOpen)
                .catch((e) => onError(e.message))
            }
          >
            <span>
              <strong>
                {row.start_date} ~ {row.end_date}
              </strong>
              <br />
              <small>{new Date(row.created_at).toLocaleString("ko-KR")}</small>
            </span>
            <span>
              {row.status === "finalized" ? "확정" : "초안"} ·{" "}
              {row.coverage_status === "complete" ? "수집 완료" : "부분 수집"} →
            </span>
          </button>
        ))
      )}
    </section>
  );
}
