"use client";
import {useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {buildPhotoHouse} from "../lib/build-house";
import type {HousePlan} from "../lib/house-plan";

type Part="siding"|"roof"|"trim"|"garage"|"shutter"|"gutter";
type HouseView="front"|"left"|"right"|"rear";
type PhotoSlot={file:File;view:HouseView};
const viewNames:Record<HouseView,string>={front:"Front",left:"Left side",right:"Right side",rear:"Rear"};
const viewOrder:HouseView[]=["front","left","right","rear"];
type Observation={component:string;count:number;notes:string;confidence:"high"|"medium"|"low"};
type Analysis={building_summary:string;photo_view:string;visible_components:Observation[];missing_views:string[];reconstruction_notes:string[]};
const palette:Record<Part,string[]>={siding:["#d9d3c4","#a4b1a6","#5c7381","#b58f77"],roof:["#383d43","#6a6461","#87715b"],trim:["#f3efe4","#ced1c9","#373e43"],garage:["#4c5256","#f2ece0","#9c9588"],shutter:["#262d32","#555a5a","#f2efe5"],gutter:["#786550","#414444","#c4b9a8"]};
const labels:Record<Part,string>={siding:"Main siding",roof:"Roof",trim:"Exterior trim",garage:"Garage door",shutter:"Window shutters",gutter:"Gutters"};
const defaults:Record<Part,string>={siding:"#d9d3c4",roof:"#383d43",trim:"#f3efe4",garage:"#4c5256",shutter:"#262d32",gutter:"#786550"};
const views=[["front",[11,-15,9]],["back",[-11,15,9]],["left",[-15,-10,8]],["right",[15,10,8]]] as const;
function cube(name:string,cat:Part,w:number,h:number,d:number,x:number,y:number,z:number,color:string,group:THREE.Group){
 const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.82}));
 m.name=name;m.userData.category=cat;m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;
}
function makeHouse(group:THREE.Group){
 cube("Front exterior wall","siding",10,5.5,.3,0,2.75,-3.5,defaults.siding,group);
 cube("Back exterior wall","siding",10,5.5,.3,0,2.75,3.5,defaults.siding,group);
 cube("Left wall","siding",.3,5.5,7,-5,2.75,0,defaults.siding,group);
 cube("Right wall","siding",.3,5.5,7,5,2.75,0,defaults.siding,group);
 cube("Garage door","garage",3.4,2.8,.12,-2.45,1.4,-3.74,defaults.garage,group);
 cube("Front entry door","trim",1.2,2.5,.13,2.2,1.25,-3.77,"#41464b",group);
 for(const x of [-3.5,0,3.5]){cube("Front window "+x,"trim",1.35,1.38,.10,x,3.9,-3.78,"#f3efe4",group);cube("Window glazing "+x,"trim",1.06,1.07,.15,x,3.9,-3.85,"#455966",group);}
 for(const x of [-3.2,0,3.2]){cube("Back window "+x,"trim",1.4,1.5,.1,x,3.8,3.76,"#f3efe4",group);cube("Back glazing "+x,"trim",1.1,1.2,.11,x,3.8,3.84,"#455966",group);}
 for(const z of [-1.5,1.5]) for(const side of [-1,1]){cube("Side window trim","trim",.13,1.3,1.4,side*5.19,3.75,z,defaults.trim,group);}
 // Two sloped rectangular roof planes, each independently selectable
 const roofMaterial=new THREE.MeshStandardMaterial({color:defaults.roof,side:THREE.DoubleSide,roughness:.9});
 const verts=new Float32Array([-5.7,5.5,-4.2,0,8.05,-4.2,0,8.05,4.2,-5.7,5.5,4.2,0,8.05,-4.2,5.7,5.5,-4.2,5.7,5.5,4.2,0,8.05,4.2]);
 for(let k=0;k<2;k++){const geometry=new THREE.BufferGeometry();const o=k*12;geometry.setAttribute("position",new THREE.BufferAttribute(verts.slice(o,o+12),3));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();const m=new THREE.Mesh(geometry,roofMaterial.clone());m.name=k?"Right roof":"Left roof";m.userData.category="roof";m.castShadow=true;group.add(m);}
}
export default function Home(){
 const host=useRef<HTMLDivElement>(null);const sceneRef=useRef<{scene:THREE.Scene;camera:THREE.PerspectiveCamera;renderer:THREE.WebGLRenderer;group:THREE.Group;controls:{az:number,el:number,dist:number};target:THREE.Vector3;} |null>(null);
 const [selected,setSelected]=useState<Part>("siding");const [pending,setPending]=useState<Record<Part,string>>(defaults);
 const [applied,setApplied]=useState<Record<Part,string>>(defaults);const [busy,setBusy]=useState(false);
 const [photoName,setPhotoName]=useState("");const [hover,setHover]=useState("");
 const [photoFile,setPhotoFile]=useState<File|null>(null);
 const [photoSlots,setPhotoSlots]=useState<PhotoSlot[]>([]);
 const [photoPreviews,setPhotoPreviews]=useState<string[]>([]);
 const [photoInputError,setPhotoInputError]=useState("");
 const [autoBuilding,setAutoBuilding]=useState(false);
 const [reviewReady,setReviewReady]=useState(false);
 useEffect(()=>{
   const urls=photoSlots.map(p=>URL.createObjectURL(p.file));
   setPhotoPreviews(urls);
   return()=>urls.forEach(url=>URL.revokeObjectURL(url));
 },[photoSlots]);
 function resetGenerated(){
   setManualModel(false);setAnalysis(null);setAnalysisError("");
   setHousePlan(null);setMirrorFacade(false);setRoofCorrection("auto");
   setBlenderUrl(null);blenderBlob.current=null;setGenerationError("");setReviewReady(false);
 }
 function choosePhotos(incoming:FileList|null){
   if(!incoming)return;
   const added=Array.from(incoming);
   const used=new Set(photoSlots.map(p=>p.view));
   const available=viewOrder.filter(v=>!used.has(v));
   if(added.length>available.length){setPhotoInputError("You can use up to four photos, one per viewpoint.");return;}
   if(added.some(file=>!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>8*1024*1024)){
     setPhotoInputError("Photos must be JPEG, PNG or WebP, each under 8 MB.");return;
   }
   const merged=[...photoSlots,...added.map((file,i)=>({file,view:available[i]}))];
   if(merged.reduce((sum,p)=>sum+p.file.size,0)>24*1024*1024){setPhotoInputError("Combined photos must be under 24 MB.");return;}
   setPhotoSlots(merged);
   setPhotoFile(merged[0]?.file||null);setPhotoName(merged.map(p=>p.file.name).join(", "));
   setPhotoInputError("");resetGenerated();
 }
 function changeView(index:number,view:HouseView){
   if(photoSlots.some((p,i)=>i!==index&&p.view===view)){setPhotoInputError("That viewpoint is already assigned to another photo.");return;}
   setPhotoSlots(prev=>prev.map((p,i)=>i===index?{...p,view}:p));
   setPhotoInputError("");resetGenerated();
 }
 function removePhoto(index:number){
   const remaining=photoSlots.filter((_,i)=>i!==index);
   setPhotoSlots(remaining);setPhotoFile(remaining[0]?.file||null);
   setPhotoName(remaining.map(p=>p.file.name).join(", "));setPhotoInputError("");resetGenerated();
 }
 async function prepareForGemini(file:File):Promise<Blob>{
   // Preserve the original photo for preview; transmit a smaller copy to save
   // Gemini processing time and upload bandwidth. Never upscale small images.
   if(file.size<450000)return file;
   try{
     const image=await createImageBitmap(file);
     const limit=1600;
     const scale=Math.min(1,limit/Math.max(image.width,image.height));
     const width=Math.max(1,Math.round(image.width*scale));
     const height=Math.max(1,Math.round(image.height*scale));
     const canvas=document.createElement("canvas");
     canvas.width=width;canvas.height=height;
     const context=canvas.getContext("2d");
     if(!context){image.close();return file;}
     context.drawImage(image,0,0,width,height);
     image.close();
     const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.84));
     return blob && blob.size<file.size?blob:file;
   }catch{return file;}
 }
 async function attachPhotos(form:FormData){
   for(const slot of photoSlots){
     const optimized=await prepareForGemini(slot.file);
     const filename=optimized===slot.file?slot.file.name:slot.file.name.replace(/\.[^/.]+$/,"")+".jpg";
     form.append("photos",optimized,filename);
     form.append("views",slot.view);
   }
 }
 const [analysis,setAnalysis]=useState<Analysis|null>(null);
 const [analyzing,setAnalyzing]=useState(false);
 const [analysisError,setAnalysisError]=useState("");
 const [housePlan,setHousePlan]=useState<HousePlan|null>(null);
 const [mirrorFacade,setMirrorFacade]=useState(false);
 const [roofCorrection,setRoofCorrection]=useState<"auto"|"front_to_back"|"left_to_right">("auto");
 const [generating,setGenerating]=useState(false);
 const [generationError,setGenerationError]=useState("");
 const [blenderUrl,setBlenderUrl]=useState<string|null>(null);
 const [manualModel,setManualModel]=useState(false);
 const [blenderBusy,setBlenderBusy]=useState(false);
 const [blenderError,setBlenderError]=useState("");
 const blenderBlob=useRef<Blob|null>(null);
 const lastBlenderUrl=useRef<string|null>(null);
 useEffect(()=>()=>{if(lastBlenderUrl.current)URL.revokeObjectURL(lastBlenderUrl.current)},[]);
 const [referenceUrl,setReferenceUrl]=useState<string|null>(null);
 useEffect(()=>{if(!photoFile){setReferenceUrl(null);return;}const src=URL.createObjectURL(photoFile);setReferenceUrl(src);return()=>URL.revokeObjectURL(src)},[photoFile]);
 useEffect(()=>{const hostEl=host.current;if(!hostEl)return;
 const scene=new THREE.Scene();scene.background=new THREE.Color("#dfe8eb");
 const camera=new THREE.PerspectiveCamera(45,1,.1,150);
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;hostEl.appendChild(renderer.domElement);
 // Studio daylight: broad ambient fill with a softer, higher sun.
 // Keep shadow detail on the house, not a huge hard-edged shadow on the lawn.
 scene.add(new THREE.HemisphereLight(0xffffff,0xc5c8bd,2.15));
 const light=new THREE.DirectionalLight(0xfff7ea,1.35);light.position.set(-5,24,-7);light.target.position.set(0,2.4,0);scene.add(light.target);
 light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.radius=5;light.shadow.bias=-0.00008;light.shadow.normalBias=0.025;
 light.shadow.camera.left=-13;light.shadow.camera.right=13;light.shadow.camera.top=13;light.shadow.camera.bottom=-13;light.shadow.camera.near=1;light.shadow.camera.far=58;scene.add(light);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:"#d3d7c9",roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=false;scene.add(ground);
 const group=new THREE.Group();scene.add(group);makeHouse(group);
 const controls={az:-.68,el:.30,dist:21};const target=new THREE.Vector3(0,3,0);sceneRef.current={scene,camera,renderer,group,controls,target};const redraw=()=>{camera.position.set(target.x+Math.sin(controls.az)*Math.cos(controls.el)*controls.dist,target.y+Math.sin(controls.el)*controls.dist,target.z-Math.cos(controls.az)*Math.cos(controls.el)*controls.dist);camera.lookAt(target);renderer.render(scene,camera);};
 const resize=()=>{const w=hostEl.clientWidth,h=hostEl.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();redraw();};new ResizeObserver(resize).observe(hostEl);resize();
 let down=false,lx=0,ly=0;
 const onDown=(e:PointerEvent)=>{down=true;lx=e.clientX;ly=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)};
 const onMove=(e:PointerEvent)=>{if(down){controls.az+=(e.clientX-lx)*.008;controls.el=Math.max(-.1,Math.min(1.2,controls.el+(e.clientY-ly)*.005));lx=e.clientX;ly=e.clientY;redraw()}else{const rect=renderer.domElement.getBoundingClientRect();const mouse=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(group.children,true)[0];setHover(hit?.object?.name||"");}};
 const onUp=()=>{down=false};const onClick=(e:MouseEvent)=>{const rect=renderer.domElement.getBoundingClientRect();const mouse=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(group.children,true)[0];if(hit&&["siding","roof","trim","garage","shutter","gutter"].includes(hit.object.userData.category)){setSelected(hit.object.userData.category as Part)}};
 renderer.domElement.addEventListener("pointerdown",onDown);renderer.domElement.addEventListener("pointermove",onMove);renderer.domElement.addEventListener("pointerup",onUp);renderer.domElement.addEventListener("click",onClick);
 const wheel=(e:WheelEvent)=>{e.preventDefault();controls.dist=Math.min(45,Math.max(10,controls.dist+e.deltaY*.013));redraw()};renderer.domElement.addEventListener("wheel",wheel,{passive:false});
 return()=>{renderer.domElement.removeEventListener("pointerdown",onDown);renderer.domElement.removeEventListener("pointermove",onMove);renderer.domElement.removeEventListener("pointerup",onUp);renderer.domElement.removeEventListener("click",onClick);renderer.domElement.removeEventListener("wheel",wheel);renderer.dispose();hostEl.removeChild(renderer.domElement);sceneRef.current=null};
 },[]);
 useEffect(()=>{
  const x=sceneRef.current;if(!x)return;
  for(const object of [...x.group.children]){
   x.group.remove(object);
   if(object instanceof THREE.Mesh){
    object.geometry.dispose();
    const mat=object.material;
    (Array.isArray(mat)?mat:[mat]).forEach(m=>m.dispose());
   }
  }
  if(housePlan||blenderUrl){
   const effectivePlan:HousePlan={...(housePlan||{stories:1,roof_type:"gable",roof_color:"#464646",siding_color:"#ebe8e3",roof_ridge_direction:"front_to_back",roof_pitch:"medium",openings:[],porch_posts:[],architectural_notes:"Imported reference model"} as HousePlan),
     roof_ridge_direction:roofCorrection==="auto"?(housePlan?.roof_ridge_direction||"front_to_back"):roofCorrection,
     openings:mirrorFacade?housePlan?.openings.map(o=>({...o,x:1-o.x-o.width}))||[]:housePlan?.openings||[],
     porch_posts:mirrorFacade?housePlan?.porch_posts.map(x=>1-x)||[]:housePlan?.porch_posts||[]};
   if(!blenderUrl){buildPhotoHouse(x.group,effectivePlan,applied);}
   else {
    const loader=new GLTFLoader();
    loader.load(blenderUrl,gltf=>{
      if(sceneRef.current!==x)return;
      for(const obj of [...x.group.children])x.group.remove(obj);
      gltf.scene.traverse(obj=>{
        if(obj instanceof THREE.Mesh){
          const semantic=String(obj.userData.semantic_class || obj.parent?.userData.semantic_class || obj.name.split("__")[0] || obj.parent?.name.split("__")[0] || "").toLowerCase();
          const category=semantic==="door"||semantic==="window"?"trim":semantic;
          obj.userData.category=["siding","roof","trim","garage","shutter","gutter"].includes(category)?category:undefined;
          if(Array.isArray(obj.material))obj.material=obj.material.map(m=>m.clone());else obj.material=obj.material.clone();
          obj.userData.lockedMaterial=semantic==="window"||semantic==="door"||Boolean(obj.userData.locked_material||obj.parent?.userData.locked_material);
          const semanticType=semantic.toLowerCase();
          const sitePart=["landscape","ground","driveway"].includes(semanticType);
          // No oversized cast shadows from lawn/driveway slabs.
          obj.castShadow=!sitePart;obj.receiveShadow=!sitePart;
        }
      });
      // Some older procedural GLBs are authored in Z-up coordinates even
      // though glTF viewers, including Three.js, use Y-up. Detect the floor
      // plane in the imported geometry, then rotate the whole model once.
      // Native Blender glTF exports already have Y-up and stay unchanged.
      const floor = {mesh: null as THREE.Mesh|null};
      gltf.scene.traverse(obj=>{
        if(obj instanceof THREE.Mesh && /(?:GROUND|LAWN|SITE__lawn)/i.test(obj.name) && !floor.mesh)floor.mesh=obj;
      });
      let convertedLegacyZUp=false;
      if(floor.mesh){
        const planeBox=new THREE.Box3().setFromObject(floor.mesh);
        const size=planeBox.getSize(new THREE.Vector3());
        if(size.z < Math.min(size.x,size.y)*.12 && size.x>5 && size.y>5){
          gltf.scene.rotation.x=-Math.PI/2;
          convertedLegacyZUp=true;
        }
      }
      gltf.scene.updateMatrixWorld(true);
      // Place the imported site's surface on the viewer's world ground (Y=0).
      // Without this, a raised foundation pushes the stairs below the
      // preview's own ground plane, hiding the elevation difference.
      if(floor.mesh){
        const lawnBounds=new THREE.Box3().setFromObject(floor.mesh);
        const lawnSurface=lawnBounds.max.y;
        gltf.scene.position.y-=lawnSurface;
        gltf.scene.updateMatrixWorld(true);
      }
      x.group.add(gltf.scene);
      // Frame architectural meshes, not the 43 m lawn / driveway footprint.
      const houseBounds=new THREE.Box3();
      let count=0;
      gltf.scene.traverse(obj=>{
        if(!(obj instanceof THREE.Mesh))return;
        const semantic=String(obj.userData.semantic_class||obj.name.split("__")[0]).toUpperCase();
        if(["GROUND","LANDSCAPE","DRIVEWAY"].includes(semantic))return;
        houseBounds.expandByObject(obj);count++;
      });
      if(!count)houseBounds.setFromObject(gltf.scene);
      const center=houseBounds.getCenter(new THREE.Vector3());
      const extent=houseBounds.getSize(new THREE.Vector3());
      x.target.copy(center);
      x.controls.dist=Math.max(16,Math.min(70,Math.max(extent.x,extent.y,extent.z)*1.9));
      // The legacy house front is at original negative Y; after converting
      // Z-up -> Y-up it faces positive world Z. Start facing that facade.
      x.controls.az=convertedLegacyZUp?Math.PI-.36:-.32;
      x.controls.el=.19;
      x.camera.position.set(
        center.x+Math.sin(x.controls.az)*Math.cos(x.controls.el)*x.controls.dist,
        center.y+Math.sin(x.controls.el)*x.controls.dist,
        center.z-Math.cos(x.controls.az)*Math.cos(x.controls.el)*x.controls.dist
      );
      x.camera.lookAt(center);
      x.camera.updateProjectionMatrix();
      x.renderer.render(x.scene,x.camera);
    },undefined,e=>setBlenderError("The GLB was exported but could not load in Three.js. "+String(e)));
   }
   x.controls.az=-.14;x.controls.el=.14;x.controls.dist=24;
  }else{
   makeHouse(x.group);
   x.controls.az=-.68;x.controls.el=.30;x.controls.dist=21;
  }
  x.target.set(0,3,0);
  x.camera.position.set(Math.sin(x.controls.az)*Math.cos(x.controls.el)*x.controls.dist,3+Math.sin(x.controls.el)*x.controls.dist,-Math.cos(x.controls.az)*Math.cos(x.controls.el)*x.controls.dist);
  x.camera.lookAt(x.target);x.renderer.render(x.scene,x.camera);
 // Rebuild only when a different photo plan is created or reset.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[housePlan,mirrorFacade,roofCorrection,blenderUrl]);
 function editPlan(next:HousePlan){
   setHousePlan(next);setBlenderUrl(null);blenderBlob.current=null;setReviewReady(true);
 }
 function updateDoor(field:"x"|"y"|"width"|"height",value:number){
   if(!housePlan)return;editPlan({...housePlan,door:{x:0,y:0,width:0,height:0,...housePlan.door,[field]:value}});
 }
 function updateSteps(field:"present"|"count"|"center_x"|"width",value:number|boolean){
   if(!housePlan)return;
   const base={present:false,count:0,center_x:.5,width:.15,...housePlan.entry_steps};
   editPlan({...housePlan,entry_steps:{...base,[field]:value}});
 }
 function updateUpperLevel(field:"type"|"width"|"height"|"inset"|"windows",value:string|number){
   if(!housePlan)return;
   const current=housePlan.upper_level||{
     type:housePlan.roof_feature==="central_dormer"?"dormer":"none",
     width:housePlan.dormer?.width||.3,height:.50,inset:.22,
     windows:housePlan.dormer?.window_count||2
   };
   const updated={...current,[field]:value} as NonNullable<HousePlan["upper_level"]>;
   editPlan({...housePlan,upper_level:updated,
     roof_feature:updated.type==="none"?"none":"central_dormer",
     roof_ridge_direction:updated.type!=="none"?"left_to_right":housePlan.roof_ridge_direction,
     dormer:{center_x:housePlan.dormer?.center_x||.5,
       width:updated.width,rise:housePlan.dormer?.rise||.4,
       window_count:updated.windows},
     dormer_windows:field==="windows"?[]:housePlan.dormer_windows});
 }
 function updateFoundation(field:"raised"|"height",value:number|boolean){
   if(!housePlan)return;
   const base={raised:!!housePlan.entry_steps?.present,height:.65,...housePlan.foundation};
   editPlan({...housePlan,foundation:{...base,[field]:value}});
 }
 function updatePorch(field:"x"|"width"|"depth"|"railing",value:number|boolean){
   if(!housePlan)return;
   const base={x:0,width:0,depth:.12,railing:false,...housePlan.porch};
   editPlan({...housePlan,porch:{...base,[field]:value}});
 }
 function importDetailedGlb(file:File|null){
  if(!file)return;
  if(!file.name.toLowerCase().endsWith(".glb")){setBlenderError("Choose an exported .glb model.");return;}
  const url=URL.createObjectURL(file);
  if(lastBlenderUrl.current)URL.revokeObjectURL(lastBlenderUrl.current);
  lastBlenderUrl.current=url;blenderBlob.current=file;
  setBlenderError("");setManualModel(true);setHousePlan(null);setBlenderUrl(url);
 }
 async function generateBlenderModel(){
  if(!housePlan)return;
  setBlenderBusy(true);setBlenderError("");
  try{
   const corrected:HousePlan={...housePlan,
     roof_ridge_direction:roofCorrection==="auto"?housePlan.roof_ridge_direction:roofCorrection,
     openings:mirrorFacade?housePlan.openings.map(o=>({...o,x:1-o.x-o.width})):housePlan.openings,
     porch_posts:mirrorFacade?housePlan.porch_posts.map(v=>1-v):housePlan.porch_posts,
     front_gables:mirrorFacade?housePlan.front_gables?.map(g=>({...g,center_x:1-g.center_x})):housePlan.front_gables,
     garage_side:mirrorFacade?(housePlan.garage_side==="left"?"right":housePlan.garage_side==="right"?"left":housePlan.garage_side):housePlan.garage_side
   };
   const response=await fetch("/api/build-blender",{
     method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(corrected)
   });
   if(!response.ok){const error=await response.json();throw new Error(error.error||"Blender generation failed.");}
   const blob=await response.blob();
   const url=URL.createObjectURL(blob);
   if(lastBlenderUrl.current)URL.revokeObjectURL(lastBlenderUrl.current);
   lastBlenderUrl.current=url;blenderBlob.current=blob;
   setManualModel(false);setBlenderUrl(url);
  }catch(error){setBlenderError(error instanceof Error?error.message:"Could not generate Blender GLB.")}
  finally{setBlenderBusy(false)}
 }
 function downloadBlenderModel(){
  if(!blenderBlob.current||!blenderUrl)return;
  const a=document.createElement("a");a.href=blenderUrl;a.download="exterior-studio-semantic-house.glb";a.click();
 }
 async function buildDirectlyFromPhotos(){
  if(!photoSlots.length)return;
  setAutoBuilding(true);setGenerationError("");setBlenderError("");setAnalysisError("");
  try{
    const form=new FormData();await attachPhotos(form);
    const planned=await fetch("/api/scene-plan",{method:"POST",body:form});
    const layout=await planned.json();
    if(!planned.ok)throw new Error(layout.error||"Gemini could not interpret these photos.");
    const plan=layout.plan as HousePlan;
    const nextColors={...defaults,siding:plan.siding_color,roof:plan.roof_color,trim:plan.trim_color||defaults.trim,garage:plan.garage_color||defaults.garage,shutter:plan.shutter_color||defaults.shutter};
    setPending(nextColors);setApplied(nextColors);setMirrorFacade(false);setRoofCorrection("auto");
    setHousePlan(plan);
    // Geometry must be reviewed against the real photo before export.
    setBlenderUrl(null);blenderBlob.current=null;
    setReviewReady(true);
  }catch(error){
    setGenerationError(error instanceof Error?error.message:"Could not create the house model.");
  }finally{setAutoBuilding(false)}
 }
 async function generatePhotoModel(){
  if(!photoSlots.length)return;
  setGenerating(true);setGenerationError("");
  try{
   const form=new FormData();await attachPhotos(form);
   const response=await fetch("/api/scene-plan",{method:"POST",body:form});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"Couldn't generate schematic layout.");
   const plan=data.plan as HousePlan;
   const nextColors={...defaults,siding:plan.siding_color,roof:plan.roof_color,trim:plan.trim_color||defaults.trim,garage:plan.garage_color||defaults.garage,shutter:plan.shutter_color||defaults.shutter};
   setPending(nextColors);setApplied(nextColors);setMirrorFacade(false);setRoofCorrection("auto");setBlenderUrl(null);blenderBlob.current=null;setHousePlan(plan);setReviewReady(true);
  }catch(err){setGenerationError(err instanceof Error?err.message:"Failed to generate 3D layout.")}
  finally{setGenerating(false)}
 }
 async function analyzePhoto(){
  if(!photoSlots.length)return;
  setAnalyzing(true);setAnalysisError("");setAnalysis(null);
  try{
    const body=new FormData();await attachPhotos(body);
    const result=await fetch("/api/analyze",{method:"POST",body});
    const json=await result.json();
    if(!result.ok)throw new Error(json.error||"Image analysis failed.");
    setAnalysis(json.analysis as Analysis);
  }catch(error){setAnalysisError(error instanceof Error?error.message:"Image analysis failed.")}
  finally{setAnalyzing(false)}
 }
 function apply(){const x=sceneRef.current;if(!x)return;x.group.traverse(obj=>{if(obj instanceof THREE.Mesh&&obj.userData.category){const cat=obj.userData.category as Part; if(!pending[cat])return; if(obj.userData.lockedMaterial||obj.name.includes("glazing")||obj.name.includes("entry door"))return; const m=obj.material as THREE.MeshStandardMaterial;m.color.set(pending[cat]);}});x.renderer.render(x.scene,x.camera);setApplied({...pending})}
 function downloadView(name:string,pose:readonly number[]){const x=sceneRef.current;if(!x)return;const old=x.camera.position.clone(),q=x.camera.quaternion.clone();const w=x.renderer.domElement.width,h=x.renderer.domElement.height;x.camera.position.set(pose[0],pose[2],pose[1]);x.camera.lookAt(0,3,0);x.renderer.render(x.scene,x.camera);const a=document.createElement("a");a.href=x.renderer.domElement.toDataURL("image/png");a.download=`exterior-studio-${name}.png`;a.click();x.camera.position.copy(old);x.camera.quaternion.copy(q);x.renderer.render(x.scene,x.camera)}
 function exportAll(){setBusy(true);views.forEach(([name,pose],i)=>setTimeout(()=>{downloadView(name,pose);if(i===3)setBusy(false)},i*380))}
 return <main className="app"><header><div className="brand"><span className="brandmark">◇</span><div><strong>EXTERIOR STUDIO</strong><small>Your home, remixed</small></div></div><nav aria-label="Design progress"><span className={photoSlots.length===0?"active":""}>01 <b>Upload</b></span><span className={photoSlots.length>0?"active":""}>02 <b>Design</b></span><span className={blenderUrl?"active":""}>03 <b>Export</b></span></nav><span className="pill">DESIGN PLAYGROUND</span></header>
 <div className="heading"><div className="hero-copy"><span className="eyebrow">A FRESH PERSPECTIVE</span><h1>Imagine it.<br/><em>Make it yours.</em></h1><p>Upload a home. Explore a whole new look.</p><label className="upload hero-upload"><span className="upload-symbol">↗</span> {photoSlots.length?"Add more photos":"Start with a photo"}<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={photoSlots.length>=4} onChange={e=>{choosePhotos(e.target.files);e.target.value="";}}/></label></div><div className="hero-art" aria-hidden="true"><div className="art-sun"/><svg viewBox="0 0 380 240" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M58 122 L192 27 L326 122" stroke="#27463D" strokeWidth="13" strokeLinejoin="round"/><path d="M85 112 L85 210 L299 210 L299 112" fill="#DFE7D9" stroke="#27463D" strokeWidth="6"/><path d="M151 210 V139 H220 V210" fill="#F6F3EA" stroke="#27463D" strokeWidth="6"/><path d="M105 135 H135 V166 H105 Z M246 135 H276 V166 H246 Z" fill="#98B6AE" stroke="#27463D" strokeWidth="5"/><path d="M185 152 V193 M113 150 H127 M254 150 H268" stroke="#27463D" strokeWidth="4"/><path d="M40 218 H345" stroke="#27463D" strokeWidth="6" strokeLinecap="round"/><path d="M313 92 L335 74 M320 112 L353 110" stroke="#F2AA73" strokeWidth="5" strokeLinecap="round"/></svg><span className="art-sticker">NEW LOOK ✳</span></div></div>
 <details className="reference-model-row"><summary>Have a 3D model already? <span>Import GLB +</span></summary><div className="import-interior"><p>Bring in an editable Blender model.</p><label className="upload">Choose GLB<input type="file" accept=".glb,model/gltf-binary" onChange={e=>importDetailedGlb(e.target.files?.[0]||null)}/></label></div></details>
 {photoInputError&&<div className="analysis-error photo-upload-error" role="alert">{photoInputError}</div>}
 {photoSlots.length>0&&<section className="photo-selection" aria-label="House photo viewpoints">
 <div className="photo-selection-heading"><div><span className="eyebrow">01 / YOUR SPACE</span><h2>Meet your canvas.</h2><p>{photoSlots.length===1?"One photo is all you need to begin.":"More angles help capture the details."}</p></div><span className="photo-count">{photoSlots.length} of 4</span></div>
 <div className="photo-direct-actions"><button className="dark" onClick={buildDirectlyFromPhotos} disabled={autoBuilding||generating||blenderBusy}>{autoBuilding?"Reading your home…":"Create my 3D home ↗"}</button><span>We’ll map your home before you style it.</span></div>
 <div className="photo-selection-grid">{photoSlots.map((slot,index)=><div className="photo-selection-item" key={index}>
   {photoPreviews[index]&&<img src={photoPreviews[index]} alt={viewNames[slot.view]+" house photograph"}/>}
   <div className="photo-selection-meta"><select aria-label={"Photo "+(index+1)+" viewpoint"} value={slot.view} onChange={e=>changeView(index,e.target.value as HouseView)}>{viewOrder.map(view=><option key={view} value={view} disabled={photoSlots.some((p,i)=>i!==index&&p.view===view)}>{viewNames[view]}</option>)}</select><button onClick={()=>removePhoto(index)} aria-label={"Remove photo "+(index+1)}>Remove</button></div>
   <span title={slot.file.name}>{slot.file.name}</span>
 </div>)}</div>
 <div className="photo-selection-footer"><span>↳ {photoSlots.length===1?"Have another angle? Add it any time.":"Nice — those extra views help."}</span><label className="upload add-view">+ Add view<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={photoSlots.length>=4} onChange={e=>{choosePhotos(e.target.files);e.target.value="";}}/></label></div>
 </section>}
 {photoSlots.length>0&&<section className="analysis-panel">
 <details className="advanced-panel"><summary>More ways to build <span>Photo analysis &amp; quick preview +</span></summary>
 <div className="analysis-intro"><div><h2>Photo analysis</h2><p>See what was detected or try a quick preview.</p></div><button className="dark" disabled={analyzing} onClick={analyzePhoto}>{analyzing?"Reading photo…":"Analyze photo"}</button></div>
 
 {analysisError&&<p className="analysis-error" role="alert">{analysisError}</p>}
 {analysis&&<div className="generate-layout"><div><strong>Generate a first-pass 3D structure</strong><p>Build editable meshes from estimated facade layout. This is a schematic approximation, not a photogrammetric reconstruction.</p></div><button className="dark" disabled={generating} onClick={generatePhotoModel}>{generating?"Building 3D layout…":"Generate schematic 3D →"}</button></div>}
 {generationError&&<p className="analysis-error" role="alert">{generationError}</p>}
 </details>
 {housePlan&&reviewReady&&<section className="facade-review">
  <div className="facade-review-header"><div><span className="eyebrow">02 / MAKE IT FIT</span><h3>A little fine-tuning.</h3><p>Check the highlights. Adjust anything that looks off.</p></div><button className="dark" onClick={generateBlenderModel} disabled={blenderBusy}>{blenderBusy?"Making your model…":"See my 3D home ↗"}</button></div>
  <div className="facade-review-layout">
   <div className="facade-review-photo">
    {photoPreviews[photoSlots.findIndex(p=>p.view==="front")]&&<div className="facade-photo-frame">
      <img src={photoPreviews[photoSlots.findIndex(p=>p.view==="front")]} alt="Reference front facade with architectural alignment overlay"/>
      {housePlan.door&&housePlan.door.width>.02&&<div className="anchor-box anchor-door" style={{left:(housePlan.door.x*100)+"%",bottom:(housePlan.door.y*100)+"%",width:(housePlan.door.width*100)+"%",height:(housePlan.door.height*100)+"%"}}><span>Door</span></div>}
      {housePlan.porch&&housePlan.porch.width>.05&&<div className="anchor-box anchor-porch" style={{left:(housePlan.porch.x*100)+"%",bottom:"5%",width:(housePlan.porch.width*100)+"%",height:"35%"}}><span>Porch</span></div>}
      {housePlan.dormer&&housePlan.dormer.width>.05&&<div className="anchor-box anchor-dormer" style={{left:((housePlan.dormer.center_x-housePlan.dormer.width/2)*100)+"%",top:"12%",width:(housePlan.dormer.width*100)+"%",height:"27%"}}><span>Dormer</span></div>}
      {housePlan.entry_steps?.present&&<div className="anchor-box anchor-steps" style={{left:((housePlan.entry_steps.center_x-housePlan.entry_steps.width/2)*100)+"%",bottom:"0%",width:(housePlan.entry_steps.width*100)+"%",height:"14%"}}><span>Steps</span></div>}
    </div>}
    {!photoSlots.some(p=>p.view==="front")&&<p>Add a labeled Front photo to use the facade overlay.</p>}
    <p>Colored outlines show the areas we detected.</p>
   </div>
   <div className="facade-review-controls">
    <strong>Front door</strong>
    <div className="facade-control-grid">
     {(["x","y","width","height"] as const).map(field=><label key={field}>{field.toUpperCase()} <input type="number" step=".01" min="0" max="1" value={housePlan.door?.[field]??0} onChange={e=>updateDoor(field,Math.max(0,Math.min(1,Number(e.target.value))))}/></label>)}
    </div>
    <strong>Ground and foundation elevation</strong>
    <label className="facade-checkbox"><input type="checkbox" checked={!!housePlan.foundation?.raised} onChange={e=>updateFoundation("raised",e.target.checked)}/> Raised front porch / house floor</label>
    <div className="facade-control-grid">
     <label>Height (meters) <input type="number" step=".05" min="0" max="1.7" disabled={!housePlan.foundation?.raised} value={housePlan.foundation?.height??0} onChange={e=>updateFoundation("height",Math.max(0,Math.min(1.7,Number(e.target.value))))}/></label>
    </div>
    <p>The height is an estimate from the step count and visible foundation. It should raise the porch above the yard, not create another story.</p>
    <strong>Entrance stairs</strong>
    <label className="facade-checkbox"><input type="checkbox" checked={!!housePlan.entry_steps?.present} onChange={e=>updateSteps("present",e.target.checked)}/> Visible front steps</label>
    <div className="facade-control-grid">
      <label>Steps <input type="number" min="0" max="10" step="1" value={housePlan.entry_steps?.count??0} onChange={e=>updateSteps("count",Math.max(0,Math.min(10,Math.round(Number(e.target.value)))))} /></label>
      <label>Center X <input type="number" min="0" max="1" step=".01" value={housePlan.entry_steps?.center_x??.5} onChange={e=>updateSteps("center_x",Math.max(0,Math.min(1,Number(e.target.value))))}/></label>
      <label>Width <input type="number" min="0" max="1" step=".01" value={housePlan.entry_steps?.width??.15} onChange={e=>updateSteps("width",Math.max(0,Math.min(1,Number(e.target.value))))}/></label>
    </div>
    <strong>Porch and columns</strong>
    <div className="facade-control-grid">
      <label>Left X <input type="number" min="0" max="1" step=".01" value={housePlan.porch?.x??0} onChange={e=>updatePorch("x",Math.max(0,Math.min(1,Number(e.target.value))))}/></label>
      <label>Width <input type="number" min="0" max="1" step=".01" value={housePlan.porch?.width??0} onChange={e=>updatePorch("width",Math.max(0,Math.min(1,Number(e.target.value))))}/></label>
      <label>Posts <input type="number" min="0" max="8" step="1" value={housePlan.porch_posts.length} onChange={e=>{const n=Math.max(0,Math.min(8,Math.round(Number(e.target.value))));const x=housePlan.porch?.x??.15,w=housePlan.porch?.width??.7;editPlan({...housePlan,porch_posts:Array.from({length:n},(_,i)=>x+w*(i+1)/(n+1))})}}/></label>
    </div>
    <label className="facade-checkbox"><input type="checkbox" checked={!!housePlan.porch?.railing} onChange={e=>updatePorch("railing",e.target.checked)}/> Porch railing</label>
    <strong>Upper-level structure</strong>
    <label className="upper-level-option">Type
     <select value={housePlan.upper_level?.type??(housePlan.roof_feature==="central_dormer"?"dormer":"none")}
      onChange={e=>updateUpperLevel("type",e.target.value)}>
      <option value="none">None</option>
      <option value="dormer">Small roof dormer</option>
      <option value="half_story">Half-story / upper living level</option>
     </select>
    </label>
    <div className="facade-control-grid">
     <label>Width <input type="number" min=".12" max=".8" step=".01" value={housePlan.upper_level?.width??housePlan.dormer?.width??.3} onChange={e=>updateUpperLevel("width",Math.max(.12,Math.min(.8,Number(e.target.value))))}/></label>
     <label>Wall height <input type="number" min=".15" max=".9" step=".05" value={housePlan.upper_level?.height??.5} onChange={e=>updateUpperLevel("height",Math.max(.15,Math.min(.9,Number(e.target.value))))}/></label>
     <label>Depth inset <input type="number" min="0" max=".6" step=".02" value={housePlan.upper_level?.inset??.22} onChange={e=>updateUpperLevel("inset",Math.max(0,Math.min(.6,Number(e.target.value))))}/></label>
     <label>Windows <input type="number" min="0" max="4" step="1" value={housePlan.upper_level?.windows??housePlan.dormer?.window_count??0} onChange={e=>updateUpperLevel("windows",Math.max(0,Math.min(4,Math.round(Number(e.target.value)))))} /></label>
    </div>
    <p>For the cottage reference, select <strong>Half-story / upper living level</strong> and keep two upper windows. This builds an actual raised wall volume beneath the small gable instead of a flat roof ornament.</p>
    <strong>Dormer</strong>
    <div className="facade-control-grid">
     <label>Position X <input type="number" min="0" max="1" step=".01" value={housePlan.dormer?.center_x??.5} onChange={e=>housePlan.dormer&&editPlan({...housePlan,dormer:{...housePlan.dormer,center_x:Number(e.target.value)}})}/></label>
     <label>Width <input type="number" min="0" max=".75" step=".01" value={housePlan.dormer?.width??0} onChange={e=>housePlan.dormer&&editPlan({...housePlan,dormer:{...housePlan.dormer,width:Number(e.target.value)}})}/></label>
     <label>Upper windows <input type="number" min="0" max="4" step="1" value={housePlan.dormer?.window_count??0} onChange={e=>housePlan.dormer&&editPlan({...housePlan,dormer:{...housePlan.dormer,window_count:Math.round(Number(e.target.value))},dormer_windows:[]})}/></label>
    </div>
    
   </div>
  </div>
 </section>}
 <details className="technical-options"><summary>Advanced model options <span>Blender &amp; layout tools +</span></summary>
 {housePlan&&<div className="blender-workflow"><div><strong>Generate the full editable Blender mesh</strong><p>Run the procedural modeling script locally using your Mac's installed Blender. The result loads as a GLB here, with named semantic components. Unlike the quick schematic, this step creates a downloadable Blender-generated model.</p></div><div className="blender-actions"><button className="dark" disabled={blenderBusy} onClick={generateBlenderModel}>{blenderBusy?"Blender is generating…":"Build with Blender →"}</button>{blenderUrl&&<button className="upload" onClick={downloadBlenderModel}>Download GLB ↓</button>}</div></div>}
 {blenderError&&<p className="analysis-error" role="alert">{blenderError}</p>}
 {housePlan&&<div className="geometry-corrections"><div><strong>Fine-tune the house layout</strong><p>These corrections redraw the actual 3D mesh without another AI request. Compare with the original photo above.</p></div><div className="correction-controls"><label className="correction-check"><input type="checkbox" checked={mirrorFacade} onChange={e=>{setMirrorFacade(e.target.checked);setBlenderUrl(null);blenderBlob.current=null;}}/> Flip facade left/right</label><label className="correction-label">Roof shape <select value={roofCorrection} onChange={e=>{setRoofCorrection(e.target.value as "auto"|"front_to_back"|"left_to_right");setBlenderUrl(null);blenderBlob.current=null;}}><option value="auto">AI estimate</option><option value="front_to_back">Front-facing gable ▲</option><option value="left_to_right">Side-facing ridge</option></select></label></div></div>}
 {housePlan&&<div className="generated-note"><strong>Schematic model generated</strong> · {housePlan.stories} {housePlan.stories===1?"story":"stories"} · {housePlan.roof_type} roof · {housePlan.openings.length} placed openings. <span>Side/rear geometry and exact dimensions are estimated.</span><p>{housePlan.architectural_notes}</p></div>}
 {analysis&&<div className="analysis-results"><div><strong>{analysis.building_summary}</strong><p>Likely viewpoint: {analysis.photo_view}</p><h3>Visible architectural components</h3><div className="detected-grid">{analysis.visible_components.map((item,i)=><div className="detected" key={i}><strong>{item.component}</strong><span>Count: {item.count} · {item.confidence} confidence</span><p>{item.notes}</p></div>)}</div></div><div className="analysis-notes"><h3>Reconstruction readiness</h3><p>Suggested additional views: {analysis.missing_views.length?analysis.missing_views.join(", "):"None specified"}</p><ul>{analysis.reconstruction_notes.map((note,i)=><li key={i}>{note}</li>)}</ul><p><strong>Current viewer:</strong> {housePlan?"photo-informed schematic geometry, not a measured reconstruction.":"demonstration house until you generate the schematic layout."}</p></div></div>}
 </details>
 </section>}
 <section className="workspace"><div className="viewer"><div className="viewer-head"><span className="tag"><span className="live-dot"/> {blenderUrl?"Your 3D home":housePlan?"Your preview":"Design preview"}</span><span className="muted">↔ Rotate · ＋ Zoom</span></div><div ref={host} className="canvas"/><div className="viewer-foot"><span>{hover?"✳ "+hover:blenderUrl?"Click a part to change its look":"Your design, from every angle"}</span><span>{blenderUrl?"3D ready":"Preview"}</span></div></div>
 <aside><div className="panel-heading"><span className="eyebrow">03 / THE FUN PART</span><h2>Make it pop.</h2><p>Pick a surface. Find its new color.</p></div><div className="categories">{(Object.keys(labels) as Part[]).map(c=><button key={c} className={selected===c?"cat selected":"cat"} onClick={()=>setSelected(c)}><span className="category-icon" aria-hidden="true">{({siding:"▤",roof:"⌂",trim:"▣",garage:"▥",shutter:"◫",gutter:"⌐"} as Record<Part,string>)[c]}</span><span>{labels[c]}</span></button>)}</div><div className="selection"><span className="eyebrow">COLOR BAR</span><h3>{labels[selected]}</h3><div className="swatches">{Array.from(new Set([pending[selected],...palette[selected]])).map(color=><button aria-label={color} title={color} key={color} className={pending[selected]===color?"swatch chosen":"swatch"} style={{backgroundColor:color}} onClick={()=>setPending(v=>({...v,[selected]:color}))}/>)}</div><label className="detected-color-picker">Make your own <input type="color" value={pending[selected]} onChange={e=>setPending(v=>({...v,[selected]:e.target.value}))}/><code>{pending[selected]}</code></label></div><div className="summary"><span>Ready to try</span><strong>{(Object.keys(labels) as Part[]).filter(c=>pending[c]!==applied[c]).length} changes</strong></div><button className="primary" onClick={apply}>Apply colors ↗</button></aside></section>
 <section className="export"><div className="export-art" aria-hidden="true"><span>▧</span><span>▨</span><span>▤</span></div><div><span className="eyebrow">TAKE IT HOME</span><h2>Love the new look?</h2><p>Save four views of your design.</p></div><button className="dark" disabled={busy} onClick={exportAll}>{busy?"Getting your views…":"Save 4 views ↗"}</button></section><footer>Exterior Studio · Independent research prototype, not an official James Hardie application.</footer></main>
}