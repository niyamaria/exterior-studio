export type HousePlan = {
  stories:number;
  roof_type:"gable"|"hip"|"shed"|"flat";
  roof_color:string;
  siding_color:string;
  trim_color?:string;
  garage_color?:string;
  front_door_color?:string;
  shutter_color?:string;
  window_frame_color?:string;
  window_glass_color?:string;
  roof_ridge_direction:"front_to_back"|"left_to_right";
  roof_pitch:"low"|"medium"|"steep";
  openings:Array<{kind:"window"|"entry_door"|"garage_door";x:number;y:number;width:number;height:number;shape?:"arched"|"rectangular";shutters?:boolean}>;
  porch_posts:number[];
  architectural_notes:string;
  garage_side?:"left"|"right"|"none";
  siding_style?:"board_and_batten"|"lap"|"stucco"|"other";
  front_gables?:Array<{center_x:number;width:number;height_ratio:number}>;
  side_openings?:Array<{view:"left"|"right"|"rear";kind:"window"|"entry_door"|"garage_door";x:number;y:number;width:number;height:number}>;
  observed_views?:Array<"front"|"left"|"right"|"rear">;
  roof_feature?:"front_gable"|"central_dormer"|"none";
  dormer?:{center_x:number;width:number;rise:number;window_count:number};
  porch?:{x:number;width:number;depth:number;railing:boolean};
};
export function isHousePlan(value:unknown):value is HousePlan {
 if(!value||typeof value!=="object")return false;
 const p=value as Partial<HousePlan>;
 const kinds=["window","entry_door","garage_door"];
 return typeof p.stories==="number" && Number.isInteger(p.stories) && p.stories >= 1 && p.stories <= 3 &&
  ["gable","hip","shed","flat"].includes(String(p.roof_type)) &&
  ["front_to_back","left_to_right"].includes(String(p.roof_ridge_direction)) &&
  ["low","medium","steep"].includes(String(p.roof_pitch)) &&
  typeof p.siding_color==="string" && typeof p.roof_color==="string" &&
  typeof p.architectural_notes==="string" &&
  Array.isArray(p.porch_posts) && p.porch_posts.every(x=>typeof x==="number"&&Number.isFinite(x)) &&
  (p.front_gables===undefined || (Array.isArray(p.front_gables) && p.front_gables.every(g=>[g.center_x,g.width,g.height_ratio].every(x=>Number.isFinite(x))))) &&
  (p.observed_views===undefined || (Array.isArray(p.observed_views) && p.observed_views.every(v=>["front","left","right","rear"].includes(v)))) &&
  (p.side_openings===undefined || (Array.isArray(p.side_openings) && p.side_openings.every(o=>o && ["left","right","rear"].includes(o.view) && kinds.includes(o.kind) && [o.x,o.y,o.width,o.height].every(Number.isFinite)))) &&
  (p.roof_feature===undefined||["front_gable","central_dormer","none"].includes(p.roof_feature)) &&
  (p.dormer===undefined||(Number.isFinite(p.dormer.center_x)&&Number.isFinite(p.dormer.width)&&Number.isFinite(p.dormer.rise)&&Number.isInteger(p.dormer.window_count))) &&
  (p.porch===undefined||(Number.isFinite(p.porch.x)&&Number.isFinite(p.porch.width)&&Number.isFinite(p.porch.depth)&&typeof p.porch.railing==="boolean")) &&
  Array.isArray(p.openings) && p.openings.every(o=>o&&kinds.includes(o.kind) &&
    [o.x,o.y,o.width,o.height].every(x=>typeof x==="number"&&Number.isFinite(x)) &&
    (o.shape===undefined||["arched","rectangular"].includes(o.shape)) &&
    (o.shutters===undefined||typeof o.shutters==="boolean"));
}
