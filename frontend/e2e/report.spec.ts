import { test, expect } from "@playwright/test";

test("create partial report, edit, exclude, restore, finalize and find history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "개발 주간보고" }),
  ).toBeVisible();
  await page.getByLabel(/example-org\/restricted/).check();
  await page.getByRole("button", { name: "주간보고 생성 →" }).click();
  await expect(
    page.getByText("보고서 준비 완료", { exact: false }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("부분 수집", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "ROI 경계 오류 수정" }),
  ).toBeVisible();
  const roi = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "ROI 경계 오류 수정" }) });
  await expect(roi.getByText("alice (작성) · bob (리뷰)")).toBeVisible();
  await roi.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByLabel("업무 제목").fill("ROI 경계 오류 수정 및 검토");
  await page.getByRole("button", { name: "수정 저장" }).click();
  await expect(
    page.getByRole("heading", { name: "ROI 경계 오류 수정 및 검토" }),
  ).toBeVisible();
  const edited = page.locator("article").filter({
    has: page.getByRole("heading", { name: "ROI 경계 오류 수정 및 검토" }),
  });
  await edited.getByRole("button", { name: "제외", exact: true }).click();
  await expect(edited.getByText(/보고서에서 제외/)).toBeVisible();
  await edited.getByRole("button", { name: "다시 포함" }).click();
  await expect(
    edited.getByRole("button", { name: "제외", exact: true }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "히스토리" }).click();
  await expect(
    page.getByRole("heading", { name: "보고서 히스토리" }),
  ).toBeVisible();
  await page.locator(".history-row").first().click();
  await expect(
    page.getByRole("heading", { name: "ROI 경계 오류 수정 및 검토" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile creation and admin connection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "주간보고 생성 →" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/create-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "관리", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "내부 서비스 연결" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "연결 검사" }).first().click();
  await expect(page.getByRole("status")).toContainText("3.18.0");
});
