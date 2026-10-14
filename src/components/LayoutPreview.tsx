import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import type { Prefab } from '../lib/prefab';
import type { Vec } from '../lib/math';

type Camera = { yaw: number; pitch: number; zoom: number; panX: number; panY: number };
type Point = { x: number; y: number };
const ISO: Camera = { yaw: Math.PI / 4, pitch: Math.PI / 7, zoom: 1, panX: 0, panY: 0 };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const zoom = (camera: Camera, factor: number) => ({ ...camera, zoom: clamp(camera.zoom * factor, .15, 12) });

export function LayoutPreview({ prefabs }: { prefabs: Prefab[] }) {
  const [camera, setCamera] = useState<Camera>(ISO);
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, Point>());

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      setCamera(current => zoom(current, Math.exp(-clamp(delta, -400, 400) * .002)));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  const scene = useMemo(() => {
    const sorted = prefabs.map(p => Math.hypot(p.position.x, p.position.y, p.position.z)).sort((a, b) => a - b);
    const threshold = Math.max(3, (sorted[Math.floor((sorted.length - 1) * .8)] || 0) * 8);
    const visible = prefabs.filter(p => Math.hypot(p.position.x, p.position.y, p.position.z) <= threshold);
    const bounds = visible.length ? visible.map(p => p.position) : [{ x: -1, y: 0, z: -1 }, { x: 1, y: 1, z: 1 }];
    const extent = (axis: keyof Vec) => bounds.reduce(([min, max], p) => [Math.min(min, p[axis]), Math.max(max, p[axis])], [Infinity, -Infinity]);
    const [minX, maxX] = extent('x'), [minY, maxY] = extent('y'), [minZ, maxZ] = extent('z');
    return {
      visible,
      distant: prefabs.length - visible.length,
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
      radius: Math.max(.7, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2),
      floor: minY,
    };
  }, [prefabs]);

  const factor = 91 / scene.radius * camera.zoom;
  function project(p: Vec, centered = true) {
    const x = p.x - (centered ? scene.center.x : 0);
    const y = p.y - (centered ? scene.center.y : 0);
    const z = p.z - (centered ? scene.center.z : 0);
    const horizontal = Math.cos(camera.yaw) * x - Math.sin(camera.yaw) * z;
    const depth = Math.sin(camera.yaw) * x + Math.cos(camera.yaw) * z;
    return {
      x: 250 + camera.panX + horizontal * factor,
      y: 150 + camera.panY + (Math.sin(camera.pitch) * depth - Math.cos(camera.pitch) * y) * factor,
      depth: Math.cos(camera.pitch) * depth + Math.sin(camera.pitch) * y,
    };
  }
  const line = (a: Vec, b: Vec) => { const start = project(a), end = project(b); return `M${start.x} ${start.y}L${end.x} ${end.y}`; };
  const gridStep = 10 ** Math.floor(Math.log10(scene.radius / 2));
  const gridHalf = gridStep * 12;
  const gridCenter = { x: Math.round(scene.center.x / gridStep) * gridStep, y: scene.floor, z: Math.round(scene.center.z / gridStep) * gridStep };
  const grid = Array.from({ length: 25 }, (_, i) => (i - 12) * gridStep).flatMap(offset => [
    line({ x: gridCenter.x + offset, y: gridCenter.y, z: gridCenter.z - gridHalf }, { x: gridCenter.x + offset, y: gridCenter.y, z: gridCenter.z + gridHalf }),
    line({ x: gridCenter.x - gridHalf, y: gridCenter.y, z: gridCenter.z + offset }, { x: gridCenter.x + gridHalf, y: gridCenter.y, z: gridCenter.z + offset }),
  ]);
  const points = scene.visible.map(p => ({ ...project(p.position), p })).sort((a, b) => a.depth - b.depth);
  const cubeCorners = [[-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1], [-1,-1,1], [1,-1,1], [1,1,1], [-1,1,1]];
  const cubeFaces = [[0,1,2,3], [4,5,6,7], [0,4,7,3], [1,5,6,2], [0,1,5,4], [3,2,6,7]];
  const cube = (p: Vec, size: number) => {
    const corners = cubeCorners.map(([x,y,z]) => project({ x: p.x + x * size, y: p.y + y * size, z: p.z + z * size }));
    return cubeFaces.map(face => ({ points: face.map(i => `${corners[i].x},${corners[i].y}`).join(' '), depth: face.reduce((sum, i) => sum + corners[i].depth, 0) / 4 })).sort((a,b) => a.depth - b.depth);
  };
  function point(event: PointerEvent<SVGSVGElement>): Point { return { x: event.clientX, y: event.clientY }; }
  function release(event: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const old = pointers.current.get(event.pointerId);
    if (!old) return;
    const previous = [...pointers.current.values()];
    pointers.current.set(event.pointerId, point(event));
    const current = [...pointers.current.values()];
    const rect = event.currentTarget.getBoundingClientRect();
    // SVG's meet scaling uses the smaller viewport dimension.
    const pixelScale = Math.min(rect.width / 500, rect.height / 300);
    if (previous.length === 2 && current.length === 2) {
      const separation = (points: Point[]) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const before = separation(previous), after = separation(current);
      setCamera(camera => ({ ...zoom(camera, before > 1 ? after / before : 1),
        panX: camera.panX + (current[0].x + current[1].x - previous[0].x - previous[1].x) / (2 * pixelScale),
        panY: camera.panY + (current[0].y + current[1].y - previous[0].y - previous[1].y) / (2 * pixelScale),
      }));
    } else if (previous.length === 1) {
      const dx = event.clientX - old.x, dy = event.clientY - old.y;
      const pan = event.shiftKey || (event.buttons & 6) !== 0;
      setCamera(camera => pan ? { ...camera, panX: camera.panX + dx / pixelScale, panY: camera.panY + dy / pixelScale }
        : { ...camera, yaw: camera.yaw - dx * .009, pitch: clamp(camera.pitch + dy * .009, -Math.PI / 2, Math.PI / 2) });
    }
  }
  const isIso = camera.yaw === ISO.yaw && camera.pitch === ISO.pitch;
  const isTop = camera.yaw === 0 && camera.pitch === Math.PI / 2;
  const axes = [{ label: 'X', color: '#a55b42', end: { x: 1, y: 0, z: 0 } }, { label: 'Y', color: '#758579', end: { x: 0, y: 1, z: 0 } }, { label: 'Z', color: '#567d76', end: { x: 0, y: 0, z: 1 } }];

  return <div className="viewport interactive-viewport">
    <div className="viewport-toolbar"><span><span className="status-dot"/> PROP LAYOUT</span><div className="view-switch">
      <button aria-pressed={isIso} onClick={() => setCamera(ISO)}>Iso</button>
      <button aria-pressed={isTop} onClick={() => setCamera({ ...ISO, yaw: 0, pitch: Math.PI / 2 })}>Top</button>
      <button aria-label="Reset 3D view" title="Reset view" onClick={() => setCamera(ISO)}><RotateCcw size={11}/></button>
    </div></div>
    <svg ref={svg} viewBox="0 0 500 300" role="img" tabIndex={0}
      aria-label={prefabs.length ? `Interactive 3D layout of ${prefabs.length} prop origins` : 'Interactive empty 3D prop layout'}
      aria-describedby="orbit-help"
      onContextMenu={event => event.preventDefault()}
      onPointerDown={event => { event.preventDefault(); event.currentTarget.focus(); pointers.current.set(event.pointerId, point(event)); event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={event => pointers.current.delete(event.pointerId)}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Home') { setCamera(ISO); return; }
        if (['+', '=', '-'].includes(event.key)) { setCamera(camera => zoom(camera, event.key === '-' ? 1 / 1.2 : 1.2)); return; }
        const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
        const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
        setCamera(camera => event.shiftKey ? { ...camera, panX: camera.panX + dx * 12, panY: camera.panY + dy * 12 }
          : { ...camera, yaw: camera.yaw + dx * .12, pitch: clamp(camera.pitch + dy * .12, -Math.PI / 2, Math.PI / 2) });
      }}>
      <g className="scene-grid" stroke="#d8ded6" strokeWidth=".7" fill="none" opacity=".7">{grid.map((path, i) => <path key={i} d={path}/>)}</g>
      {!prefabs.length && <g className="empty-scene" stroke="#91a49a" strokeWidth="1.1" fill="none" opacity=".6">{cube(scene.center, .6).map((face, i) => <polygon key={i} points={face.points}/>)}</g>}
      <g className="prop-points">{points.map(({p}, i) => <g key={i}><title>{p.path || p.id} · {p.position.x.toFixed(3)}, {p.position.y.toFixed(3)}, {p.position.z.toFixed(3)}</title>
        {cube(p.position, scene.radius * .023).map((face, j) => <polygon key={j} points={face.points} fill={p.category.includes('WheelColliders') ? '#537f78' : '#b86243'} fillOpacity=".6" stroke="white" strokeWidth=".6"/>)}
      </g>)}</g>
      <g transform="translate(38 249)" fontSize="10" fontFamily="monospace">{axes.map(axis => {
        const end = project(axis.end, false), origin = project({x:0,y:0,z:0}, false);
        const x = (end.x - origin.x) / factor * 23, y = (end.y - origin.y) / factor * 23;
        return <g key={axis.label}><path d={`M0 0L${x} ${y}`} stroke={axis.color}/><text x={x + (x < 0 ? -10 : 4)} y={y + 3} fill={axis.color}>{axis.label}</text></g>;
      })}</g>
    </svg>
    <div className="viewport-zoom"><button aria-label="Zoom in" onClick={() => setCamera(camera => zoom(camera, 1.25))}><Plus size={13}/></button><button aria-label="Zoom out" onClick={() => setCamera(camera => zoom(camera, .8))}><Minus size={13}/></button></div>
    <div className="viewport-bottom"><span>{prefabs.length ? `${prefabs.length} prop origins · no game meshes` : 'Your prop layout appears here'}</span><span>{scene.distant ? `${scene.distant} distant hidden` : 'LOCAL SPACE'}</span></div>
    <span id="orbit-help" className="sr-only">Drag to orbit. Shift-drag or right-drag to pan. Scroll or pinch to zoom. Arrow keys orbit, Shift and arrow keys pan, plus and minus zoom, Home resets.</span>
    <span className="orbit-hint" aria-hidden="true">Drag to orbit · Shift-drag to pan · Scroll to zoom</span>
  </div>;
}
