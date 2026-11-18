import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import ts from "typescript";

// Load the actual source with TypeScript's own transpiler. No separate test
// framework or fragile hand-maintained copy of production validation logic.
async function loadTs(relativePath) {
  const source=readFileSync(resolve(process.cwd(),relativePath),"utf8");
  const compiled=ts.transpileModule(source,{
    fileName:relativePath,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
  });
  return import("data:text/javascript;base64,"+Buffer.from(compiled.outputText).toString("base64"));
}

const {isHousePlan}=await loadTs("lib/house-plan.ts");
const examples=[
  "examples/cottage-facade-test.json",
  "examples/overlapping-front-gables-test.json"
];
const fixture=(name)=>JSON.parse(readFileSync(resolve(process.cwd(),name),"utf8"));

for(const file of examples){
  test("valid architectural example: "+file,()=>{
    assert.equal(isHousePlan(fixture(file)),true);
  });
}

test("rejects missing core fields and incorrect types",()=>{
  const plan=fixture(examples[0]);
  assert.equal(isHousePlan(null),false);
  assert.equal(isHousePlan({}),false);
  assert.equal(isHousePlan({...plan,stories:"two"}),false);
  assert.equal(isHousePlan({...plan,roof_type:"cone"}),false);
  assert.equal(isHousePlan({...plan,openings:"not-an-array"}),false);
});

test("rejects invalid semantic openings",()=>{
  const plan=fixture(examples[1]);
  assert.equal(isHousePlan({...plan,openings:[{kind:"chimney",x:.2,y:.1,width:.2,height:.3}]}),false);
  assert.equal(isHousePlan({...plan,openings:[{kind:"garage_door",x:NaN,y:.1,width:.2,height:.3}]}),false);
  assert.equal(isHousePlan({...plan,openings:[{kind:"window",x:.2,y:.1,width:.2,height:.3,shape:"hexagon"}]}),false);
});

test("rejects invalid half-story configuration",()=>{
  const plan=fixture(examples[0]);
  assert.equal(isHousePlan({...plan,upper_level:{...plan.upper_level,type:"attic_lounge"}}),false);
  assert.equal(isHousePlan({...plan,upper_level:{...plan.upper_level,windows:7}}),false);
  assert.equal(isHousePlan({...plan,upper_level:{...plan.upper_level,width:1.7}}),false);
});

test("rejects invalid foundation and porch plan",()=>{
  const plan=fixture(examples[0]);
  assert.equal(isHousePlan({...plan,foundation:{raised:"yes",height:.6}}),false);
  assert.equal(isHousePlan({...plan,foundation:{raised:true,height:5}}),false);
  assert.equal(isHousePlan({...plan,porch:{...plan.porch,railing:"yes"}}),false);
});

test("fixtures preserve two independent roof-layout regression cases",()=>{
  const cottage=fixture(examples[0]),farmhouse=fixture(examples[1]);
  assert.equal(cottage.upper_level.type,"half_story");
  assert.equal(cottage.dormer.window_count,2);
  assert.equal(cottage.foundation.raised,true);
  assert.equal(farmhouse.roof_feature,"front_gable");
  assert.equal(farmhouse.front_gables.length,2);
  assert.ok(farmhouse.openings.some(o=>o.kind==="garage_door"));
  assert.equal(farmhouse.upper_level.type,"none");
});
