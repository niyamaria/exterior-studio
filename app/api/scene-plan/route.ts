import { NextRequest, NextResponse } from "next/server";
import { fetchGeminiWithRetry } from "../../../lib/gemini-retry";
import { isHousePlan, type HousePlan } from "../../../lib/house-plan";
import {readHousePhotos,photoParts} from "../../../lib/house-photos";

export const runtime = "nodejs";
export const maxDuration = 180;
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const schema = {
 type: "OBJECT",
 properties: {
  stories: {type:"INTEGER"},
  roof_type: {type:"STRING", enum:["gable","hip","shed","flat"]},
  roof_color: {type:"STRING"},
  siding_color: {type:"STRING"},
  trim_color:{type:"STRING"},
  garage_color:{type:"STRING"},
  front_door_color:{type:"STRING"},
  shutter_color:{type:"STRING"},
  window_frame_color:{type:"STRING"},
  window_glass_color:{type:"STRING"},
  roof_ridge_direction: {type:"STRING",enum:["front_to_back","left_to_right"]},
  roof_pitch: {type:"STRING",enum:["low","medium","steep"]},
  roof_feature:{type:"STRING",enum:["front_gable","central_dormer","none"]},
  upper_level:{type:"OBJECT",properties:{type:{type:"STRING",enum:["none","dormer","half_story"]},width:{type:"NUMBER"},height:{type:"NUMBER"},inset:{type:"NUMBER"},windows:{type:"INTEGER"}},required:["type","width","height","inset","windows"]},
  dormer:{type:"OBJECT",properties:{center_x:{type:"NUMBER"},width:{type:"NUMBER"},rise:{type:"NUMBER"},window_count:{type:"INTEGER"}},required:["center_x","width","rise","window_count"]},
  porch:{type:"OBJECT",properties:{x:{type:"NUMBER"},width:{type:"NUMBER"},depth:{type:"NUMBER"},railing:{type:"BOOLEAN"}},required:["x","width","depth","railing"]},
  door:{type:"OBJECT",properties:{x:{type:"NUMBER"},y:{type:"NUMBER"},width:{type:"NUMBER"},height:{type:"NUMBER"}},required:["x","y","width","height"]},
  entry_steps:{type:"OBJECT",properties:{present:{type:"BOOLEAN"},count:{type:"INTEGER"},center_x:{type:"NUMBER"},width:{type:"NUMBER"}},required:["present","count","center_x","width"]},
  foundation:{type:"OBJECT",properties:{raised:{type:"BOOLEAN"},height:{type:"NUMBER"}},required:["raised","height"]},
  dormer_windows:{type:"ARRAY",items:{type:"OBJECT",properties:{x:{type:"NUMBER"},y:{type:"NUMBER"},width:{type:"NUMBER"},height:{type:"NUMBER"}},required:["x","y","width","height"]}},
  openings: {type:"ARRAY",items:{type:"OBJECT",properties:{
    kind:{type:"STRING",enum:["window","entry_door","garage_door"]},
    x:{type:"NUMBER"},y:{type:"NUMBER"},width:{type:"NUMBER"},height:{type:"NUMBER"},shape:{type:"STRING",enum:["arched","rectangular"]},shutters:{type:"BOOLEAN"}
  },required:["kind","x","y","width","height","shape","shutters"]}},
  porch_posts: {type:"ARRAY",items:{type:"NUMBER"}},
  architectural_notes: {type:"STRING"},
  garage_side:{type:"STRING",enum:["left","right","none"]},
  siding_style:{type:"STRING",enum:["board_and_batten","lap","stucco","other"]},
  front_gables:{type:"ARRAY",items:{type:"OBJECT",properties:{center_x:{type:"NUMBER"},width:{type:"NUMBER"},height_ratio:{type:"NUMBER"}},required:["center_x","width","height_ratio"]}},
  side_openings:{type:"ARRAY",items:{type:"OBJECT",properties:{view:{type:"STRING",enum:["left","right","rear"]},kind:{type:"STRING",enum:["window","entry_door","garage_door"]},x:{type:"NUMBER"},y:{type:"NUMBER"},width:{type:"NUMBER"},height:{type:"NUMBER"}},required:["view","kind","x","y","width","height"]}}
 },
 required:["stories","roof_type","roof_color","siding_color","trim_color","garage_color","front_door_color","shutter_color","window_frame_color","window_glass_color","roof_ridge_direction","roof_pitch","roof_feature","upper_level","dormer","porch","door","entry_steps","foundation","dormer_windows","openings","porch_posts","architectural_notes","garage_side","siding_style","front_gables","side_openings"]
} as const;

export async function POST(request:NextRequest) {
 const key=process.env.GEMINI_API_KEY;
 if(!key)return NextResponse.json({error:"Add GEMINI_API_KEY to .env.local and restart Next.js."},{status:503});
 let form:FormData;
 try{form=await request.formData()}catch{return NextResponse.json({error:"Expected image upload."},{status:400})}
 let photos:Awaited<ReturnType<typeof readHousePhotos>>;
 try{photos=await readHousePhotos(form)}catch(error){
   return NextResponse.json({error:error instanceof Error?error.message:"Invalid photo selection."},{status:400});
 }
 const model=process.env.GEMINI_MODEL||"gemini-3.5-flash-lite";
 try {
  const response=await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
    method:"POST",
    headers:{"Content-Type":"application/json","x-goog-api-key":key},
    body:JSON.stringify({
      contents:[{role:"user",parts:[
       {text:"Create a precise normalized architectural SCHEMATIC for a procedural Blender model from the provided labeled photos of ONE REAL HOUSE. Focus on preserving the front-facing silhouette. Crucial: distinguish a triangular FRONT GABLE covering a whole wall from a small CENTRAL DORMER that projects out of a wide side-to-side primary roof. A cottage with a big transverse sloping roof and a center window pair inside a raised gable has roof_feature=central_dormer, and the main ridge runs left_to_right. Determine upper_level separately: none, dormer (small purely raised roof detail), or half_story (substantial raised habitable wall volume beneath the dormer gable, with upper windows). A steep-roof cottage with two real upper-story windows inside a broad raised central facade is typically half_story, even when stories=1 on the ground-floor count. Return upper_level.width as fraction of total facade, height as upper-wall height divided by main floor wall height, inset as fraction of house depth, windows as upper window count. No full-height rectangular second floor unless clearly photographed. Do NOT turn the whole house facade into one huge dark triangular gable. dormer describes center_x,width,rise,window_count (use window_count=0 if none). porch gives the x of its left edge, width as fraction of facade, depth as fraction of house width, and railing=true only if observed. If dormer or porch is absent, provide zero widths and counts / false for schema. Put doors on the ground floor and dormer windows above the eaves; do not conflate them. REQUIRED: door must describe the ACTUAL primary entrance with normalized front elevation x,y,width,height (use zeros only if not visible); do not mistake an upper window for a front door. entry_steps must detect front steps, count visible risers (0 when none), horizontal center_x, width normalized 0..1, present boolean. foundation must report whether the FLOOR/FRONT PORCH is elevated above the surrounding lawn/sidewalk, not merely whether the property sits on a hill. For a visible staircase rising to a raised front porch, use raised=true and approximate vertical difference in meters (e.g. 0.45–0.9 m for 3–5 risers). For a flush slab-on-grade entrance, raised=false and height=0. Do not confuse the tall foundation with a full additional residential story. dormer_windows must give normalized bounding boxes for windows inside the raised dormer ONLY (empty if no dormer). Identify front porch pillar count and positions; preserve visibility of front steps and railings even if partially obscured by landscaping. For one-story cottages with a roof dormer, stories is 1 (the raised dormer is not a complete second floor). Distinguish WINDOW GROUPS from individual windows: a pair of adjacent upper panes with their own full-height sashes means dormer.window_count=2, even if they share trim or one bounding region. Do not classify a side porch as only the railed section: porch width should include the ENTIRE roofed front veranda/overhang, with posts along its frontage. Do not invent a garage, avoid counting lower decorative windows as doors, and position the entrance steps directly below the real ground-floor door. If only one photo is supplied, describe ONLY the visible facade accurately: garage position, entrance, window count and bounding boxes, individual front gables, roof pitch, story count, color and siding type. Do NOT add invented front windows or replace arches with other styles. For each front opening identify shape as arched or rectangular, and whether shutters are clearly visible. These fields control the actual mesh geometry. Use normalized facade coordinates: x=left edge, y=bottom edge (ground=0), width and height fractions 0..1. For additional LEFT/RIGHT/REAR photos, extract openings on those elevations into side_openings with corresponding view label. Each opening coordinate is relative to its OWN photographed elevation (x left-to-right from that viewpoint). Never place features on views that were not provided; use an empty list for unseen elevations. The FRONT photo's features must take priority and should never be averaged with side facades. Include separate front_gables (center_x,width,height_ratio); keep the larger main gable and smaller garage gable distinct. Determine realistic architectural material colors DIRECTLY FROM PIXELS in the photo, not from names or common defaults. Give six-digit HEX values for siding_color (actual main wall cladding, not sky or sunlit trim), roof_color (shingle surface), trim_color (fascia, window surrounds, and porch), garage_color, front_door_color, shutter_color, window_frame_color, and window_glass_color (use black/dark reflective blue unless a visible recolored pane is unmistakable). Account for shadows and exposure; estimate the base material color. Do not use generic beige walls when the image is blue-gray, charcoal, green or another distinctive finish. Report roof orientation, siding_style, garage_side, porch_posts based on visual evidence only. If FRONT image absent, openings should be [] unless you can confidently establish the front. No dimension is measured; depths and hidden walls must be treated as estimates. Maximum 18 front openings, 20 additional openings, 8 posts and 4 gables. Return JSON conforming to schema."},
       ...photoParts(photos)
      ]}],
      generationConfig:{responseMimeType:"application/json",responseSchema:schema,temperature:0.1,maxOutputTokens:2400}
    })
  });
  const payload=await response.json();
  if(!response.ok){
    if(response.status===503||response.status===502||response.status===504)return NextResponse.json({error:"Gemini is temporarily overloaded. The request was retried twice. Please try again later."},{status:503});
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
    roof_feature:plan.roof_feature,
    upper_level:{type:plan.upper_level.type,width:clamp(plan.upper_level.width,0,.8),height:clamp(plan.upper_level.height,0,1),inset:clamp(plan.upper_level.inset,0,.6),windows:clamp(Math.round(plan.upper_level.windows),0,4)},
    // Normalized y refers to the entire uploaded image, including sky/trees.
    // A ground-floor entrance cannot sit in the central upper roof dormer.
    // Keep a deliberately conservative gate for detected central-dormer cottages;
    // manual review still controls the final door position.
    door:{x:clamp(plan.door.x,0,1),
      y:plan.roof_feature==="central_dormer"&&plan.door.y>.38?.20:clamp(plan.door.y,0,1),
      width:clamp(plan.door.width,0,.8),height:clamp(plan.door.height,0,.9)},
    entry_steps:{present:plan.entry_steps.present,count:clamp(Math.round(plan.entry_steps.count),0,10),center_x:clamp(plan.entry_steps.center_x,0,1),width:clamp(plan.entry_steps.width,0,.9)},
    foundation:{raised:plan.foundation.raised,height:plan.foundation.raised?clamp(plan.foundation.height,.12,1.7):0},
    dormer_windows:(plan.dormer_windows||[]).slice(0,4).map(o=>({x:clamp(o.x,0,1),y:clamp(o.y,0,1),width:clamp(o.width,.02,.5),height:clamp(o.height,.03,.5)})),
    roof_ridge_direction:plan.roof_feature==="central_dormer"?"left_to_right":plan.roof_ridge_direction,
    dormer:{center_x:clamp(plan.dormer.center_x,0,1),width:clamp(plan.dormer.width,0,.75),rise:clamp(plan.dormer.rise,0,.9),window_count:clamp(plan.dormer.window_count,0,4)},
    porch:{x:clamp(plan.porch.x,0,1),width:clamp(plan.porch.width,0,Math.max(0,1-plan.porch.x)),depth:clamp(plan.porch.depth,0,.4),railing:plan.porch.railing},
    observed_views:photos.map(p=>p.view),
    side_openings:(plan.side_openings||[]).filter(o=>photos.some(p=>p.view===o.view)).slice(0,20).map(o=>{
      const x=clamp(o.x,0,.95),y=clamp(o.y,0,.95);
      return {...o,x,y,width:clamp(o.width,.035,Math.max(.035,1-x)),height:clamp(o.height,.04,Math.max(.04,1-y))};
    }),
    front_gables:(plan.front_gables||[]).slice(0,4).map(g=>({center_x:clamp(g.center_x,.05,.95),width:clamp(g.width,.12,.95),height_ratio:clamp(g.height_ratio,.12,.8)})),
    siding_color:/^#[0-9a-fA-F]{6}$/.test(plan.siding_color)?plan.siding_color:"#e2ddd2",
    roof_color:/^#[0-9a-fA-F]{6}$/.test(plan.roof_color)?plan.roof_color:"#414850",
    trim_color:/^#[0-9a-fA-F]{6}$/.test(plan.trim_color||"")?plan.trim_color:"#f0eee5",
    garage_color:/^#[0-9a-fA-F]{6}$/.test(plan.garage_color||"")?plan.garage_color:"#ebe9e3",
    front_door_color:/^#[0-9a-fA-F]{6}$/.test(plan.front_door_color||"")?plan.front_door_color:"#64574a",
    shutter_color:/^#[0-9a-fA-F]{6}$/.test(plan.shutter_color||"")?plan.shutter_color:"#32383b",
    window_frame_color:/^#[0-9a-fA-F]{6}$/.test(plan.window_frame_color||"")?plan.window_frame_color:"#eee9df",
    window_glass_color:/^#[0-9a-fA-F]{6}$/.test(plan.window_glass_color||"")?plan.window_glass_color:"#354c58",
    architectural_notes:plan.architectural_notes.slice(0,500)
  },model});
 }catch(e){
   console.error("Gemini planning failure:",e instanceof Error?e.message:"Unknown error");
   return NextResponse.json({error:e instanceof Error&&e.name==="AbortError"?"Gemini scene planning timed out after retries. Please try again.":"Gemini planning connection failed after retries; check the terminal and try again."},{status:502});
 }
}
