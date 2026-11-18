import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import ts from "typescript";

const source=readFileSync(resolve(process.cwd(),"lib/gemini-retry.ts"),"utf8");
const compiled=ts.transpileModule(source,{
 fileName:"lib/gemini-retry.ts",
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
});
const {fetchGeminiWithRetry}=await import(
 "data:text/javascript;base64,"+Buffer.from(compiled.outputText).toString("base64")
);

test("Gemini request returns success without retry",async()=>{
 const before=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response("ok",{status:200});};
 try{
  const response=await fetchGeminiWithRetry("https://example.invalid",{},2,1000);
  assert.equal(response.status,200);assert.equal(calls,1);
 }finally{globalThis.fetch=before;}
});
test("does not retry invalid API keys or rate-limited requests",async()=>{
 const before=globalThis.fetch;
 try{
  for(const status of [400,401,403,429]){
   let calls=0;
   globalThis.fetch=async()=>{calls++;return new Response("error",{status});};
   const response=await fetchGeminiWithRetry("https://example.invalid",{},2,1000);
   assert.equal(response.status,status);assert.equal(calls,1);
  }
 }finally{globalThis.fetch=before;}
});
test("retries temporary 503 failures and accepts recovery",async()=>{
 const before=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(calls===1?"unavailable":"ok",{status:calls===1?503:200});};
 try{
  const response=await fetchGeminiWithRetry("https://example.invalid",{},2,1000);
  assert.equal(response.status,200);assert.equal(calls,2);
 }finally{globalThis.fetch=before;}
});
