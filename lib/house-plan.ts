export type HousePlan = {
  stories:number;
  roof_type:"gable"|"hip"|"shed"|"flat";
  roof_color:string;
  siding_color:string;
  roof_ridge_direction:"front_to_back"|"left_to_right";
  roof_pitch:"low"|"medium"|"steep";
  openings:Array<{kind:"window"|"entry_door"|"garage_door";x:number;y:number;width:number;height:number}>;
  porch_posts:number[];
  architectural_notes:string;
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
  Array.isArray(p.openings) && p.openings.every(o=>o&&kinds.includes(o.kind) &&
    [o.x,o.y,o.width,o.height].every(x=>typeof x==="number"&&Number.isFinite(x)));
}
