/**
 * Bounded retries for transient Gemini failures.
 *
 * Requests formerly shared one 60s AbortController across ALL attempts.
 * A slow attempt exhausted the entire budget and made subsequent retries
 * impossible. Here each attempt has its own timeout and safe exponential
 * backoff. Permission, quota and validation errors are returned immediately.
 */
export async function fetchGeminiWithRetry(
  url: string,
  options: RequestInit,
  maxAttempts = 2,
  timeoutPerAttemptMs = 85000
): Promise<Response> {
  const externalSignal=options.signal;
  for(let attempt=0;attempt<maxAttempts;attempt++){
    if(externalSignal?.aborted)throw new DOMException("Cancelled","AbortError");
    const controller=new AbortController();
    const onExternalAbort=()=>controller.abort();
    externalSignal?.addEventListener("abort",onExternalAbort,{once:true});
    const timeout=setTimeout(()=>controller.abort(),timeoutPerAttemptMs);
    try {
      const response=await fetch(url,{...options,signal:controller.signal,cache:"no-store"});
      if(![500,502,503,504].includes(response.status)||attempt===maxAttempts-1)return response;
      await response.body?.cancel();
    }catch(error){
      if(externalSignal?.aborted)throw error;
      if(attempt===maxAttempts-1)throw error;
      // Retry timeouts and network errors once, never quota/permission errors.
    }finally{
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort",onExternalAbort);
    }
    const backoff=1000*Math.pow(2,attempt)+Math.floor(Math.random()*400);
    await new Promise(resolve=>setTimeout(resolve,backoff));
  }
  throw new Error("Gemini did not return a response.");
}
