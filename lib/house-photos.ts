/**
 * Image intake shared by Gemini analysis and 3D-planning routes.
 * Each image is a real, labeled photo of the SAME property.
 */
export type HouseView = "front" | "left" | "right" | "rear";
export type HousePhoto = {file:File;view:HouseView;content:{inlineData:{mimeType:string;data:string}}};
export const VIEWS:HouseView[]=["front","left","right","rear"];
const TYPES=new Set(["image/jpeg","image/png","image/webp"]);
const MAX_PER_FILE=8*1024*1024;
const MAX_TOTAL=24*1024*1024;
export async function readHousePhotos(form:FormData):Promise<HousePhoto[]> {
  const files=form.getAll("photos").filter((x):x is File=>x instanceof File);
  // Backward compatibility with older single-file uploads.
  if(!files.length){const old=form.get("photo");if(old instanceof File)files.push(old)}
  if(files.length<1 || files.length>4)throw new Error("Upload between 1 and 4 house photos.");
  let total=0;
  const views:HouseView[]=[];
  for(let i=0;i<files.length;i++){
    const v=form.getAll("views")[i];
    const view=typeof v==="string"?v:"front";
    if(!VIEWS.includes(view as HouseView))throw new Error("Photo viewpoint must be front, left, right or rear.");
    // One photo per elevation. This avoids accidental double-counted openings.
    if(views.includes(view as HouseView))throw new Error("Choose a different viewpoint for each photo.");
    views.push(view as HouseView);
    const f=files[i];
    if(!TYPES.has(f.type)||f.size===0||f.size>MAX_PER_FILE)
       throw new Error("Each photo must be JPEG, PNG or WebP and under 8 MB.");
    total+=f.size;
  }
  if(total>MAX_TOTAL)throw new Error("Combined photo size must be under 24 MB.");
  return Promise.all(files.map(async (file,i)=>({
    file,view:views[i],
    content:{inlineData:{mimeType:file.type,data:Buffer.from(await file.arrayBuffer()).toString("base64")}}
  })));
}
export function photoParts(photos:HousePhoto[]){
 return photos.flatMap(p=>[
  {text:`PHOTO VIEW: ${p.view.toUpperCase()}. This photograph shows the ${p.view} elevation of the SAME physical house. Match only features visible from this angle.`},
  p.content
 ]);
}
