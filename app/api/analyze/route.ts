import {NextRequest,NextResponse} from "next/server";

export const runtime="nodejs";
const allowed=new Set(["image/png","image/jpeg","image/webp"]);
const MAX_BYTES=8*1024*1024;

type Observation={component:string;count:number;notes:string;confidence:"high"|"medium"|"low"};
type Analysis={building_summary:string;photo_view:string;visible_components:Observation[];missing_views:string[];reconstruction_notes:string[]};

export async function POST(request:NextRequest){
  const key=process.env.OPENAI_API_KEY;
  if(!key)return NextResponse.json({error:"OPENAI_API_KEY is missing. Add it to .env.local and restart npm run dev."},{status:503});
  let form:FormData;
  try{form=await request.formData()}catch{return NextResponse.json({error:"Expected multipart/form-data upload."},{status:400})}
  const uploaded=form.get("photo");
  if(!(uploaded instanceof File))return NextResponse.json({error:"Choose a photo before analyzing."},{status:400});
  if(!allowed.has(uploaded.type))return NextResponse.json({error:"Supported image formats: JPEG, PNG, WebP."},{status:400});
  if(uploaded.size===0||uploaded.size>MAX_BYTES)return NextResponse.json({error:"Photo must be between 1 byte and 8 MB."},{status:413});
  const encoded=Buffer.from(await uploaded.arrayBuffer()).toString("base64");
  const schema={
    type:"object",additionalProperties:false,
    properties:{
      building_summary:{type:"string"},
      photo_view:{type:"string"},
      visible_components:{type:"array",items:{type:"object",additionalProperties:false,properties:{
        component:{type:"string"},count:{type:"integer"},notes:{type:"string"},confidence:{type:"string",enum:["high","medium","low"]}
      },required:["component","count","notes","confidence"]}},
      missing_views:{type:"array",items:{type:"string"}},
      reconstruction_notes:{type:"array",items:{type:"string"}}
    },
    required:["building_summary","photo_view","visible_components","missing_views","reconstruction_notes"]
  };
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),60000);
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:process.env.OPENAI_VISION_MODEL||"gpt-4.1-mini",
        store:false,
        instructions:"You are an architectural image analyst. Analyze ONLY visually observable properties of the provided REAL house photo. Do not infer exact dimensions, hidden structure, manufacturer, or product. Identify visible siding/wall areas, roof, doors, garage, windows, trim, and major occlusions. Return concise observations. Do not claim to have produced segmentation masks, geometry, or 3D models. If the image is not of a house, state that in building_summary and return an empty visible_components list.",
        input:[{role:"user",content:[{type:"input_text",text:"Describe the exterior architectural elements visible in this photograph. Explain what additional views would be needed before reconstructing the same house in 3D."},{type:"input_image",image_url:`data:${uploaded.type};base64,${encoded}`,detail:"high"}]}],
        text:{format:{type:"json_schema",name:"house_observation",schema,strict:true}},
        max_output_tokens:1100
      }),
      signal:controller.signal
    });
    const payload=await response.json();
    if(!response.ok)return NextResponse.json({error:payload?.error?.message||"OpenAI API request failed."},{status:502});
    const raw=payload.output?.flatMap((item:{content?:Array<{type?:string;text?:string}>})=>item.content||[]).filter((part:{type?:string})=>part.type==="output_text").map((part:{text?:string})=>part.text||"").join("");
    if(!raw)return NextResponse.json({error:"The model did not return usable architectural observations."},{status:502});
    const analysis=JSON.parse(raw) as Analysis;
    return NextResponse.json({analysis,model:payload.model||process.env.OPENAI_VISION_MODEL||"gpt-4.1-mini"});
  }catch(error){const message=error instanceof Error&&error.name==="AbortError"?"Analysis timed out. Try a smaller image.":"Unable to analyze image. Check server logs and API access.";return NextResponse.json({error:message},{status:502})}
  finally{clearTimeout(timeout)}
}
