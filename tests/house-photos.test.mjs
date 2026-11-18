import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import ts from "typescript";

async function loadTs(relativePath){
 const source=readFileSync(resolve(process.cwd(),relativePath),"utf8");
 const compiled=ts.transpileModule(source,{
   fileName:relativePath,
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
 });
 return import("data:text/javascript;base64,"+Buffer.from(compiled.outputText).toString("base64"));
}
const {readHousePhotos,photoParts}=await loadTs("lib/house-photos.ts");
const fake=(name="home.jpg",type="image/jpeg",bytes=8)=>new File([new Uint8Array(bytes)],name,{type});
function makeForm(items){
 const form=new FormData();
 for(const [view,file] of items){form.append("photos",file);form.append("views",view);}
 return form;
}
test("accepts one front photo and encodes contents",async()=>{
 const photos=await readHousePhotos(makeForm([["front",fake()]]));
 assert.equal(photos.length,1);
 assert.equal(photos[0].view,"front");
 assert.equal(photos[0].content.inlineData.mimeType,"image/jpeg");
 assert.equal(Buffer.from(photos[0].content.inlineData.data,"base64").byteLength,8);
});
test("accepts four distinct viewpoints",async()=>{
 const input=[["front",fake()],["left",fake("left.png","image/png")],
 ["right",fake("right.webp","image/webp")],["rear",fake("rear.jpg")]];
 const photos=await readHousePhotos(makeForm(input));
 assert.deepEqual(photos.map(x=>x.view),["front","left","right","rear"]);
 assert.equal(photoParts(photos).length,8);
});
test("rejects zero or more than four photos",async()=>{
 await assert.rejects(readHousePhotos(new FormData()),/between 1 and 4/i);
 const repeated=[["front",fake()],["left",fake()],["right",fake()],["rear",fake()],["front",fake()]];
 await assert.rejects(readHousePhotos(makeForm(repeated)),/between 1 and 4/i);
});
test("rejects duplicate or invalid view labels",async()=>{
 await assert.rejects(readHousePhotos(makeForm([["front",fake()],["front",fake()]])),/different viewpoint/i);
 await assert.rejects(readHousePhotos(makeForm([["attic",fake()]])),/viewpoint/i);
});
test("rejects unsupported, empty, or oversized images",async()=>{
 await assert.rejects(readHousePhotos(makeForm([["front",fake("bad.gif","image/gif")]])),/JPEG/i);
 await assert.rejects(readHousePhotos(makeForm([["front",fake("empty.jpg","image/jpeg",0)]])),/JPEG/i);
 await assert.rejects(readHousePhotos(makeForm([["front",fake("huge.jpg","image/jpeg",8*1024*1024+1)]])),/8 MB/i);
});
test("supports legacy photo field for existing clients",async()=>{
 const form=new FormData();form.append("photo",fake("legacy.png","image/png"));
 const photos=await readHousePhotos(form);
 assert.equal(photos.length,1);assert.equal(photos[0].view,"front");
});
