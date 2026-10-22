export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message_ko || `요청에 실패했습니다 (${response.status})`,
    );
  }
  return response.json() as Promise<T>;
}
export function safeEvidenceUrl(value: string): string | undefined {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
