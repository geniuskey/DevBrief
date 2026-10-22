from app.schemas.contracts import ReportRequest


def test_kst_inclusive_end():
    body = ReportRequest(
        github_logins=["alice"], repository_ids=["r"], start_date="2026-10-12", end_date="2026-10-18"
    )
    start, end = body.window()
    assert start.isoformat() == "2026-10-11T15:00:00+00:00"
    assert end.isoformat() == "2026-10-18T15:00:00+00:00"
