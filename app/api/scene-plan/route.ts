import { NextRequest, NextResponse } from "next/server";
import { isHousePlan, type HousePlan } from "../../../lib/house-plan";

export const runtime = "nodejs";
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const schema = {
 type: "OBJECT",
 properties: {
  stories: {type:"INTEGER"},
  roof_type: {type:"STRING", enum:["gable","hip","shed","flat"]},
  roof_color: {type:"STRING"},
  siding_color: {type:"STRING"},
  roof_ridge_direction: {type:"STRING",enum:["front_to_back","left_to_right"]},
  roof_pitch: {type:"STRING",enum:["low","medium","steep"]},
  openings: {type:"ARRAY",items:{type:"OBJECT",properties:{
    kind:{type:"STRING",enum:["window","entry_door","garage_door"]},
    x:{type:"NUMBER"},y:{type:"NUMBER"},width:{type:"NUMBER"},height:{type:"NUMBER"}
  },required:["kind","x","y","width","height"]}},
  porch_posts: {type:"ARRAY",items:{type:"NUMBER"}},
  architectural_notes: {type:"STRING"}
 },
 required:["stories","roof_type","roof_color","siding_color","roof_ridge_direction","roof_pitch","openings","porch_posts","architectural_notes"]
} as const;

export async function POST(request:NextRequest) {
 const key=process.env.GEMINI_API_KEY;
 if(!key)return NextResponse.json({error:"Add GEMINI_API_KEY to .env.local and restart Next.js."},{status:503});
 let form:FormData;
 try{form=await request.formData()}catch{return NextResponse.json({error:"Expected image upload."},{status:400})}
 const photo=form.get("photo");
 if(!(photo instanceof File)||!TYPES.has(photo.type)||photo.size<1||photo.size>MAX_BYTES)
  return NextResponse.json({error:"Upload a JPEG/PNG/WebP photo under 8 MB."},{status:400});
 const encoded=Buffer.from(await photo.arrayBuffer()).toString("base64");
 const model=process.env.GEMINI_MODEL||"gemini-3.5-flash-lite";
 const abort=new AbortController();
 const timer=setTimeout(()=>abort.abort(),60000);
 try {
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
    method:"POST",
    headers:{"Content-Type":"application/json","x-goog-api-key":key},
    signal:abort.signal,
    body:JSON.stringify({
      contents:[{role:"user",parts:[
       {text:"Create a normalized FRONT FACADE SCHEMATIC for a THREE.JS procedural mesh generator from this REAL home photograph. This is NOT photogrammetry. Output estimated visible layout only. Stories: 1 or 2. Specify approximate wall/siding and roof HEX colors (e.g. #eee9dd). Roof shape gable/hip/shed/flat, principal ridge direction, roof pitch. For each visible window, entry door, garage door return a normalized bounding rectangle relative to the main visible facade: x is left edge from 0..1, y is bottom edge from 0..1 (GROUND=0), width and height fractions 0..1. Do not infer windows or doors on unseen elevations. For porch posts use x positions from 0..1. Output no more than 18 openings and 8 posts. Exclude occluded/uncertain elements. Keep notes short, state uncertainties. All dimensions and geometry will be illustrative and NOT measured. If this is not a residential exterior, return no openings."},
       {inlineData:{mimeType:photo.type,data:encoded}}
      ]}],
      generationConfig:{responseMimeType:"application/json",responseSchema:schema,temperature:0.1,maxOutputTokens:1400}
    })
  });
  const payload=await response.json();
  if(!response.ok){
    const msg=String(payload?.error?.message||"Check Gemini project/model access.").slice(0,350);
    return NextResponse.json({error:response.status===429?"Gemini free-tier rate limit reached; retry later.":`Gemini returned ${response.status}: ${msg}`},{status:response.status===429?429:502});
  }
  const txt=payload?.candidates?.[0]?.content?.parts?.filter((p:{text?:string})=>typeof p.text==="string").map((p:{text:string})=>p.text).join("");
  if(!txt)return NextResponse.json({error:"Gemini did not return a layout. Try a clearer front-view photo."},{status:502});
  let parsed:unknown;
  try{parsed=JSON.parse(txt)}catch{return NextResponse.json({error:"Gemini returned an invalid layout. Try again."},{status:502})}
  if(!isHousePlan(parsed))return NextResponse.json({error:"Gemini layout did not match the expected format."},{status:502});
  const plan=parsed as HousePlan;
  // Bound untrusted model output to prevent giant / pathological meshes.
  const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
  const openings=plan.openings.slice(0,18).map(o=>{
    const x=clamp(o.x,0,.95),y=clamp(o.y,0,.95);
    return {...o,x,y,width:clamp(o.width,.035,Math.max(.035,1-x)),height:clamp(o.height,.045,Math.max(.045,1-y))};
  });
  return NextResponse.json({plan:{
    ...plan,stories:clamp(Math.round(plan.stories),1,2),
    openings,porch_posts:plan.porch_posts.slice(0,8).map(v=>clamp(v,0,1)),
    siding_color:/^#[0-9a-fA-F]{6}$/.test(plan.siding_color)?plan.siding_color:"#e2ddd2",
    roof_color:/^#[0-9a-fA-F]{6}$/.test(plan.roof_color)?plan.roof_color:"#414850",
    architectural_notes:plan.architectural_notes.slice(0,500)
  },model});
 }catch(e){return NextResponse.json({error:e instanceof Error&&e.name==="AbortError"?"Geometry planning timed out.":"Could not generate the house layout."},{status:502})}
 finally{clearTimeout(timer)}
}
