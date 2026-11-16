import * as THREE from "three";
import type { HousePlan } from "./house-plan";

export type MaterialCategory = "siding" | "roof" | "trim" | "garage";
type ColorMap = Record<MaterialCategory, string>;
const WIDTH = 12;
const DEPTH = 8.8;

function panel(group:THREE.Group,name:string,category:MaterialCategory,
  width:number,height:number,depth:number,x:number,y:number,z:number,color:string,provisional=false) {
 const material=new THREE.MeshStandardMaterial({color,roughness:0.83,side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);
 mesh.name=name;mesh.userData.category=category;mesh.userData.provisional=provisional;
 mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
 return mesh;
}

function face(group:THREE.Group,name:string,verts:number[],color:string,category:MaterialCategory,provisional=false){
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));
 geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.91}));
 mesh.name=name;mesh.userData.category=category;mesh.userData.provisional=provisional;mesh.castShadow=true;mesh.receiveShadow=true;
 group.add(mesh);return mesh;
}

// Produces a stylized *estimated* 3D massing model from normalized FRONT-FACADE
// observations. Depth, rear and side walls are unmeasured placeholders.
export function buildPhotoHouse(group:THREE.Group,plan:HousePlan,colors:ColorMap){
 const wallH=plan.stories===2?6.3:3.65;
 const front=-DEPTH/2;
 const roofColor=colors.roof;
 panel(group,"Observed front facade • schematic","siding",WIDTH,wallH,.22,0,wallH/2,front,colors.siding);
 panel(group,"Estimated rear wall","siding",WIDTH,wallH,.22,0,wallH/2,-front,colors.siding,true);
 panel(group,"Estimated left elevation","siding",.22,wallH,DEPTH,-WIDTH/2,wallH/2,0,colors.siding,true);
 panel(group,"Estimated right elevation","siding",.22,wallH,DEPTH,WIDTH/2,wallH/2,0,colors.siding,true);

 const overhang=.60;const left=-WIDTH/2-overhang,right=WIDTH/2+overhang;
 const near=front-overhang,far=-front+overhang;
 const rise=plan.roof_pitch==="steep"?3:plan.roof_pitch==="low"?.95:1.85;
 const high=wallH+rise;const low=wallH+.1;
 // Use real sloped triangle meshes (no floating single roof panels).
 if(plan.roof_type==="flat"){
   panel(group,"Approximate flat roof","roof",WIDTH+1.2,.22,DEPTH+1.2,0,low,0,roofColor,true);
 } else if(plan.roof_type==="shed") {
   face(group,"Estimated shed roof",[
     left,low,near,right,high,near,right,high,far,
     left,low,near,right,high,far,left,low,far
   ],roofColor,"roof",true);
 } else if(plan.roof_ridge_direction==="front_to_back"){
   face(group,"Left roof slope",[
     left,low,near,0,high,near,0,high,far,
     left,low,near,0,high,far,left,low,far
   ],roofColor,"roof");
   face(group,"Right roof slope",[
     0,high,near,right,low,near,right,low,far,
     0,high,near,right,low,far,0,high,far
   ],roofColor,"roof");
   face(group,"Front gable face",[
     -WIDTH/2,wallH,front,.0,high,front,WIDTH/2,wallH,front
   ],colors.siding,"siding");
   face(group,"Estimated back gable",[
     -WIDTH/2,wallH,-front,.0,high,-front,WIDTH/2,wallH,-front
   ],colors.siding,"siding",true);
 } else {
   face(group,"Front roof slope",[
     left,low,near,left,high,0,right,high,0,
     left,low,near,right,high,0,right,low,near
   ],roofColor,"roof");
   face(group,"Back roof slope",[
     left,high,0,left,low,far,right,low,far,
     left,high,0,right,low,far,right,high,0
   ],roofColor,"roof",true);
   face(group,"Left gable face",[
     left,wallH,front,left,high,0,left,wallH,-front
   ],colors.siding,"siding");
   face(group,"Estimated right gable face",[
     right,wallH,front,right,high,0,right,wallH,-front
   ],colors.siding,"siding",true);
 }
 // A hip roof is simplified to a gable massing envelope for now.
 plan.openings.forEach((opening,i)=>{
  const x=(opening.x+opening.width/2-.5)*WIDTH;
  const y=(opening.y+opening.height/2)*wallH;
  const w=Math.min(WIDTH*.7,Math.max(.35,opening.width*WIDTH));
  const h=Math.max(.35,opening.height*wallH);
  const z=front-.17;
  if(opening.kind==="garage_door"){
    panel(group,`Observed garage opening ${i+1}`,"garage",w,h,.10,x,Math.max(h/2,y),z,colors.garage);
    return;
  }
  if(opening.kind==="entry_door"){
    panel(group,`Observed entry door ${i+1}`,"trim",w,h,.10,x,Math.max(h/2,y),z,"#65574b");
    panel(group,`Door frame ${i+1}`,"trim",w+.17,h+.12,.055,x,Math.max(h/2,y),z+.07,colors.trim);
    panel(group,`Door infill ${i+1}`,"trim",w,h,.13,x,Math.max(h/2,y),z-.04,"#66584c");
    return;
  }
  panel(group,`Window frame ${i+1}`,"trim",w+.15,h+.15,.10,x,y,z,colors.trim);
  const glass=panel(group,`Window glass ${i+1}`,"trim",w,h,.13,x,y,z-.09,"#415f6b");
  glass.userData.lockedMaterial=true;
  panel(group,`Window sill ${i+1}`,"trim",w+.22,.08,.18,x,y-h/2-.08,z-.06,colors.trim);
 });
 plan.porch_posts.forEach((x,i)=>{
  panel(group,`Observed porch post ${i+1}`,"trim",.15,wallH*.64,.15,(x-.5)*WIDTH,wallH*.32,front-1.3,colors.trim);
 });
}
