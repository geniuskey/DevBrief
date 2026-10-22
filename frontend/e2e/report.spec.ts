import { test, expect } from "@playwright/test";

test("create partial report, edit, exclude, restore, finalize and find history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /안녕하세요/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "새 보고서 만들기" }).click();
  await expect(
    page.getByRole("heading", { name: "주간보고 만들기" }),
  ).toBeVisible();
  await page.getByLabel(/example-org\/restricted/).check();
  await page.screenshot({
    path: "test-results/create-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "주간보고 생성" }).click();
  await expect(
    page.getByRole("heading", { name: /개발 주간보고$/ }),
  ).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByText("부분 수집", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1개 저장소를 수집하지 못했습니다"),
  ).toBeVisible();
  const roi = page.getByRole("article", { name: "ROI 경계 오류 수정" });
  await expect(roi.getByLabel("참여자")).toContainText("alice작성");
  await expect(roi.getByLabel("참여자")).toContainText("bob리뷰");
  await roi.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByLabel(/업무 제목/).fill("ROI 경계 오류 수정 및 검토");
  await page.getByRole("button", { name: "수정 저장" }).click();
  const edited = page.getByRole("article", {
    name: "ROI 경계 오류 수정 및 검토",
  });
  await expect(edited.getByRole("heading")).toHaveText(
    "ROI 경계 오류 수정 및 검토",
  );
  await edited.getByRole("button", { name: "제외", exact: true }).click();
  await expect(edited.getByText("보고서에서 제외")).toBeVisible();
  await edited.getByRole("button", { name: "다시 포함" }).click();
  await expect(
    edited.getByRole("button", { name: "제외", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "문서 미리보기" }).click();
  await expect(
    page
      .locator(".markdown")
      .getByRole("heading", { name: "ROI 경계 오류 수정 및 검토" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "업무 항목" }).click();
  await page.getByLabel("근거 링크와 수집 누락을 확인했습니다.").check();
  await page.getByRole("button", { name: "보고서 확정", exact: true }).click();
  await expect(
    page.getByText("보고서를 확정했습니다.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "수정", exact: true }),
  ).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "MD 다운로드" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^devbrief-.*\.md$/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/report-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "보고서" })
    .click();
  await expect(
    page.getByRole("heading", { name: "보고서 기록" }),
  ).toBeVisible();
  await page.locator(".report-row").first().click();
  await expect(
    page.getByRole("article", { name: "ROI 경계 오류 수정 및 검토" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("teams can be created and used to start a report", async ({ page }) => {
  const name = `E2E 팀 ${Date.now()}`;
  await page.goto("/#/teams");
  await page.getByRole("button", { name: "새 팀" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("팀 이름").fill(name);
  await dialog.getByLabel("구성원 GitHub ID").fill("alice bob ");
  await dialog.getByLabel(/example-org\/vision/).check();
  await dialog.getByRole("button", { name: "팀 만들기" }).click();
  const card = page.locator(".team-card").filter({ hasText: name });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "보고서 만들기" }).click();
  await expect(
    page.getByRole("heading", { name: "주간보고 만들기" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "bob 제거" })).toBeVisible();
  await expect(page.getByLabel(/example-org\/vision/)).toBeChecked();
});

test("mobile creation and admin console", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/new");
  await expect(
    page.getByRole("button", { name: "주간보고 생성" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/create-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await page.getByRole("link", { name: "관리자 콘솔" }).click();
  await expect(page.getByRole("heading", { name: "운영 개요" })).toBeVisible();
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await page.getByRole("link", { name: "연결 상태" }).click();
  await page.getByRole("button", { name: "연결 검사" }).first().click();
  await expect(page.getByRole("status").first()).toContainText("3.18.0");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("admin pages render", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [path, heading] of [
    ["/#/admin", "운영 개요"],
    ["/#/admin/jobs", "작업 모니터"],
    ["/#/admin/users", "사용자"],
    ["/#/admin/audit", "감사 로그"],
    ["/#/admin/policy", "정책·설정"],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `test-results/admin-${path.split("/").pop() || "overview"}.png`,
      fullPage: true,
    });
  }
  await expect(page.getByText("example-org/vision")).toBeVisible();
  expect(errors).toEqual([]);
});
