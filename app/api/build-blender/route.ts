import {NextRequest, NextResponse} from "next/server";
import {isHousePlan} from "../../../lib/house-plan";
import {mkdtemp,writeFile,readFile,rm,stat} from "node:fs/promises";
import {existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawn} from "node:child_process";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// This is a LOCAL DEVELOPMENT Blender worker. A deployed Vercel/Edge function
// cannot run a local Mac Blender installation. For production, move this to
// a dedicated queue + container worker with Blender installed.
const DEFAULT_MAC_BLENDER="/Applications/Blender.app/Contents/MacOS/Blender";
const MAX_OUTPUT_BYTES=32*1024*1024;

function runBlender(exe:string,script:string,input:string,output:string){
 return new Promise<void>((accept,reject)=>{
   const child=spawn(exe,["--background","--factory-startup","--python",script,"--","--plan",input,"--out",output],{
     stdio:["ignore","pipe","pipe"],env:{...process.env,BLENDER_USER_SCRIPTS:""}
   });
   let logs="";
   const accumulate=(chunk:Buffer)=>{logs=(logs+chunk.toString("utf8")).slice(-3500)};
   child.stdout.on("data",accumulate);
   child.stderr.on("data",accumulate);
   const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("Blender timed out after 120 seconds."))},120000);
   child.on("error",error=>{clearTimeout(timer);reject(error)});
   child.on("close",code=>{
     clearTimeout(timer);
     if(code===0 && logs.includes("EXTERIOR_STUDIO_GLTF_OK"))accept();
     else reject(new Error("Blender export failed (exit "+String(code)+"). "+logs.slice(-900)));
   });
 });
}
export async function POST(req:NextRequest){
  // Restrict to development. Production must use an authenticated worker queue.
  if(process.env.NODE_ENV!=="development")return NextResponse.json({error:"Blender generation is currently supported only in local development. Use a dedicated authenticated worker for deployment."},{status:501});
  let plan:unknown;
  try{plan=await req.json()}catch{return NextResponse.json({error:"Expected Gemini architectural plan JSON."},{status:400})}
  if(!isHousePlan(plan))return NextResponse.json({error:"Invalid house plan. Run Gemini scene analysis first."},{status:400});
  const mac=process.env.BLENDER_EXECUTABLE||DEFAULT_MAC_BLENDER;
  const executable=existsSync(mac)?mac:"blender";
  const script=resolve(process.cwd(),"scripts/blender/generate_house_from_plan.py");
  if(!existsSync(script))return NextResponse.json({error:"Blender generator script is missing. Pull the latest GitHub changes."},{status:500});
  const work=await mkdtemp(join(tmpdir(),"exterior-studio-"));
  const input=join(work,"plan.json"),output=join(work,"house.glb");
  try{
    await writeFile(input,JSON.stringify(plan),"utf8");
    await runBlender(executable,script,input,output);
    const file=await stat(output);
    if(file.size<20||file.size>MAX_OUTPUT_BYTES)throw new Error("Blender produced an invalid or oversized GLB.");
    const data=await readFile(output);
    if(data.toString("utf8",0,4)!=="glTF")throw new Error("Blender output was not a valid GLB header.");
    return new NextResponse(new Uint8Array(data),{
      status:200,headers:{
        "Content-Type":"model/gltf-binary",
        "Content-Disposition":'attachment; filename="exterior-studio-house.glb"',
        "Cache-Control":"no-store"
      }
    });
  }catch(error){
    const message=error instanceof Error?error.message:"Blender export failed.";
    console.error("Blender worker error:",message);
    const unavailable=message.includes("ENOENT")||message.includes("spawn blender");
    return NextResponse.json({error:unavailable?"Blender executable not found. Install Blender or set BLENDER_EXECUTABLE in .env.local.":"Blender generation failed. "+message.slice(0,350)},{status:503});
  }finally{await rm(work,{recursive:true,force:true})}
}
