import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";
import { ApiError, api, isNotFound, safeEvidenceUrl } from "./api/client";
import { Button } from "./components/ui";
import { csvCell, periodPresets, scopeLabel } from "./lib/format";
import { Markdown } from "./lib/markdown";

function stubApi(role = "admin") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith("/repositories")
          ? [
              {
                id: "repo-a",
                full_name: "example-org/vision",
                access_state: "unverified",
              },
            ]
          : url.endsWith("/teams") ||
              url.endsWith("/organizations") ||
              url.includes("/reports")
            ? []
            : url.endsWith("/me")
              ? { id: "u1", name: "demo", role }
              : {
                  adapter_mode: "fake",
                  demo_period: {
                    start_date: "2026-10-12",
                    end_date: "2026-10-18",
                  },
                },
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "";
});

test("renders the creation form with allowlisted repositories", async () => {
  stubApi();
  window.location.hash = "#/new";
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "주간보고 만들기" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByLabelText(/example-org\/vision/)).toBeChecked(),
  );
  expect(screen.getByText("alice")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /주간보고 생성/ })).toBeEnabled();
});

test("whole-org scope covers its repositories in the picker", async () => {
  stubApi();
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) =>
    String(input).endsWith("/organizations")
      ? ({
          ok: true,
          json: async () => [{ login: "example-org", repository_count: 1 }],
        } as Response)
      : base(input, init),
  );
  window.location.hash = "#/new";
  render(<App />);
  const chip = await screen.findByRole("button", { name: /example-org/ });
  chip.click();
  await waitFor(() => expect(chip).toHaveAttribute("aria-pressed", "true"));
  expect(screen.getByLabelText(/example-org\/vision/)).toBeDisabled();
  expect(screen.getByText("조직 전체 포함")).toBeInTheDocument();
  expect(screen.getByText("조직 example-org 전체")).toBeInTheDocument();
});

test("home greets the user and links to the admin console for admins", async () => {
  stubApi();
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "안녕하세요, demo님" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("link", { name: /관리자 콘솔/ }),
  ).toHaveAttribute("href", "#/admin");
});

test("admin console is blocked for non-admins", async () => {
  stubApi("author");
  window.location.hash = "#/admin";
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "관리자 권한이 필요합니다" }),
  ).toBeInTheDocument();
});

test("rejects script and credential URLs", () => {
  expect(safeEvidenceUrl("javascript:alert(1)")).toBeUndefined();
  expect(safeEvidenceUrl("https://user:pass@evil.test/")).toBeUndefined();
  expect(
    safeEvidenceUrl("https://github.internal.example/org/repo/pull/1"),
  ).toMatch(/^https:/);
});

test("markdown renderer only links safe URLs and unescapes text", () => {
  render(
    <Markdown
      source={
        "# 제목\n\n- [PR 42](https://github.internal.example/pr/42)\n- [bad](javascript:alert(1))\n- example\\-org"
      }
    />,
  );
  expect(screen.getByRole("heading", { name: "제목" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "PR 42" })).toHaveAttribute(
    "href",
    "https://github.internal.example/pr/42",
  );
  expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
  expect(screen.getByText("example-org")).toBeInTheDocument();
});

test("period presets use Monday-based KST weeks", () => {
  const [lastWeek, thisWeek] = periodPresets("2026-10-22");
  expect(lastWeek).toMatchObject({ start: "2026-10-12", end: "2026-10-18" });
  expect(thisWeek).toMatchObject({ start: "2026-10-19", end: "2026-10-21" });
});

test("loading button stays disabled even when disabled=false is passed", () => {
  render(
    <Button loading disabled={false}>
      저장
    </Button>,
  );
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
});

test("api errors carry HTTP status for not-found handling", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ code: "NOT_FOUND", message_ko: "없음" }),
    })),
  );
  const error = await api("/jobs/x").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(isNotFound(error)).toBe(true);
  expect(isNotFound(new Error("network"))).toBe(false);
});

test("scope label counts repositories without ids", () => {
  expect(scopeLabel({ repository_count: 0, organizations: ["org"] })).toBe(
    "조직 org 전체",
  );
  expect(scopeLabel({ repository_count: 2 })).toBe("저장소 2개");
});

test("csv cells neutralise spreadsheet formulas", () => {
  expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  expect(csvCell("-1+2")).toBe(`"'-1+2"`);
  expect(csvCell("alice")).toBe(`"alice"`);
});
