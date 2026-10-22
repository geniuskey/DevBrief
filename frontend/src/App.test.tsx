import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";
import { safeEvidenceUrl } from "./api/client";
afterEach(() => vi.unstubAllGlobals());
test("renders Korean creation form with allowlisted repositories", async () => {
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
          : url.endsWith("/teams")
            ? []
            : url.endsWith("/me")
              ? { role: "admin" }
              : { adapter_mode: "fake" },
    })),
  );
  render(<App />);
  expect(
    screen.getByRole("heading", { name: "개발 주간보고" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByLabelText(/example-org\/vision/)).toBeChecked(),
  );
  expect(screen.getByRole("button", { name: "주간보고 생성 →" })).toBeEnabled();
});
test("rejects script and credential URLs", () => {
  expect(safeEvidenceUrl("javascript:alert(1)")).toBeUndefined();
  expect(safeEvidenceUrl("https://user:pass@evil.test/")).toBeUndefined();
  expect(
    safeEvidenceUrl("https://github.internal.example/org/repo/pull/1"),
  ).toMatch(/^https:/);
});
