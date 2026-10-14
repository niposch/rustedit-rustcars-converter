import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assetMapFromText, decodeCopyPaste, exportCar, importEdits, makeProject, nativeFile, readJson, toJson, ORIGIN_PATH, LEGACY_ORIGIN_PATH } from '../src/lib/converter.ts';
import { decodeLz4Block, decodeNative, encodeNative, prefabId } from '../src/lib/prefab.ts';
import { compose, distance, euler, one, quaternion, relative, rotate, zero } from '../src/lib/math.ts';

const path='assets/prefabs/deployable/woodenbox/woodbox_deployed.prefab';
const prop=(x=0,overrides={})=>({PartType:3,PropType:3,PrefabPath:path,Location:{x,y:0,z:0},Rotation:zero(),Scale:one(),SkinId:0,Flags:0,SubPropConfigs:null,...overrides});
const car=()=>readJson(`{"EngineKW":137.1234567890123456789,"OwnerID":76561198000000001,"FuelSettings":{"Amount":17},"PropConfigs":${toJson([prop(0,{PartType:22,DetectCollisions:true}),prop(3)])}}`);
const project=()=>makeProject(car(),'test-car.json');
test('prefab IDs use lowercase MD5 in little-endian order',()=>{
  const expected=createHash('md5').update(path.toLowerCase()).digest().readUInt32LE(0);
  assert.equal(prefabId(path.toUpperCase()),expected);
});
test('JSON round trip preserves the complete car, high precision numbers, and 64-bit IDs',()=>{
  const p=project(),out=exportCar(p),result=importEdits(p,readJson(toJson(out.copyPaste)));
  assert.equal(toJson(result.car),toJson(p.car));
  assert.match(toJson(result.car),/76561198000000001/);
  assert.match(toJson(result.car),/137\.1234567890123456789/);
});
test('native round trip updates only transforms, keeps special prop fields and all car settings',()=>{
  const p=project(),out=exportCar(p);out.prefabs[0].position={x:1.25,y:2,z:-3};out.prefabs[0].scale={x:0.25,y:2,z:1};
  const result=importEdits(p,nativeFile(out));
  assert.deepEqual(result.car.PropConfigs[0].Location,{x:1.25,y:2,z:-3});
  assert.deepEqual(result.car.PropConfigs[0].Scale,{x:0.25,y:2,z:1});
  assert.equal(Number(result.car.PropConfigs[0].PartType),22);
  assert.equal(result.car.PropConfigs[0].DetectCollisions,true);
  assert.equal(toJson(result.car.FuelSettings),toJson(p.car.FuelSettings));
  assert.equal(toJson(result.car.EngineKW),toJson(p.car.EngineKW));
  assert.equal(toJson(p.car),toJson(car()));
});
test('geometry import cannot overwrite skins, flags or gameplay fields',()=>{
  const p=project();p.car.PropConfigs[0].SkinId=readJson('18446744073709551615');
  const out=exportCar(p);out.copyPaste.entities[0].skinid=42;out.copyPaste.entities[0].flags={On:true};
  const result=importEdits(p,out.copyPaste);
  assert.equal(toJson(result.car),toJson(p.car));
});
test('origin marker corrects placement, rotation and changed export pivot after categories are overwritten',()=>{
  const p=project(),prefabs=decodeNative(nativeFile(exportCar(p)));
  const placement={position:{x:123,y:40,z:-70},rotation:{x:0,y:35,z:0},scale:one()};
  const saved=prefabs.map(prefab=>({...prefab,...compose(placement,prefab),category:'Decor'}));
  const result=importEdits(p,encodeNative(saved));
  assert.equal(result.matched,2);assert.equal(result.added,0);
  assert.ok(distance(result.car.PropConfigs[0].Location,zero())<0.00002);
  assert.ok(distance(result.car.PropConfigs[1].Location,{x:3,y:0,z:0})<0.00002);
  assert.equal(toJson(result.car.FuelSettings),toJson(p.car.FuelSettings));
});
test('current exports use the installed Rust asset path for the origin marker',()=>{
  const out=exportCar(project());
  const marker=decodeNative(nativeFile(out)).find(p=>p.category==='RCW|origin');
  assert.equal(marker?.id,prefabId(ORIGIN_PATH));
  assert.equal(out.copyPaste.entities.at(-1).prefabname,ORIGIN_PATH);
});
test('both marker IDs align repeated assets after RustEdit replaces categories',()=>{
  for(const markerPath of [ORIGIN_PATH,LEGACY_ORIGIN_PATH]) {
    const p=project(),prefabs=decodeNative(nativeFile(exportCar(p)));
    const placement={position:{x:-1.25,y:1.1875,z:-.375},rotation:zero(),scale:one()};
    const saved=prefabs.map(prefab=>({...prefab,...compose(placement,prefab),id:prefab.category==='RCW|origin'?prefabId(markerPath):prefab.id,category:':SavedCar::'}));
    const result=importEdits(p,encodeNative(saved));
    assert.equal(toJson(result.car),toJson(p.car));
    assert.equal(result.added,0);
    assert.equal(result.matched,2);
  }
});
test('legacy marker is also recognized in untagged CopyPaste JSON',()=>{
  const p=project(),out=exportCar(p);
  const marker=out.copyPaste.entities.at(-1);
  marker.prefabname=LEGACY_ORIGIN_PATH;
  for(const entity of out.copyPaste.entities) {
    delete entity._rustcarKey;
    entity.pos.x=String(Number(entity.pos.x)-1.25);
    entity.pos.y=String(Number(entity.pos.y)+1.1875);
    entity.pos.z=String(Number(entity.pos.z)-.375);
  }
  const result=importEdits(p,out.copyPaste);
  assert.equal(toJson(result.car),toJson(p.car));assert.equal(result.added,0);
});
test('return import refuses geometry without its origin instead of shifting physics alignment',()=>{
  const p=project(),out=exportCar(p);
  assert.throws(()=>importEdits(p,encodeNative(out.prefabs)),/Origin marker missing/);
  out.copyPaste.entities.pop();
  assert.throws(()=>importEdits(p,out.copyPaste),/Origin marker missing/);
});
test('small world-to-pivot rounding noise keeps original positions and metadata',()=>{
  const p=project(),prefabs=decodeNative(nativeFile(exportCar(p)));
  prefabs.filter(p=>p.category!=='RCW|origin').forEach(p=>{p.position.x+=.00002;p.position.y-=.000015;p.position.z+=.00001;});
  const result=importEdits(p,encodeNative(prefabs));
  assert.equal(toJson(result.car),toJson(p.car));
});
test('native serialization supports many props without argument stack limits',()=>{
  const base=exportCar(project()).prefabs[0];
  const items=Array.from({length:4000},(_,i)=>({...base,category:`RCW|PropConfigs/${i}`}));
  assert.equal(decodeNative(encodeNative(items)).length,items.length);
});
test('deleted props are preserved by default and removed only when selected',()=>{
  const p=project(),out=exportCar(p);out.prefabs=out.prefabs.slice(0,1);const file=nativeFile(out);
  const safe=importEdits(p,file);assert.equal(safe.car.PropConfigs.length,2);assert.equal(safe.missing,1);
  const removed=importEdits(p,file,{removeMissing:true});assert.equal(removed.car.PropConfigs.length,1);assert.equal(removed.removed,1);
});
test('reordered tagged repeated assets retain their own metadata',()=>{
  const p=project(),out=exportCar(p);out.prefabs.reverse();out.prefabs[1].position.x=100;
  const result=importEdits(p,nativeFile(out));
  assert.equal(result.car.PropConfigs[0].Location.x,100);assert.equal(Number(result.car.PropConfigs[0].PartType),22);
});
test('untagged CopyPaste matches repeated assets by position and keeps missing scale',()=>{
  const p=project();p.car.PropConfigs[0].Scale={x:.5,y:2,z:1};
  const cp=exportCar(p).copyPaste;
  cp.entities.reverse();cp.entities.forEach((e:any)=>{delete e._rustcarKey;delete e.scale;});
  const result=importEdits(p,cp);assert.equal(Number(result.car.PropConfigs[0].PartType),22);
  assert.equal(toJson(result.car.PropConfigs[0].Scale),toJson(p.car.PropConfigs[0].Scale));
  assert.ok(result.warnings.some(w=>w.includes('matched by asset')));
});
test('new native assets require a path map and never silently drop',()=>{
  const p=project(),out=exportCar(p),newPath='assets/test/new.prefab';
  out.prefabs.push({...out.prefabs[0],id:prefabId(newPath),category:'Decor',path:newPath,position:{x:8,y:0,z:0}});
  const file=nativeFile(out);
  assert.throws(()=>importEdits(p,file),/Unknown prefab IDs/);
  const result=importEdits(p,file,{assets:assetMapFromText(`${prefabId(newPath)} - ${newPath}`)});
  assert.equal(result.added,1);assert.equal(result.car.PropConfigs[2].PrefabPath,newPath);
});
test('CopyPaste root rotations use radians, children use degrees',()=>{
  const result=decodeCopyPaste({entities:[{prefabname:path,pos:zero(),rot:{x:0,y:Math.PI/2,z:0},children:[{prefabname:path,pos:{x:0,y:0,z:1},rot:{x:0,y:90,z:0}}]}]});
  assert.equal(result[0].rotation.y,90);assert.ok(distance(result[1].position,{x:1,y:0,z:0})<1e-10);
  assert.ok(Math.abs(result[1].rotation.y-180)<1e-10);
});
test('Unity ZXY Euler decomposition handles compound rotations and gimbal lock',()=>{
  for(const v of [{x:45,y:35,z:12},{x:90,y:80,z:30},{x:270,y:180,z:30},{x:355,y:120,z:275}]) {
    const before=rotate(quaternion(v),{x:1,y:2,z:3});const after=rotate(quaternion(euler(quaternion(v))),{x:1,y:2,z:3});
    assert.ok(distance(before,after)<1e-6);
  }
});
test('nested props flatten and return in parent local space',()=>{
  const p=project();p.car.PropConfigs=[prop(1,{Rotation:{x:0,y:90,z:0},Scale:{x:2,y:2,z:2},SubPropConfigs:[prop(0,{Location:{x:0,y:0,z:1}})]})];
  const out=exportCar(p);assert.ok(distance(out.prefabs[1].position,{x:3,y:0,z:0})<1e-10);
  out.prefabs[1].position.x=5;
  const result=importEdits(p,nativeFile(out));assert.ok(distance(result.car.PropConfigs[0].SubPropConfigs[0].Location,{x:0,y:0,z:2})<1e-5);
});
test('gibs and item roots are kept; wheel visual children are editable',()=>{
  const p=project();p.car.PropConfigs.push(prop(0,{GibName:'specific-mesh'}));
  p.car.WheelColliders=[{Radius:0.4,PropConfig:prop(0,{PrefabPath:null,ItemId:-42,SubPropConfigs:[prop(2)]})}];
  const out=exportCar(p);assert.equal(out.prefabs.length,3);assert.equal(out.refs.filter(r=>!r.editable).length,2);
  const result=importEdits(p,nativeFile(out));assert.equal(toJson(result.car.WheelColliders),toJson(p.car.WheelColliders));
  assert.equal(result.car.PropConfigs[2].GibName,'specific-mesh');
});
test('LZ4 block decoder handles overlapping matches and rejects malformed input',()=>{
  assert.deepEqual([...decodeLz4Block(Uint8Array.of(0x10,65,1,0),5)],[65,65,65,65,65]);
  assert.throws(()=>decodeLz4Block(Uint8Array.of(0x10,65,0,0),5),/Invalid LZ4 match/);
  assert.throws(()=>decodeNative(new Uint8Array(10)),/Unsupported RustEdit/);
  assert.throws(()=>decodeLz4Block(Uint8Array.of(0xff),20),/Truncated/);
});
test('invalid input and invalid asset maps fail with useful errors',()=>{
  assert.throws(()=>makeProject({entities:[]},'wrong.json'),/PropConfigs/);
  assert.throws(()=>readJson('{'),/Invalid JSON/);
  assert.throws(()=>assetMapFromText('123 - assets/wrong.prefab'),/does not match/);
  assert.throws(()=>exportCar(makeProject({PropConfigs:[prop(0,{Location:{x:'NaN',y:0,z:0}})]},'bad')),/invalid x/);
});

test('fixture independently compressed by installed RustEdit LZ4.dll',()=>{
  // Synthetic two-box fixture, produced by the installed lz4net reference codec.
  const bytes=new Uint8Array(Buffer.from('AQAAAAGcAVHwFBpMChFSQ1d8UHJvcENvbmZpZ3MvMBCi06ToBRoPDQAAAAAVBQAQHQUAHCIRABAqEQAwgD8VBQAQHQUAD04AARcxTgAvQEBOABRQHQAAgD8=','base64'));
  const prefabs=decodeNative(bytes);
  assert.equal(prefabs.length,2);
  assert.equal(prefabs[0].id,prefabId(path));
  assert.deepEqual(prefabs[0].position,zero());
  assert.deepEqual(prefabs[1].position,{x:3,y:0,z:0});
  assert.deepEqual(prefabs[1].scale,one());
});
