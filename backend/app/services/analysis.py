from app.core.security import AppError
from app.integrations.llm_client import LLMClient


def analyze_work(items, settings, warnings, progress=lambda *_: None):
    client = LLMClient(settings)
    try:
        for index, item in enumerate(items):
            progress("analyzing", 65 + int(index / max(len(items), 1) * 25))
            try:
                output = client.analyze(item)
                item.title_ko, item.summary_ko = output.title_ko, output.summary_ko
                item.category, item.confidence = output.category, output.confidence
                # Keep every original evidence/role; model may select a subset to support the summary.
                for evidence in item.evidence:
                    evidence["supports_summary"] = evidence["id"] in output.evidence_ids
            except AppError as exc:
                item.unsupported_claims = [
                    "검증 필요: AI 요약을 적용하지 못해 원문 기반 활동 기록으로 대체했습니다"
                ]
                warnings.append({"code": exc.code, "message_ko": exc.message})
    finally:
        client.close()
    return items
