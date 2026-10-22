import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";
import Icon from "../../components/Icon";
import { useToast } from "../../components/Toast";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from "../../components/ui";
import { fullDateTime } from "../../lib/format";
import { actionLabel } from "./types";
import type { Audit } from "./types";

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

export default function AdminAudit() {
  const toast = useToast();
  const [rows, setRows] = useState<Audit[] | null>(null);
  const [limit, setLimit] = useState(200);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [hideViews, setHideViews] = useState(true);

  useEffect(() => {
    setRows(null);
    api<Audit[]>(`/admin/audit-logs?limit=${limit}`)
      .then(setRows)
      .catch((e) => {
        setRows([]);
        toast.error(errorMessage(e));
      });
  }, [limit, toast]);

  const actions = [...new Set((rows ?? []).map((r) => r.action))].sort();
  const needle = q.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (r) =>
      (!action || r.action === action) &&
      (!hideViews || action || !/viewed$/.test(r.action)) &&
      (!needle ||
        r.principal.toLowerCase().includes(needle) ||
        r.resource_id?.toLowerCase().includes(needle)),
  );

  function exportCsv() {
    const lines = [
      ["time", "principal", "action", "resource_id", "result"].join(","),
      ...visible.map((r) =>
        [r.time, r.principal, r.action, r.resource_id ?? "", r.result]
          .map((v) => csvCell(String(v)))
          .join(","),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `devbrief-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        eyebrow="관리자 콘솔"
        title="감사 로그"
        description="보고서 생성·조회·수정·확정과 관리 작업 기록입니다. 본문 내용은 기록하지 않습니다."
        actions={
          <Button
            icon="download"
            disabled={!visible.length}
            onClick={exportCsv}
          >
            CSV 내보내기
          </Button>
        }
      />
      <Card padded={false}>
        <div className="toolbar-row">
          <label className="search-input">
            <Icon name="search" />
            <input
              aria-label="사용자 또는 리소스 검색"
              placeholder="사용자 또는 리소스 ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <select
            aria-label="작업 종류"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">모든 작업</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {actionLabel[a] ?? a}
              </option>
            ))}
          </select>
          <label className="check small">
            <input
              type="checkbox"
              checked={hideViews}
              onChange={(e) => setHideViews(e.target.checked)}
            />
            조회 기록 숨기기
          </label>
          <select
            aria-label="불러올 개수"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value={100}>최근 100건</option>
            <option value={200}>최근 200건</option>
            <option value={500}>최근 500건</option>
          </select>
        </div>
        {!rows ? (
          <div className="pad stack">
            <Skeleton h={36} />
            <Skeleton h={36} />
            <Skeleton h={36} />
          </div>
        ) : !visible.length ? (
          <EmptyState icon="shield" title="조건에 맞는 기록이 없습니다" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>사용자</th>
                  <th>작업</th>
                  <th>리소스</th>
                  <th>결과</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((log) => (
                  <tr key={log.id}>
                    <td className="nowrap">{fullDateTime(log.time)}</td>
                    <td>
                      <strong>{log.principal}</strong>
                    </td>
                    <td>
                      {actionLabel[log.action] ?? log.action}
                      <small className="muted mono block">{log.action}</small>
                    </td>
                    <td className="mono muted truncate" title={log.resource_id}>
                      {log.resource_id ? log.resource_id.slice(0, 8) : "—"}
                    </td>
                    <td>
                      <span
                        className={`status-text ${log.result === "ok" ? "status-success" : "status-danger"}`}
                      >
                        <Icon
                          name={log.result === "ok" ? "check" : "alert"}
                          size={14}
                        />
                        {log.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
