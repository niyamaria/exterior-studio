"use client";
import {useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {buildPhotoHouse} from "../lib/build-house";
import type {HousePlan} from "../lib/house-plan";

type Part="siding"|"roof"|"trim"|"garage";
type Observation={component:string;count:number;notes:string;confidence:"high"|"medium"|"low"};
type Analysis={building_summary:string;photo_view:string;visible_components:Observation[];missing_views:string[];reconstruction_notes:string[]};
const palette:Record<Part,string[]>={siding:["#d9d3c4","#a4b1a6","#5c7381","#b58f77"],roof:["#383d43","#6a6461","#87715b"],trim:["#f3efe4","#ced1c9","#373e43"],garage:["#4c5256","#f2ece0","#9c9588"]};
const labels:Record<Part,string>={siding:"Main siding",roof:"Roof",trim:"Exterior trim",garage:"Garage door"};
const defaults:Record<Part,string>={siding:"#d9d3c4",roof:"#383d43",trim:"#f3efe4",garage:"#4c5256"};
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
 const host=useRef<HTMLDivElement>(null);const sceneRef=useRef<{scene:THREE.Scene;camera:THREE.PerspectiveCamera;renderer:THREE.WebGLRenderer;group:THREE.Group;controls:{az:number,el:number,dist:number};} |null>(null);
 const [selected,setSelected]=useState<Part>("siding");const [pending,setPending]=useState<Record<Part,string>>(defaults);
 const [applied,setApplied]=useState<Record<Part,string>>(defaults);const [busy,setBusy]=useState(false);
 const [photoName,setPhotoName]=useState("");const [hover,setHover]=useState("");
 const [photoFile,setPhotoFile]=useState<File|null>(null);
 const [analysis,setAnalysis]=useState<Analysis|null>(null);
 const [analyzing,setAnalyzing]=useState(false);
 const [analysisError,setAnalysisError]=useState("");
 const [housePlan,setHousePlan]=useState<HousePlan|null>(null);
 const [mirrorFacade,setMirrorFacade]=useState(false);
 const [roofCorrection,setRoofCorrection]=useState<"auto"|"front_to_back"|"left_to_right">("auto");
 const [generating,setGenerating]=useState(false);
 const [generationError,setGenerationError]=useState("");
 const [blenderUrl,setBlenderUrl]=useState<string|null>(null);
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
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;hostEl.appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xffffff,0xa9b4b7,1.45));const light=new THREE.DirectionalLight(0xfff4e8,2.45);light.position.set(-9,14,-13);light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-25;light.shadow.camera.right=25;light.shadow.camera.top=25;light.shadow.camera.bottom=-25;scene.add(light);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:"#c7cec0",roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
 const group=new THREE.Group();scene.add(group);makeHouse(group);
 const controls={az:-.68,el:.30,dist:21};sceneRef.current={scene,camera,renderer,group,controls};
 const target=new THREE.Vector3(0,3,0);const redraw=()=>{camera.position.set(target.x+Math.sin(controls.az)*Math.cos(controls.el)*controls.dist,target.y+Math.sin(controls.el)*controls.dist,target.z-Math.cos(controls.az)*Math.cos(controls.el)*controls.dist);camera.lookAt(target);renderer.render(scene,camera);};
 const resize=()=>{const w=hostEl.clientWidth,h=hostEl.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();redraw();};new ResizeObserver(resize).observe(hostEl);resize();
 let down=false,lx=0,ly=0;
 const onDown=(e:PointerEvent)=>{down=true;lx=e.clientX;ly=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)};
 const onMove=(e:PointerEvent)=>{if(down){controls.az+=(e.clientX-lx)*.008;controls.el=Math.max(-.1,Math.min(1.2,controls.el+(e.clientY-ly)*.005));lx=e.clientX;ly=e.clientY;redraw()}else{const rect=renderer.domElement.getBoundingClientRect();const mouse=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(group.children,true)[0];setHover(hit?.object?.name||"");}};
 const onUp=()=>{down=false};const onClick=(e:MouseEvent)=>{const rect=renderer.domElement.getBoundingClientRect();const mouse=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(group.children,true)[0];if(hit&&["siding","roof","trim","garage"].includes(hit.object.userData.category)){setSelected(hit.object.userData.category as Part)}};
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
  if(housePlan){
   const effectivePlan:HousePlan={...housePlan,
     roof_ridge_direction:roofCorrection==="auto"?housePlan.roof_ridge_direction:roofCorrection,
     openings:mirrorFacade?housePlan.openings.map(o=>({...o,x:1-o.x-o.width})):housePlan.openings,
     porch_posts:mirrorFacade?housePlan.porch_posts.map(x=>1-x):housePlan.porch_posts};
   if(!blenderUrl){buildPhotoHouse(x.group,effectivePlan,applied);}
   else {
    const loader=new GLTFLoader();
    loader.load(blenderUrl,gltf=>{
      if(sceneRef.current!==x)return;
      for(const obj of [...x.group.children])x.group.remove(obj);
      gltf.scene.traverse(obj=>{
        if(obj instanceof THREE.Mesh){
          const semantic=(obj.userData.semantic_class || obj.parent?.userData.semantic_class || "").toLowerCase();
          const category=semantic==="door"||semantic==="window"?"trim":semantic;
          obj.userData.category=["siding","roof","trim","garage"].includes(category)?category:undefined;
          obj.userData.lockedMaterial=Boolean(obj.userData.locked_material||obj.parent?.userData.locked_material);
          obj.castShadow=true;obj.receiveShadow=true;
        }
      });
      x.group.add(gltf.scene);
      x.renderer.render(x.scene,x.camera);
    },undefined,e=>setBlenderError("The GLB was exported but could not load in Three.js. "+String(e)));
   }
   x.controls.az=-.14;x.controls.el=.14;x.controls.dist=24;
  }else{
   makeHouse(x.group);
   x.controls.az=-.68;x.controls.el=.30;x.controls.dist=21;
  }
  x.camera.position.set(Math.sin(x.controls.az)*Math.cos(x.controls.el)*x.controls.dist,3+Math.sin(x.controls.el)*x.controls.dist,-Math.cos(x.controls.az)*Math.cos(x.controls.el)*x.controls.dist);
  x.camera.lookAt(0,3,0);x.renderer.render(x.scene,x.camera);
 // Rebuild only when a different photo plan is created or reset.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[housePlan,mirrorFacade,roofCorrection,blenderUrl]);
 async function generateBlenderModel(){
  if(!housePlan)return;
  setBlenderBusy(true);setBlenderError("");
  try{
   const response=await fetch("/api/build-blender",{
     method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(housePlan)
   });
   if(!response.ok){const error=await response.json();throw new Error(error.error||"Blender generation failed.");}
   const blob=await response.blob();
   const url=URL.createObjectURL(blob);
   if(lastBlenderUrl.current)URL.revokeObjectURL(lastBlenderUrl.current);
   lastBlenderUrl.current=url;blenderBlob.current=blob;
   setBlenderUrl(url);
  }catch(error){setBlenderError(error instanceof Error?error.message:"Could not generate Blender GLB.")}
  finally{setBlenderBusy(false)}
 }
 function downloadBlenderModel(){
  if(!blenderBlob.current||!blenderUrl)return;
  const a=document.createElement("a");a.href=blenderUrl;a.download="exterior-studio-semantic-house.glb";a.click();
 }
 async function generatePhotoModel(){
  if(!photoFile)return;
  setGenerating(true);setGenerationError("");
  try{
   const form=new FormData();form.append("photo",photoFile);
   const response=await fetch("/api/scene-plan",{method:"POST",body:form});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"Couldn't generate schematic layout.");
   const plan=data.plan as HousePlan;
   const nextColors={...defaults,siding:plan.siding_color,roof:plan.roof_color,garage:"#eeede7"};
   setPending(nextColors);setApplied(nextColors);setMirrorFacade(false);setRoofCorrection("auto");setBlenderUrl(null);blenderBlob.current=null;setHousePlan(plan);
  }catch(err){setGenerationError(err instanceof Error?err.message:"Failed to generate 3D layout.")}
  finally{setGenerating(false)}
 }
 async function analyzePhoto(){
  if(!photoFile)return;
  setAnalyzing(true);setAnalysisError("");setAnalysis(null);
  try{
    const body=new FormData();body.append("photo",photoFile);
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
 return <main className="app"><header><div className="brand"><span className="brandmark">◈</span><div><strong>EXTERIOR STUDIO</strong><small>Architectural design workspace</small></div></div><nav><span className="active">01 &nbsp; Design</span><span>02 &nbsp; Review</span><span>03 &nbsp; Export</span></nav><span className="pill">Prototype</span></header>
 <div className="heading"><div><span className="eyebrow">YOUR HOME, REIMAGINED</span><h1>Make every detail yours.</h1><p>Explore exterior finishes and stage your changes, then apply your design in one step.</p></div><label className="upload">+ Add reference photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0]||null;setPhotoFile(file);setPhotoName(file?.name||"");setAnalysis(null);setAnalysisError("");setHousePlan(null);setMirrorFacade(false);setRoofCorrection("auto");setBlenderUrl(null);blenderBlob.current=null;setGenerationError("");}}/></label></div>
 {photoName&&<section className="analysis-panel">
 <div className="analysis-intro"><div><span className="eyebrow">AI IMAGE ANALYSIS</span><h2>Understand your reference photo</h2><p><strong>{photoName}</strong> · Vision analysis finds architectural elements; it does not yet generate pixel masks or reconstruct the house.</p></div><button className="dark" disabled={analyzing} onClick={analyzePhoto}>{analyzing?"Analyzing photograph…":"Analyze house photo →"}</button></div>
 {referenceUrl&&<div className="reference-preview"><img src={referenceUrl} alt="Uploaded reference house" /><p>Actual uploaded photo • Reference for schematic geometry</p></div>}
 {analysisError&&<p className="analysis-error" role="alert">{analysisError}</p>}
 {analysis&&<div className="generate-layout"><div><strong>Generate a first-pass 3D structure</strong><p>Build editable meshes from estimated facade layout. This is a schematic approximation, not a photogrammetric reconstruction.</p></div><button className="dark" disabled={generating} onClick={generatePhotoModel}>{generating?"Building 3D layout…":"Generate schematic 3D →"}</button></div>}
 {generationError&&<p className="analysis-error" role="alert">{generationError}</p>}
 {housePlan&&<div className="blender-workflow"><div><strong>Generate the full editable Blender mesh</strong><p>Run the procedural modeling script locally using your Mac's installed Blender. The result loads as a GLB here, with named semantic components. Unlike the quick schematic, this step creates a downloadable Blender-generated model.</p></div><div className="blender-actions"><button className="dark" disabled={blenderBusy} onClick={generateBlenderModel}>{blenderBusy?"Blender is generating…":"Build with Blender →"}</button>{blenderUrl&&<button className="upload" onClick={downloadBlenderModel}>Download GLB ↓</button>}</div></div>}
 {blenderError&&<p className="analysis-error" role="alert">{blenderError}</p>}
 {housePlan&&<div className="geometry-corrections"><div><strong>Fine-tune the house layout</strong><p>These corrections redraw the actual 3D mesh without another AI request. Compare with the original photo above.</p></div><div className="correction-controls"><label className="correction-check"><input type="checkbox" checked={mirrorFacade} onChange={e=>{setMirrorFacade(e.target.checked);setBlenderUrl(null);blenderBlob.current=null;}}/> Flip facade left/right</label><label className="correction-label">Roof shape <select value={roofCorrection} onChange={e=>{setRoofCorrection(e.target.value as "auto"|"front_to_back"|"left_to_right");setBlenderUrl(null);blenderBlob.current=null;}}><option value="auto">AI estimate</option><option value="front_to_back">Front-facing gable ▲</option><option value="left_to_right">Side-facing ridge</option></select></label></div></div>}
 {housePlan&&<div className="generated-note"><strong>Schematic model generated</strong> · {housePlan.stories} {housePlan.stories===1?"story":"stories"} · {housePlan.roof_type} roof · {housePlan.openings.length} placed openings. <span>Side/rear geometry and exact dimensions are estimated.</span><p>{housePlan.architectural_notes}</p></div>}
 {analysis&&<div className="analysis-results"><div><strong>{analysis.building_summary}</strong><p>Likely viewpoint: {analysis.photo_view}</p><h3>Visible architectural components</h3><div className="detected-grid">{analysis.visible_components.map((item,i)=><div className="detected" key={i}><strong>{item.component}</strong><span>Count: {item.count} · {item.confidence} confidence</span><p>{item.notes}</p></div>)}</div></div><div className="analysis-notes"><h3>Reconstruction readiness</h3><p>Suggested additional views: {analysis.missing_views.length?analysis.missing_views.join(", "):"None specified"}</p><ul>{analysis.reconstruction_notes.map((note,i)=><li key={i}>{note}</li>)}</ul><p><strong>Current viewer:</strong> {housePlan?"photo-informed schematic geometry, not a measured reconstruction.":"demonstration house until you generate the schematic layout."}</p></div></div>}
 </section>}
 <section className="workspace"><div className="viewer"><div className="viewer-head"><span className="tag">{blenderUrl?"BLENDER SEMANTIC 3D":housePlan?"PHOTO-INFORMED SCHEMATIC 3D":"INTERACTIVE 3D DEMO"}</span><span className="muted">Drag to orbit · Scroll to zoom · Click components</span></div><div ref={host} className="canvas"/><div className="viewer-foot"><span>{hover?"Hovering: "+hover:housePlan?"Estimated facade • rear and sides not verified":"Demo house • Not generated from your photo"}</span><span>Single consistent 3D scene</span></div></div>
 <aside><div className="panel-heading"><span className="eyebrow">MATERIAL STUDIO</span><h2>Customize surfaces</h2><p>Choose a component to edit.</p></div><div className="categories">{(Object.keys(labels) as Part[]).map(c=><button key={c} className={selected===c?"cat selected":"cat"} onClick={()=>setSelected(c)}>{labels[c]}</button>)}</div><div className="selection"><span className="eyebrow">SELECTED</span><h3>{labels[selected]}</h3><p>Illustrative colors; verified James Hardie catalog integration is planned.</p><div className="swatches">{palette[selected].map(color=><button aria-label={color} title={color} key={color} className={pending[selected]===color?"swatch chosen":"swatch"} style={{backgroundColor:color}} onClick={()=>setPending(v=>({...v,[selected]:color}))}/>)}</div></div><div className="summary"><span>Staged changes</span><strong>{(Object.keys(labels) as Part[]).filter(c=>pending[c]!==applied[c]).length}</strong></div><button className="primary" onClick={apply}>Apply My Design →</button><p className="help">One click applies all staged material changes to the 3D model. AI photorealistic refinement is a later integration.</p></aside></section>
 <section className="export"><div><span className="eyebrow">FINAL DELIVERABLE</span><h2>Four views. One design.</h2><p>Download front, back, left and right PNG captures from this same {housePlan?"schematic model. Unseen elevations are estimated.":"demo model."}</p></div><button className="dark" disabled={busy} onClick={exportAll}>{busy?"Preparing captures…":"Export 4 PNG views ↓"}</button></section><footer>Exterior Studio · Independent research prototype, not an official James Hardie application.</footer></main>
}