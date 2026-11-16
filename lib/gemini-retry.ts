/**
 * Bounded retry for transient Gemini API failures.
 * This code only retries the SAME configured model; it never switches to a
 * different model or billing tier without the developer explicitly choosing one.
 */
export async function fetchGeminiWithRetry(
  url: string,
  options: RequestInit,
  maxAttempts = 3
): Promise<Response> {
  let response: Response | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Each attempt gets its own short network deadline; preserve the caller's
    // AbortSignal so a cancelled request is never retried.
    response = await fetch(url, options);
    if (![500, 502, 503, 504].includes(response.status) || attempt === maxAttempts - 1) {
      return response;
    }
    // Release the response body before repeating the request.
    await response.body?.cancel();
    const jitter = Math.floor(Math.random() * 250);
    const delay = Math.min(4000, 900 * 2 ** attempt) + jitter;
    await new Promise<void>((resolve, reject) => {
      if (options.signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
      const timer = setTimeout(() => { options.signal?.removeEventListener("abort", onAbort); resolve(); }, delay);
      function onAbort() { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }
      options.signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  if (!response) throw new Error("No response received from Gemini.");
  return response;
}
