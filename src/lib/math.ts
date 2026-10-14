export type Vec = { x: number; y: number; z: number };
export type Quat = [number, number, number, number];
export const zero = (): Vec => ({ x: 0, y: 0, z: 0 });
export const one = (): Vec => ({ x: 1, y: 1, z: 1 });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul = (a: Vec, b: Vec): Vec => ({ x: a.x * b.x, y: a.y * b.y, z: a.z * b.z });
export const div = (a: Vec, b: Vec): Vec => {
  if (Object.values(b).some(n => Math.abs(n) < 1e-12)) throw new Error('A parent prop has zero scale; its children cannot be transformed.');
  return { x: a.x / b.x, y: a.y / b.y, z: a.z / b.z };
};
export const scale = (a: Vec, k: number): Vec => mul(a, { x: k, y: k, z: k });
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function qmul(a: Quat, b: Quat): Quat {
  const [x,y,z,w] = a, [X,Y,Z,W] = b;
  return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];
}
export const inverse = ([x,y,z,w]: Quat): Quat => [-x,-y,-z,w];
// Unity Quaternion.Euler applies Z, then X, then Y.
export function quaternion(v: Vec): Quat {
  const h = Math.PI / 360;
  const [sx,cx,sy,cy,sz,cz] = [Math.sin(v.x*h),Math.cos(v.x*h),Math.sin(v.y*h),Math.cos(v.y*h),Math.sin(v.z*h),Math.cos(v.z*h)];
  return [cy*sx*cz+sy*cx*sz,sy*cx*cz-cy*sx*sz,cy*cx*sz-sy*sx*cz,cy*cx*cz+sy*sx*sz];
}
export function rotate(q: Quat, v: Vec): Vec {
  const r = qmul(qmul(q,[v.x,v.y,v.z,0]),inverse(q));
  return { x:r[0], y:r[1], z:r[2] };
}
export function euler(q: Quat): Vec {
  const [x,y,z,w] = q;
  const m11=1-2*(y*y+z*z), m13=2*(x*z+y*w), m21=2*(x*y+z*w), m22=1-2*(x*x+z*z), m23=2*(y*z-x*w), m31=2*(x*z-y*w), m33=1-2*(x*x+y*y);
  const X=Math.asin(-Math.max(-1,Math.min(1,m23)));
  const Y=Math.abs(m23)<0.9999999?Math.atan2(m13,m33):Math.atan2(-m31,m11);
  const Z=Math.abs(m23)<0.9999999?Math.atan2(m21,m22):0;
  const deg=(r:number)=>(r*180/Math.PI+360)%360;
  return { x:deg(X),y:deg(Y),z:deg(Z) };
}
export type Transform = { position: Vec; rotation: Vec; scale: Vec };
export const identity = (): Transform => ({ position:zero(),rotation:zero(),scale:one() });
export function compose(parent: Transform, child: Transform): Transform {
  return { position:add(parent.position,rotate(quaternion(parent.rotation),mul(parent.scale,child.position))), rotation:euler(qmul(quaternion(parent.rotation),quaternion(child.rotation))),scale:mul(parent.scale,child.scale) };
}
export function relative(parent: Transform, world: Transform): Transform {
  const q=inverse(quaternion(parent.rotation));
  return { position:div(rotate(q,sub(world.position,parent.position)),parent.scale),rotation:euler(qmul(q,quaternion(world.rotation))),scale:div(world.scale,parent.scale) };
}
