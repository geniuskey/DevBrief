import re
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ReportRequest(StrictModel):
    type: Literal["personal", "team"] = "team"
    github_logins: list[str] = Field(min_length=1, max_length=50)
    repository_ids: list[str] = Field(min_length=1, max_length=20)
    start_date: date
    end_date: date
    timezone: str = "Asia/Seoul"
    policy: Literal["metadata_only"] = "metadata_only"
    template: Literal["technical_weekly_ko"] = "technical_weekly_ko"
    team_id: str | None = None

    @field_validator("github_logins")
    @classmethod
    def logins(cls, values):
        if any(not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}(?:\[bot\])?", s) for s in values):
            raise ValueError("GitHub ID 형식을 확인하세요")
        return list(dict.fromkeys(s.lower() for s in values))

    @model_validator(mode="after")
    def dates(self):
        try:
            tz = ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("유효한 시간대가 아닙니다") from exc
        if self.end_date < self.start_date or (self.end_date - self.start_date).days > 92:
            raise ValueError("조회 기간은 시작일부터 최대 93일입니다")
        if self.end_date > datetime.now(tz).date():
            raise ValueError("미래 날짜는 조회할 수 없습니다")
        if self.start_date.year < 1970:
            raise ValueError("1970년 이후 날짜를 선택하세요")
        self.repository_ids = list(dict.fromkeys(self.repository_ids))
        return self

    def window(self) -> tuple[datetime, datetime]:
        tz = ZoneInfo(self.timezone)
        return (
            datetime.combine(self.start_date, time.min, tz).astimezone(UTC),
            datetime.combine(self.end_date + timedelta(days=1), time.min, tz).astimezone(UTC),
        )


class WorkItemPatch(StrictModel):
    version: int = Field(ge=1)
    title_ko: str | None = Field(default=None, min_length=1, max_length=300)
    summary_ko: str | None = Field(default=None, min_length=1, max_length=4000)
    excluded: bool | None = None


class FinalizeRequest(StrictModel):
    revision: int = Field(ge=1)


class TeamInput(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    github_logins: list[str] = Field(min_length=1, max_length=50)
    repository_ids: list[str] = Field(min_length=1, max_length=20)

    @field_validator("github_logins")
    @classmethod
    def logins(cls, values):
        return ReportRequest.logins(values)
