import html
import re

import bleach
from markdown_it import MarkdownIt

from app.core.security import redact


def md_text(value: str) -> str:
    value = html.escape(redact(value), quote=False)
    return re.sub(r"([\\`*_{}\[\]()#+.!|>~-])", r"\\\1", value)


def render_report(request: dict, items: list, coverage: dict, warnings: list) -> str:
    title = "팀" if request["type"] == "team" else "개인"
    lines = [
        f"# {title} 개발 주간보고 ({request['start_date']}~{request['end_date']})",
        "",
        f"> 범위: {coverage.get('repositories_succeeded', 0)}/{coverage.get('repositories_requested', 0)} 저장소 수집 완료 · "
        f"수집 상태: {coverage.get('status', 'unknown')} · 최종 수집: {coverage.get('collected_at', '')}",
        "> 조회 가능한 범위의 활동 기록이며, 전체 개발량이나 인사 평가를 대표하지 않습니다.",
    ]
    if request.get("organizations"):
        lines.insert(
            -1,
            "> 조직 전체: "
            + ", ".join(md_text(o) for o in request["organizations"])
            + f" · 기간 내 활동 없는 저장소 등 {len(coverage.get('excluded_repos', []))}개 제외",
        )
    lines += [
        "",
        "## 이번 주 주요 업무",
        "",
    ]
    for item in items:
        if item.excluded:
            continue
        lines += [
            f"### {md_text(item.title_ko)}",
            f"- 수행: {md_text(item.summary_ko)}",
            f"- 상태: {md_text(item.status)}",
            "- 참여: " + ", ".join(f"{md_text(c['login'])}({md_text(c['role'])})" for c in item.contributors),
            "- 근거: "
            + (", ".join(f"[{md_text(e['label'])}]({e['url']})" for e in item.evidence) or "근거 부족"),
            "",
        ]
        if item.unsupported_claims:
            lines += ["- 검증 필요: " + md_text("; ".join(item.unsupported_claims)), ""]
    if not any(not i.excluded for i in items):
        lines += ["선택한 기간과 사용자에 해당하는 활동이 없습니다.", ""]
    lines += ["## 진행 중 및 후속 확인", ""]
    pending = [i for i in items if not i.excluded and i.status == "작업 중"]
    lines += [
        f"- {md_text(i.title_ko)}: 열린 PR 상태 확인 · [근거]({i.evidence[0]['url']})"
        for i in pending
        if i.evidence
    ] or ["- 근거로 확인된 열린 과제가 없습니다."]
    lines += ["", "## 데이터 공백/검토 필요", ""]
    lines += [
        f"- {md_text(w.get('message_ko', w['code']))}"
        + (f" ({md_text(w['repository'])})" if w.get("repository") else "")
        for w in warnings
    ] or ["- 수집 실패 없음. 기본 브랜치와 기간 관련 PR 범위에서 조회했습니다."]
    return "\n".join(lines) + "\n"


def render_html(markdown: str) -> str:
    rendered = MarkdownIt("commonmark", {"html": False}).render(markdown)
    return bleach.clean(
        rendered,
        tags={"h1", "h2", "h3", "p", "ul", "ol", "li", "blockquote", "strong", "em", "code", "pre", "a"},
        attributes={"a": ["href", "title"]},
        protocols={"https"},
        strip=True,
    )
