import { parse, stringify } from 'lossless-json';
import { compose, distance, identity, one, quaternion, relative, scale, zero, type Transform, type Vec } from './math';
import { decodeNative, encodeNative, prefabId, type Prefab } from './prefab';

// Unknown plugin fields remain opaque; parsing/stringifying preserves 64-bit IDs.
export type JsonObject = Record<string, any>;
export type Project = { format: 'rustcar-workshop'; version: 1; filename: string; car: JsonObject };
export type PropRef = { key: string; parentKey?: string; prop: JsonObject; world: Transform; editable: boolean; reason?: string };
export type ExportResult = { project: Project; prefabs: Prefab[]; refs: PropRef[]; warnings: string[]; copyPaste: JsonObject };
export type ImportResult = { car: JsonObject; prefabs: Prefab[]; matched: number; added: number; missing: number; removed: number; warnings: string[] };
export const ORIGIN_PATH='assets/bundled/prefabs/modding/volumes_and_triggers/spawn_point.prefab';
// Rust moved this asset. Older workshop exports and RustEdit saves may use either ID.
export const LEGACY_ORIGIN_PATH='assets/bundled/prefabs/modding/spawn_point.prefab';
const ORIGIN_IDS=new Set([prefabId(ORIGIN_PATH),prefabId(LEGACY_ORIGIN_PATH)]);
const ORIGIN_CATEGORY='RCW|origin';
function withOrigin(prefabs:Prefab[]):Prefab[] {
  if(prefabs.some(p=>ORIGIN_IDS.has(p.id)))return prefabs;
  return [...prefabs,{id:prefabId(ORIGIN_PATH),path:ORIGIN_PATH,category:ORIGIN_CATEGORY,...identity(),skin:0}];
}
export const toJson = (value: unknown) => stringify(value, undefined, 2)!;
export function readJson(text: string): any {
  if(text.length>64*1024*1024) throw new Error('Please choose a JSON file smaller than 64 MB.');
  try { return parse(text.replace(/^\uFEFF/,'')); } catch(error) { throw new Error(`Invalid JSON: ${error instanceof Error?error.message:'could not read file'}`); }
}
const clone = <T,>(data:T):T => readJson(toJson(data));
export function vec(value:any, fallback:Vec=zero()):Vec {
  if(value==null) return {...fallback};
  const out={x:Number(value.x),y:Number(value.y),z:Number(value.z)};
  if(Object.values(out).some(n=>!Number.isFinite(n))) throw new Error('A prop has an invalid x, y or z value.');
  return out;
}
export function transform(prop:JsonObject):Transform { return {position:vec(prop.Location),rotation:vec(prop.Rotation),scale:vec(prop.Scale,one())}; }
export function makeProject(data:any, filename:string):Project {
  if(data?.format==='rustcar-workshop') {
    if(Number(data.version)!==1) throw new Error('Unsupported workshop project version.');
    return makeProject(data.car, data.filename || filename);
  }
  if(!data||!Array.isArray(data.PropConfigs)||data.PropConfigs.length===0) throw new Error('Choose a RustCar configuration with a nonempty PropConfigs array.');
  return {format:'rustcar-workshop',version:1,filename:filename.replace(/\.json$/i,''),car:clone(data)};
}
export function collectProps(car:JsonObject):PropRef[] {
  const refs:PropRef[]=[];
  const walk=(prop:JsonObject,key:string,parent:Transform,parentKey?:string,depth=0)=>{
    if(depth>64) throw new Error('Prop hierarchy is too deeply nested.');
    if(!prop||typeof prop!=='object') throw new Error(`Invalid prop at ${key}.`);
    const local=transform(prop), world=parentKey?compose(parent,local):local;
    const path=prop.PrefabPath;
    const reason=prop.GibName?'gib mesh':typeof path!=='string'||!path.trim()?'item or virtual prop':undefined;
    refs.push({key,parentKey,prop,world,editable:!reason,reason});
    if(prop.SubPropConfigs!=null&&!Array.isArray(prop.SubPropConfigs)) throw new Error(`Invalid SubPropConfigs at ${key}.`);
    (prop.SubPropConfigs||[]).forEach((p:JsonObject,i:number)=>walk(p,`${key}/SubPropConfigs/${i}`,world,key,depth+1));
  };
  car.PropConfigs.forEach((p:JsonObject,i:number)=>walk(p,`PropConfigs/${i}`,identity()));
  // Wheel item roots have no prefab path. Their visual subprops still have transforms.
  (car.WheelColliders||[]).forEach((w:JsonObject,i:number)=>{ if(w.PropConfig) walk(w.PropConfig,`WheelColliders/${i}/PropConfig`,identity()); });
  return refs;
}
export function exportCar(project:Project):ExportResult {
  const refs=collectProps(project.car), warnings:string[]=[];
  const prefabs:Prefab[]=refs.filter(r=>r.editable).map(r=>({id:prefabId(r.prop.PrefabPath),path:r.prop.PrefabPath,category:`RCW|${r.key}`, ...r.world,skin:r.prop.SkinId??0}));
  if(!prefabs.length) throw new Error('This car has no props that RustEdit can represent.');
  const kept=refs.filter(r=>!r.editable);
  if(kept.length) warnings.push(`${kept.length} item / gib props stay in the project and cannot be edited in RustEdit.`);
  const scaled=prefabs.filter(p=>distance(p.scale,one())>0.00001).length;
  if(scaled) warnings.push(`CopyPaste import resets scale on ${scaled} props. Use the .prefab download to keep scale.`);
  warnings.push('Skins, flags and car behavior are restored from the project; RustEdit does not edit them.');
  const copyPaste={
    default:{position:{x:'0',y:'0',z:'0'},rotationy:'0',rotationdiff:'0'},
    protocol:{items:2,version:{Major:4,Minor:3,Patch:0}},
    entities:withOrigin(prefabs).map(p=>({prefabname:p.path,skinid:p.skin,ownerid:0,flags:{},pos:strings(p.position),rot:strings(scale(p.rotation,Math.PI/180)),scale:strings(p.scale),_rustcarKey:p.category.slice(4)})),
    _rustcarWorkshop:project,
  };
  return {project,prefabs,refs,warnings,copyPaste};
}
const strings=(v:Vec)=>({x:String(v.x),y:String(v.y),z:String(v.z)});
export const nativeFile=(result:ExportResult)=>encodeNative(withOrigin(result.prefabs));

export function decodeCopyPaste(data:JsonObject):Prefab[] {
  if(!Array.isArray(data.entities)||!data.entities.length) throw new Error('Choose a CopyPaste JSON with a nonempty entities array.');
  const out:Prefab[]=[];
  const walk=(entity:JsonObject,parent?:Transform,depth=0)=>{
    if(depth>64) throw new Error('Entity hierarchy is too deeply nested.');
    if(typeof entity.prefabname!=='string'||!entity.prefabname) throw new Error('A CopyPaste entity is missing prefabname.');
    // CopyPaste 4.3.0: roots use radians, children use degrees.
    const local={position:vec(entity.pos),rotation:scale(vec(entity.rot),parent?1:180/Math.PI),scale:vec(entity.scale,one())};
    const world=parent?compose(parent,local):local;
    out.push({id:prefabId(entity.prefabname),path:entity.prefabname,category:entity._rustcarKey?`RCW|${entity._rustcarKey}`:'Decor',...world,skin:entity.skinid,source:entity});
    if(entity.children!=null&&!Array.isArray(entity.children)) throw new Error('Invalid CopyPaste children array.');
    (entity.children||[]).forEach((e:JsonObject)=>walk(e,world,depth+1));
  };
  data.entities.forEach((e:JsonObject)=>walk(e));
  return out;
}
export function assetMapFromText(text:string):Map<number,string> {
  const map=new Map<number,string>();
  if(text.trim().startsWith('{')) {
    const data=readJson(text);
    for(const [id,path] of Object.entries(data)) if(typeof path==='string'&&path.toLowerCase().endsWith('.prefab')) {
      if(Number(id)!==prefabId(path)) throw new Error(`Asset ID does not match its path: ${id}.`);
      map.set(Number(id),path);
    }
  } else {
    for(const line of text.split(/\r?\n/)) {
      const match=line.match(/^\s*(\d+)\s+-\s+(assets\/.*\.prefab)\s*$/i);
      if(match) { if(Number(match[1])!==prefabId(match[2])) throw new Error(`Asset ID does not match its path: ${match[1]}.`); map.set(Number(match[1]),match[2]); }
    }
  }
  if(!map.size) throw new Error('No prefab paths found. Use RustEdit stringpool.txt or an ID-to-path JSON object.');
  return map;
}
export function assetFileFromText(text:string):{paths:Map<number,string>; entityPaths?:Set<string>} {
  if(text.trim().startsWith('{')) {
    const data=readJson(text);
    if(data?.format==='rustcar-prefab-catalog') {
      if(Number(data.version)!==1||!Array.isArray(data.entities)||!data.entities.length) throw new Error('Invalid server prefab catalog.');
      const paths=new Map<number,string>(),entityPaths=new Set<string>();
      for(const path of data.entities) {
        if(typeof path!=='string'||!/^assets\/.+\.prefab$/.test(path)) throw new Error('Invalid prefab path in server catalog.');
        const id=prefabId(path);
        if(paths.has(id)&&paths.get(id)!==path) throw new Error('Conflicting prefab IDs in server catalog.');
        paths.set(id,path);entityPaths.add(path);
      }
      return {paths,entityPaths};
    }
  }
  return {paths:assetMapFromText(text)};
}
function at(car:JsonObject,key:string):JsonObject {
  let value:any=car;
  for(const part of key.split('/')) { if(['__proto__','prototype','constructor'].includes(part)) throw new Error('Invalid prop key.'); value=value?.[part]; }
  if(!value||typeof value!=='object') throw new Error('Project prop key was not found.');
  return value;
}
export function importEdits(project:Project,input:Uint8Array|JsonObject,options:{removeMissing?:boolean; assets?:Map<number,string>; entityPaths?:ReadonlySet<string>}={}):ImportResult {
  const native=input instanceof Uint8Array, imported=native?decodeNative(input):decodeCopyPaste(input);
  const car=clone(project.car), refs=collectProps(car), editable=refs.filter(r=>r.editable);
  const assets=new Map(options.assets), assignments=new Map<string,Prefab>(), used=new Set<Prefab>(), warnings:string[]=[];
  const originalHasOrigin=refs.some(r=>typeof r.prop.PrefabPath==='string'&&ORIGIN_IDS.has(prefabId(r.prop.PrefabPath)));
  const anchors=imported.filter(p=>p.category===ORIGIN_CATEGORY||(!originalHasOrigin&&ORIGIN_IDS.has(p.id)));
  if(anchors.length>1) throw new Error('Multiple origin markers found. Keep only the original spawn-point marker with your car.');
  const anchor=anchors[0];
  const prefabs=imported.filter(p=>p!==anchor).map(p=>anchor?{...p,...relative(anchor,p)}:p);
  if(!prefabs.length)throw new Error('The edited file contains an origin marker but no car geometry.');
  if(!anchor&&!originalHasOrigin) throw new Error('Origin marker missing. Include the spawn-point marker when saving your car selection in RustEdit; its position is needed to align geometry with the car physics.');
  refs.forEach(r=>{ if(r.prop.PrefabPath) assets.set(prefabId(r.prop.PrefabPath),r.prop.PrefabPath); });
  prefabs.forEach(p=>{ if(p.path) assets.set(p.id,p.path); });
  const unresolved=[...new Set(prefabs.filter(p=>!assets.has(p.id)).map(p=>p.id))];
  if(unresolved.length) throw new Error(`Unknown prefab IDs: ${unresolved.slice(0,8).join(', ')}${unresolved.length>8?'…':''}. Load RustEdit stringpool.txt under Asset paths to resolve new assets.`);
  prefabs.forEach(p=>p.path=assets.get(p.id)!);
  // A path/ID list includes scenery too; it cannot prove a BaseEntity exists.
  // These original prop modes already require an entity at their prefab path.
  const knownEntities=new Set(refs.filter(r=>[1,3,6,8].includes(Number(r.prop.PropType))&&r.prop.PrefabPath).map(r=>r.prop.PrefabPath));
  const requireEntity=(path:string)=>{
    const verified=options.entityPaths?options.entityPaths.has(path):knownEntities.has(path);
    if(!verified) throw new Error(options.entityPaths
      ?`Unsupported car prop: ${path}. This prefab has no BaseEntity entry in the server catalog. Use a spawnable entity prefab in RustEdit.`
      :`Unverified new car prop: ${path}. RustEdit includes scenery that RustCar cannot spawn. Load a server prefab catalog under Asset paths, or use an entity prefab already used by this car.`);
  };
  // Native categories and our JSON entity keys survive edits that retain metadata.
  for(const ref of editable) {
    const candidates=prefabs.filter(p=>!used.has(p)&&p.category===`RCW|${ref.key}`);
    candidates.sort((a,b)=>distance(a.position,ref.world.position)-distance(b.position,ref.world.position));
    if(candidates.length) {assignments.set(ref.key,candidates[0]);used.add(candidates[0]);}
  }
  // CopyPaste import discards category IDs. Match same assets globally by proximity.
  const pairs:Array<{ref:PropRef;p:Prefab;cost:number}>=[];
  for(const ref of editable) if(!assignments.has(ref.key)) for(const p of prefabs) if(!used.has(p)&&p.id===prefabId(ref.prop.PrefabPath)) pairs.push({ref,p,cost:distance(ref.world.position,p.position)});
  pairs.sort((a,b)=>a.cost-b.cost);
  let inferred=0;
  for(const pair of pairs) if(!assignments.has(pair.ref.key)&&!used.has(pair.p)) { assignments.set(pair.ref.key,pair.p);used.add(pair.p);inferred++; }
  if(inferred) warnings.push(`${inferred} props matched by asset and position. Review repeated assets after large moves.`);
  const worlds=new Map<string,Transform>();
  for(const ref of refs) {
    const p=assignments.get(ref.key), prop=at(car,ref.key);
    const parent=ref.parentKey?worlds.get(ref.parentKey)!:identity();
    if(p) {
      const local=ref.parentKey?relative(parent,p):p;
      // RustEdit saves world transforms before subtracting the prefab pivot. This
      // introduces position noise beyond just the final file's float32 rounding.
      for(const [field,v] of [['Location',local.position],['Rotation',local.rotation],['Scale',local.scale]] as const) {
        if(field==='Scale'&&!native&&!(p.source as JsonObject)?.scale) continue;
        const original=vec(prop[field],field==='Scale'?one():zero());
        const same=field==='Rotation'?rotationClose(original,v):distance(original,v)<(field==='Location'?1e-4:1e-5);
        if(!same) prop[field]=v;
      }
      if(p.path!==prop.PrefabPath) {
        if(Number(prop.PartType)!==3||![1,3].includes(Number(prop.PropType))) throw new Error('Replacing a special car part with a different asset is unsupported. Keep its asset, or add a separate decorative prop.');
        requireEntity(p.path!);
        prop.PrefabPath=p.path;
      }
      // Existing prop metadata (including skins) always belongs to the original car.
      worlds.set(ref.key,ref.parentKey?compose(parent,transform(prop)):transform(prop));
    } else worlds.set(ref.key,ref.parentKey?compose(parent,transform(prop)):transform(prop));
  }
  const missingRefs=editable.filter(r=>!assignments.has(r.key));
  if(options.removeMissing) {
    // Remove deepest/highest indices first so sibling indices remain valid.
    const toRemove=missingRefs.map(r=>r.key).sort((a,b)=>b.split('/').length-a.split('/').length||b.localeCompare(a,undefined,{numeric:true}));
    for(const key of toRemove) {
      const parts=key.split('/'),index=parts.pop()!,parent=at(car,parts.join('/'));
      if(Array.isArray(parent)) parent.splice(Number(index),1);
      else { delete parent[index]; }
    }
  } else if(missingRefs.length) warnings.push(`${missingRefs.length} missing props kept from the original. Enable “Remove missing props” to delete them.`);
  const additions=prefabs.filter(p=>!used.has(p));
  for(const p of additions) {
    requireEntity(p.path!);
    car.PropConfigs.push({PartType:3,PropType:3,PrefabPath:p.path,NetworkPrefabOverride:null,SkinId:p.skin??0,SkinId2:0,ItemId:0,Location:p.position,Rotation:p.rotation,Scale:p.scale,GibName:null,DetectCollisions:false,ModelState:null,Flags:0,SubPropConfigs:null});
  }
  if(additions.length) warnings.push(`${additions.length} new props added as decorative entities with collisions disabled. Seats, engines and other functional parts need separate configuration.`);
  if(car.PropConfigs.length===0) throw new Error('The edit would leave the car with zero PropConfigs, which RustCar rejects.');
  return {car,prefabs,matched:assignments.size,added:additions.length,missing:missingRefs.length,removed:options.removeMissing?missingRefs.length:0,warnings};
}
function rotationClose(a:Vec,b:Vec) {
  const qa=quaternion(a),qb=quaternion(b);
  return 1-Math.abs(qa.reduce((sum,n,i)=>sum+n*qb[i],0))<1e-12;
}
