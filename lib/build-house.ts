import * as THREE from "three";
import type {HousePlan} from "./house-plan";

export type MaterialCategory = "siding" | "roof" | "trim" | "garage";
type ColorMap = Record<MaterialCategory,string>;
const W=12, D=8.8, F=-D/2;
const dark="#253845";

function solid(group:THREE.Group,name:string,category:MaterialCategory,dimensions:[number,number,number],position:[number,number,number],color:string,options?:{locked?:boolean;estimated?:boolean;roughness?:number}){
 const mat=new THREE.MeshStandardMaterial({color,roughness:options?.roughness??.78,metalness:.02});
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...dimensions),mat);
 mesh.position.set(...position);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;
 mesh.userData={category,lockedMaterial:!!options?.locked,provisional:!!options?.estimated};
 group.add(mesh);return mesh;
}
function polygon(group:THREE.Group,name:string,category:MaterialCategory,vertices:number[],color:string,estimated=false){
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
 geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.9}));
 mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={category,provisional:estimated};
 group.add(mesh);return mesh;
}
function quad(group:THREE.Group,name:string,category:MaterialCategory,a:[number,number,number],b:[number,number,number],c:[number,number,number],d:[number,number,number],color:string,estimated=false){
 return polygon(group,name,category,[...a,...b,...c,...a,...c,...d],color,estimated);
}
function beam(group:THREE.Group,name:string,category:MaterialCategory,a:THREE.Vector3,b:THREE.Vector3,width:number,depth:number,color:string,locked=false){
 const mid=a.clone().add(b).multiplyScalar(.5),length=a.distanceTo(b);
 const mesh=solid(group,name,category,[width,length,depth],[mid.x,mid.y,mid.z],color,{locked});
 mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return mesh;
}
function roofShade(input:string){
 // Gemini sometimes guesses pure white for roof regions; a white slab wipes out roof shape.
 // Use dark neutral when color is near-white, while preserving real medium/dark colors.
 const color=new THREE.Color(input);
 const light=Math.max(color.r,color.g,color.b);
 return light>.8?"#444d53":input;
}
export function buildPhotoHouse(group:THREE.Group,plan:HousePlan,colors:ColorMap){
 const H=plan.stories===2?6.4:4.0;
 const roof=roofShade(colors.roof);
 const wall=colors.siding,trim=colors.trim;
 const over=.58,left=-W/2-over,right=W/2+over,front=F-over,back=-F+over;
 const pitch=plan.roof_pitch==="steep"?2.95:plan.roof_pitch==="low"?1.25:2.2;
 const eave=H+.12,ridge=eave+pitch;
 const opaque=(name:string,dim:[number,number,number],pos:[number,number,number],color:string,locked=false)=>solid(group,name,"trim",dim,pos,color,{locked});

 // Structural walls: building mass has genuine depth, rear and side faces are placeholders.
 solid(group,"Front wall • observed","siding",[W,H,.26],[0,H/2,F],wall);
 solid(group,"Rear wall • estimated","siding",[W,H,.26],[0,H/2,-F],wall,{estimated:true});
 solid(group,"Left wall • estimated","siding",[.26,H,D],[-W/2,H/2,0],wall,{estimated:true});
 solid(group,"Right wall • estimated","siding",[.26,H,D],[W/2,H/2,0],wall,{estimated:true});

 // Horizontal base courses and vertical board-and-batten relief. Repeated mesh
 // components add identifiable detail, not a single flat white wall.
 const battens=24;
 for(let i=0;i<=battens;i++){
   const x=-W/2+i*(W/battens);
   const m=solid(group,`Front siding batten ${i+1}`,"siding",[.038,H,.043],[x,H/2,F-.16],wall);
   m.material=new THREE.MeshStandardMaterial({color:wall,roughness:.91});
 }
 for(let i=0;i<10;i++){
   const z=F+.45+i*(D-.9)/9;
   solid(group,`Left siding batten ${i+1}`,"siding",[.04,H,.044],[-W/2-.16,H/2,z],wall,{estimated:true});
   solid(group,`Right siding batten ${i+1}`,"siding",[.04,H,.044],[W/2+.16,H/2,z],wall,{estimated:true});
 }
 solid(group,"Lower foundation band","trim",[W+.08,.14,.18],[0,.10,F-.2],trim);

 // Cohesive, joined roof geometry: no detached slopes, explicit gable triangles.
 if(plan.roof_type==="flat"){
   solid(group,"Flat roof shell","roof",[W+over*2,.24,D+over*2],[0,eave,0],roof,{estimated:true});
 }else if(plan.roof_type==="shed"){
   quad(group,"Shed roof plane","roof",[left,eave,front],[right,ridge,front],[right,ridge,back],[left,eave,back],roof,true);
   beam(group,"Shed fascia","roof",new THREE.Vector3(left,eave,front),new THREE.Vector3(right,ridge,front),.17,.12,roof);
 }else if(plan.roof_ridge_direction==="front_to_back"){
   quad(group,"Left roof plane","roof",[left,eave,front],[0,ridge,front],[0,ridge,back],[left,eave,back],roof);
   quad(group,"Right roof plane","roof",[0,ridge,front],[right,eave,front],[right,eave,back],[0,ridge,back],roof);
   polygon(group,"Front gable siding","siding",[-W/2,H,F-.04,0,ridge-.07,F-.04,W/2,H,F-.04],wall);
   polygon(group,"Rear gable • estimated","siding",[-W/2,H,-F+.04,0,ridge-.07,-F+.04,W/2,H,-F+.04],wall,true);
   beam(group,"Left fascia","trim",new THREE.Vector3(left,eave,front),new THREE.Vector3(0,ridge,front),.16,.13,trim);
   beam(group,"Right fascia","trim",new THREE.Vector3(0,ridge,front),new THREE.Vector3(right,eave,front),.16,.13,trim);
   beam(group,"Front eave trim","trim",new THREE.Vector3(left,eave,front),new THREE.Vector3(right,eave,front),.11,.12,trim);
   beam(group,"Ridge cap","roof",new THREE.Vector3(0,ridge,front),new THREE.Vector3(0,ridge,back),.09,.12,roof);
   for(let i=1;i<13;i++){
     const x=-W/2+i*(W/13);
     const y=H+(ridge-H)*(1-Math.abs(x)/(W/2));
     beam(group,`Gable siding seam ${i}`,"siding",new THREE.Vector3(x,H+.03,F-.08),new THREE.Vector3(x,y-.08,F-.08),.033,.045,wall);
   }
 }else{
   quad(group,"Front roof plane","roof",[left,eave,front],[left,ridge,0],[right,ridge,0],[right,eave,front],roof);
   quad(group,"Rear roof plane","roof",[left,ridge,0],[left,eave,back],[right,eave,back],[right,ridge,0],roof,true);
   polygon(group,"Left gable siding","siding",[-W/2,H,F,-W/2,ridge,0,-W/2,H,-F],wall);
   polygon(group,"Right gable • estimated","siding",[W/2,H,F,W/2,ridge,0,W/2,H,-F],wall,true);
   beam(group,"Front horizontal fascia","trim",new THREE.Vector3(left,eave,front),new THREE.Vector3(right,eave,front),.17,.16,trim);
   beam(group,"Front ridge cap","roof",new THREE.Vector3(left,ridge,0),new THREE.Vector3(right,ridge,0),.10,.12,roof);
 }

 // The visible facade openings are estimated 2D boxes aligned to a shared front plane.
 // They are overlays, not Boolean cutouts; geometry is explicitly schematic.
 const glassColor="#395663",doorColor="#725c49";
 plan.openings.slice(0,18).forEach((o,i)=>{
   const x=Math.max(-W/2+.3,Math.min(W/2-.3,(o.x+o.width/2-.5)*W));
   let w=Math.max(.43,Math.min(W*.48,o.width*W));
   const maxSpan=Math.min(x+W/2,W/2-x)*2-.13;w=Math.min(w,Math.max(.4,maxSpan));
   const h=Math.max(.46,Math.min(H*.8,o.height*H));
   const y=Math.min(H-h/2-.13,Math.max(h/2+.08,(o.y+o.height/2)*H));
   const z=F-.24;
   if(o.kind==="garage_door"){
     solid(group,`Garage surround ${i+1}`,"trim",[w+.28,h+.25,.09],[x,y,z+.035],trim);
     solid(group,`Garage door ${i+1}`,"garage",[w,h,.10],[x,y,z-.06],colors.garage);
     const rows=4,cols=Math.max(2,Math.min(5,Math.round(w/.72)));
     for(let r=1;r<rows;r++){
       opaque(`Garage panel division horizontal ${i}-${r}`,[w,.027,.022],[x,y-h/2+r*h/rows,z-.13],"#c2c6c4",true);
     }
     for(let c=1;c<cols;c++){
       opaque(`Garage panel division vertical ${i}-${c}`,[.02,h,.02],[x-w/2+c*w/cols,y,z-.13],"#8d9495",true);
     }
     // Glazed upper lites match the architectural character of reference garage doors.
     for(let c=0;c<cols;c++){
       const px=x-w/2+(c+.5)*w/cols;
       opaque(`Garage glass lite ${i}-${c}`,[(w/cols)*.73,h*.12,.027],[px,y+h*.32,z-.15],dark,true);
     }
   }else if(o.kind==="entry_door"){
     solid(group,`Front door casing ${i+1}`,"trim",[w+.20,h+.12,.09],[x,y,z],trim);
     const door=solid(group,`Front entry door ${i+1}`,"trim",[w,h,.10],[x,y,z-.07],doorColor,{locked:true});
     door.userData.lockedMaterial=true;
     opaque(`Door glass inset ${i+1}`,[w*.34,h*.47,.03],[x,y+h*.1,z-.15],dark,true);
     opaque(`Door handle ${i+1}`,[.035,.10,.05],[x+w*.35,y-h*.1,z-.17],"#b59d64",true);
     solid(group,`Entry threshold ${i+1}`,"trim",[w+.36,.10,.47],[x,.12,F-.44],trim);
   }else{
     solid(group,`Window casing ${i+1}`,"trim",[w+.19,h+.20,.10],[x,y,z],trim);
     const glass=solid(group,`Window glazing ${i+1}`,"trim",[w,h,.12],[x,y,z-.095],glassColor,{locked:true,roughness:.18});
     glass.userData.lockedMaterial=true;
     opaque(`Window center mullion ${i+1}`,[.045,h,.05],[x,y,z-.18],trim);
     opaque(`Window upper rail ${i+1}`,[w,.04,.05],[x,y+h*.22,z-.18],trim);
     solid(group,`Window sill ${i+1}`,"trim",[w+.28,.11,.35],[x,y-h/2-.09,z-.1],trim);
   }
 });

 // The image may contain porch support posts; put them in FRONT of facade
 // and give them a shallow coherent canopy rather than floating vertical bars.
 if(plan.porch_posts.length){
   const xs=plan.porch_posts.map(x=>(x-.5)*W).sort((a,b)=>a-b);
   const min=Math.max(-W/2,Math.min(...xs)-.75);
   const max=Math.min(W/2,Math.max(...xs)+.75);
   const pw=Math.max(1.8,max-min),cx=(max+min)/2,postH=Math.min(H*.82,3.0);
   const pz=F-1.55;
   solid(group,"Covered porch beam","trim",[pw,.20,.20],[cx,postH,pz],trim);
   solid(group,"Shallow porch canopy","roof",[pw+.30,.16,1.7],[cx,postH+.16,F-.85],roof);
   xs.forEach((x,i)=>{
     solid(group,`Porch support post ${i+1}`,"trim",[.16,postH,.16],[x,postH/2,pz],trim);
     solid(group,`Porch post plinth ${i+1}`,"trim",[.30,.29,.30],[x,.145,pz],trim);
   });
 }
}
