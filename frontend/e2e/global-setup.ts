export default async function setup() {
  const base = process.env.E2E_BASE_URL || "http://127.0.0.1:5174";
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${base}/api/v1/health/live`);
      if (response.ok) return;
    } catch {
      /* server starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("DevBrief API/UI did not become ready");
}
