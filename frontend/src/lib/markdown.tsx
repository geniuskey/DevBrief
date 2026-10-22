import type { ReactNode } from "react";
import { safeEvidenceUrl } from "../api/client";

// Minimal renderer for the report markdown subset (headings, quotes, lists,
// links, bold, code). Builds React nodes only — never injects HTML.
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

const unescape = (s: string) => s.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1");

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(unescape(text.slice(last, m.index)));
    const k = `${key}-${i++}`;
    if (m[1] !== undefined) {
      const url = safeEvidenceUrl(m[2]);
      out.push(
        url ? (
          <a key={k} href={url} target="_blank" rel="noreferrer">
            {unescape(m[1])}
          </a>
        ) : (
          unescape(m[1])
        ),
      );
    } else if (m[3] !== undefined) {
      out.push(<strong key={k}>{unescape(m[3])}</strong>);
    } else {
      out.push(<code key={k}>{m[4]}</code>);
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(unescape(text.slice(last)));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split("\n");
  let list: string[] = [];
  let quote: string[] = [];
  const flush = () => {
    if (list.length) {
      const k = `ul-${blocks.length}`;
      blocks.push(
        <ul key={k}>
          {list.map((l, i) => (
            <li key={i}>{inline(l, `${k}-${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
    if (quote.length) {
      const k = `q-${blocks.length}`;
      blocks.push(
        <blockquote key={k}>
          {quote.map((l, i) => (
            <p key={i}>{inline(l, `${k}-${i}`)}</p>
          ))}
        </blockquote>,
      );
      quote = [];
    }
  };
  for (const line of lines) {
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      const k = `h-${blocks.length}`;
      const content = inline(heading[2], k);
      blocks.push(
        level === 1 ? (
          <h1 key={k}>{content}</h1>
        ) : level === 2 ? (
          <h2 key={k}>{content}</h2>
        ) : (
          <h3 key={k}>{content}</h3>
        ),
      );
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (quote.length) flush();
      list.push(line.replace(/^\s*[-*]\s+/, ""));
    } else if (/^>\s?/.test(line)) {
      if (list.length) flush();
      quote.push(line.replace(/^>\s?/, ""));
    } else if (!line.trim()) {
      flush();
    } else {
      flush();
      const k = `p-${blocks.length}`;
      blocks.push(<p key={k}>{inline(line, k)}</p>);
    }
  }
  flush();
  return <div className="markdown">{blocks}</div>;
}
