import { md5 } from '@noble/hashes/legacy.js';
import { one, zero, type Vec, type Transform } from './math';

export type Prefab = Transform & { id: number; category: string; path?: string; skin?: unknown; source?: unknown };
const MAX_BYTES=64*1024*1024;
export function prefabId(path: string): number {
  const hash=md5(new TextEncoder().encode(path.toLowerCase()));
  return new DataView(hash.buffer,hash.byteOffset,hash.byteLength).getUint32(0,true);
}
function varint(n: number): number[] {
  const out=[];
  do { const low=n%128; n=Math.floor(n/128); out.push(low+(n?128:0)); } while(n);
  return out;
}
class Reader {
  offset=0;
  constructor(readonly data:Uint8Array) {}
  get remaining() { return this.data.length-this.offset; }
  uint() {
    let n=0, k=1;
    for(let i=0;i<10;i++) { if(!this.remaining) throw new Error('Truncated prefab data.'); const b=this.data[this.offset++]; n+=(b&127)*k; if(!(b&128)) { if(!Number.isSafeInteger(n)) throw new Error('Invalid prefab integer.'); return n; } k*=128; }
    throw new Error('Invalid prefab integer.');
  }
  bytes(n:number) { if(n<0||n>this.remaining) throw new Error('Truncated prefab data.'); const out=this.data.subarray(this.offset,this.offset+n); this.offset+=n; return out; }
  field(wire:number):number|Uint8Array {
    if(wire===0) return this.uint();
    if(wire===2) return this.bytes(this.uint());
    if(wire===5) { const bytes=this.bytes(4); return new DataView(bytes.buffer,bytes.byteOffset,4).getFloat32(0,true); }
    if(wire===1) return this.bytes(8);
    throw new Error('Unsupported protobuf wire type.');
  }
}
function fields(bytes:Uint8Array) {
  const r=new Reader(bytes), out:Array<[number,number|Uint8Array]>=[];
  while(r.remaining) { const key=r.uint(); if(!key) throw new Error('Invalid protobuf field.'); out.push([key>>>3,r.field(key&7)]); }
  return out;
}
function vector(bytes:Uint8Array):Vec {
  const v=zero();
  for(const [key,value] of fields(bytes)) if(key>=1&&key<=3&&typeof value==='number') { if(!Number.isFinite(value)) throw new Error('Prefab contains a non-finite transform.'); v[(['x','y','z'] as const)[key-1]]=value; }
  return v;
}
function decodePrefab(bytes:Uint8Array):Prefab {
  const p:Prefab={id:0,category:'Decor',position:zero(),rotation:zero(),scale:one()};
  for(const [key,value] of fields(bytes)) {
    if(key===1&&value instanceof Uint8Array) p.category=new TextDecoder().decode(value);
    else if(key===2&&typeof value==='number') p.id=value;
    else if(key>=3&&key<=5&&value instanceof Uint8Array) p[(['position','rotation','scale'] as const)[key-3]]=vector(value);
  }
  if(!p.id) throw new Error('A prefab has no valid asset ID.');
  return p;
}
// RustEdit uses lz4net's chunked stream, not the modern LZ4 frame container.
export function decodeLz4Block(input:Uint8Array,size:number):Uint8Array {
  if(size>MAX_BYTES) throw new Error('Prefab exceeds the 64 MB decompressed limit.');
  const out=new Uint8Array(size); let i=0,o=0;
  const extra=(base:number)=>{ let n=base; if(base===15) { let b; do { if(i>=input.length) throw new Error('Truncated LZ4 length.'); b=input[i++]; n+=b; }while(b===255); } return n; };
  while(i<input.length) {
    const token=input[i++], literal=extra(token>>>4);
    if(i+literal>input.length||o+literal>size) throw new Error('Invalid LZ4 literals.');
    out.set(input.subarray(i,i+literal),o); i+=literal; o+=literal;
    if(i===input.length) break;
    if(i+2>input.length) throw new Error('Truncated LZ4 match.');
    const offset=input[i++]|(input[i++]<<8), length=extra(token&15)+4;
    if(offset===0||offset>o||o+length>size) throw new Error('Invalid LZ4 match.');
    for(let j=0;j<length;j++) { out[o]=out[o-offset]; o++; }
  }
  if(o!==size) throw new Error('LZ4 size mismatch.');
  return out;
}
export function decodeNative(bytes:Uint8Array):Prefab[] {
  if(bytes.length<6||new DataView(bytes.buffer,bytes.byteOffset,4).getUint32(0,true)!==1) throw new Error('Unsupported RustEdit prefab. Expected a version 1 .prefab file.');
  const r=new Reader(bytes.subarray(4)), chunks:Uint8Array[]=[]; let size=0;
  while(r.remaining) {
    const flags=r.uint(), raw=r.uint(), stored=flags&1?r.uint():raw;
    if(flags&~3) throw new Error('Unsupported LZ4 compression flags.');
    if(stored>raw||(size+=raw)>MAX_BYTES) throw new Error('Prefab exceeds the 64 MB limit or has invalid chunk lengths.');
    const chunk=r.bytes(stored); chunks.push(flags&1?decodeLz4Block(chunk,raw):chunk);
  }
  const data=new Uint8Array(size); let offset=0; for(const chunk of chunks) { data.set(chunk,offset);offset+=chunk.length; }
  const prefabs:Prefab[]=[];
  for(const [key,value] of fields(data)) {
    if(key===3&&value instanceof Uint8Array) prefabs.push(decodePrefab(value));
    // SerializedBlockList -> repeated BlockData -> prefabData.
    if(key===10&&value instanceof Uint8Array) for(const [bk,bv] of fields(value)) if(bk===1&&bv instanceof Uint8Array) for(const [pk,pv] of fields(bv)) if(pk===1&&pv instanceof Uint8Array) prefabs.push(decodePrefab(pv));
  }
  if(!prefabs.length) throw new Error('No editable prefabs found in this file.');
  return prefabs;
}
function fieldBytes(key:number,bytes:Uint8Array|number[]):number[] { return [...varint(key*8+2),...varint(bytes.length),...bytes]; }
function encodeVector(v:Vec):number[] {
  return (['x','y','z'] as const).flatMap((axis,i)=>{ const bytes=new Uint8Array(4); new DataView(bytes.buffer).setFloat32(0,v[axis],true);return [((i+1)*8+5),...bytes]; });
}
export function encodeNative(prefabs:Prefab[]):Uint8Array {
  if(!prefabs.length) throw new Error('There are no props to export.');
  const data:number[]=[];
  for(const p of prefabs) {
    const body=[...fieldBytes(1,new TextEncoder().encode(p.category)),...varint(16),...varint(p.id),...fieldBytes(3,encodeVector(p.position)),...fieldBytes(4,encodeVector(p.rotation)),...fieldBytes(5,encodeVector(p.scale))];
    data.push(...fieldBytes(3,body));
  }
  // An uncompressed LZ4Stream chunk is valid and avoids a runtime codec dependency.
  const header=Uint8Array.from([1,0,0,0,0,...varint(data.length)]);
  const output=new Uint8Array(header.length+data.length);
  output.set(header);output.set(data,header.length);
  return output;
}
