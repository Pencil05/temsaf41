export type RequestProgress = { phase: "sending" | "retrying" | "success" | "error"; attempt: number; message: string };

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: { retries?: number; baseDelayMs?: number; onProgress?: (progress: RequestProgress) => void } = {},
) {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 900;
  let lastError: unknown;
  const headers = new Headers(init?.headers);
  if (!headers.has("X-TEMS-Request-ID")) headers.set("X-TEMS-Request-ID", crypto.randomUUID());
  const requestInit = { ...init, headers };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    options.onProgress?.({ phase: attempt ? "retrying" : "sending", attempt: attempt + 1, message: attempt ? `การเชื่อมต่อช้า กำลังลองใหม่ครั้งที่ ${attempt + 1}` : "กำลังส่งข้อมูลเข้าสู่ระบบ" });
    try {
      const response = await fetch(input, requestInit);
      if (response.ok || response.status < 500 && response.status !== 429) {
        options.onProgress?.({ phase: response.ok ? "success" : "error", attempt: attempt + 1, message: response.ok ? "ระบบรับข้อมูลเรียบร้อยแล้ว" : "ระบบไม่สามารถรับรายการนี้ได้" });
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) await new Promise((resolve) => window.setTimeout(resolve, baseDelayMs * 2 ** attempt));
  }

  options.onProgress?.({ phase: "error", attempt: retries + 1, message: "เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง" });
  throw lastError instanceof Error ? lastError : new Error("ไม่สามารถเชื่อมต่อระบบได้");
}
