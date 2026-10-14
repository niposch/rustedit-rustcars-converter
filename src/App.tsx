import { useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Box, Check, ChevronDown, CircleHelp, FileJson2, FileUp, FolderOpen, MoveUpRight, RotateCcw, X } from 'lucide-react';
import { Button } from './components/ui/button';
import { JsonSource } from './components/JsonSource';
import { LayoutPreview } from './components/LayoutPreview';
import { assetFileFromText, decodeCopyPaste, exportCar, importEdits, makeProject, nativeFile, readJson, toJson, type JsonObject, type Project } from './lib/converter';
import { decodeNative } from './lib/prefab';

function download(name:string,data:string|Uint8Array) {
  const blob=new Blob([typeof data==='string'?data:new Uint8Array(data)],{type:typeof data==='string'?'application/json':'application/octet-stream'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Upload({title,subtitle,accept,onFile,fileName,onClear,compact=false}:{title:string;subtitle:string;accept:string;onFile:(f:File)=>void;fileName?:string;onClear?:()=>void;compact?:boolean}) {
  const input=useRef<HTMLInputElement>(null),[drag,setDrag]=useState(false);
  return <div className={`upload-wrap ${compact?'compact':''}`}>
    <input ref={input} type="file" accept={accept} className="sr-only" aria-label={title} onChange={e=>{if(e.target.files?.[0])onFile(e.target.files[0]);e.target.value='';}}/>
    <button className={`upload ${drag?'dragging':''} ${fileName?'has-file':''}`} onClick={()=>input.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(e.dataTransfer.files[0])onFile(e.dataTransfer.files[0]);}}>
      <span className="upload-icon">{fileName?<FileJson2 size={25}/>:<FileUp size={25}/>}</span>
      <strong>{fileName||title}</strong><span>{fileName?'Click to replace':subtitle}</span>
      {!fileName&&<span className="browse-label">Browse files <ArrowRight size={14}/></span>}
      {fileName&&<span className="file-ready"><Check size={12}/> Loaded</span>}
    </button>
    {fileName&&onClear&&<button className="clear-file" aria-label={`Remove ${fileName}`} onClick={onClear}><X size={14}/></button>}
  </div>;
}
function App() {
  const [mode,setMode]=useState<'out'|'back'>('out'),[project,setProject]=useState<Project|null>(null),[originalName,setOriginalName]=useState('');
  const [edited,setEdited]=useState<Uint8Array|JsonObject|null>(null),[editedName,setEditedName]=useState(''),[assets,setAssets]=useState<Map<number,string>>(new Map());
  const [entityPaths,setEntityPaths]=useState<Set<string>|undefined>();
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[removeMissing,setRemoveMissing]=useState(false),[guide,setGuide]=useState(false),[format,setFormat]=useState<'native'|'json'>('native'),[downloaded,setDownloaded]=useState(false);
  const exported=useMemo(()=>{if(!project)return null;try{return exportCar(project);}catch{return null;}},[project]);
  const result=useMemo(()=>{
    if(!project||!edited)return {data:null,error:''};
    try{return {data:importEdits(project,edited,{assets,entityPaths,removeMissing}),error:''};}catch(e){return {data:null,error:e instanceof Error?e.message:'Conversion failed.'};}
  },[project,edited,assets,entityPaths,removeMissing]);
  function loadJson(text:string,name:string,kind:'original'|'edited') {
    const data=readJson(text);
    if(kind==='original') {
      const p=makeProject(data,name);
      exportCar(p);
      setProject(p);setOriginalName(name);setEdited(null);setEditedName('');
    } else {
      decodeCopyPaste(data);
      if(!project&&data._rustcarWorkshop) {
        const p=makeProject(data._rustcarWorkshop,name);
        exportCar(p);setProject(p);setOriginalName(`${p.filename}.json (embedded)`);
      }
      setEdited(data);setEditedName(name);
    }
    setError('');setDownloaded(false);
  }
  const onFile=async(file:File,kind:'original'|'edited'|'assets')=>{
    setError('');setBusy(true);setDownloaded(false);
    try{
      if(file.size>64*1024*1024)throw new Error('Please choose a file smaller than 64 MB.');
      if(kind==='assets') {const catalog=assetFileFromText(await file.text());setAssets(catalog.paths);setEntityPaths(catalog.entityPaths);}
      else if(kind==='edited'&&file.name.toLowerCase().endsWith('.prefab')) {
        const data=new Uint8Array(await file.arrayBuffer());
        decodeNative(data);setEdited(data);setEditedName(file.name);
      } else loadJson(await file.text(),file.name,kind);
    }catch(e){setError(e instanceof Error?e.message:'Could not read file.');}finally{setBusy(false);}
  };
  const reset=()=>{setProject(null);setOriginalName('');setEdited(null);setEditedName('');setError('');setDownloaded(false);setRemoveMissing(false);setAssets(new Map());setEntityPaths(undefined);};
  const warnings=mode==='out'?exported?.warnings:result.data?.warnings;
  const preview=mode==='out'?exported?.prefabs:result.data?.prefabs;
  const ready=mode==='out'?!!exported:!!result.data;
  function convert(){
    try{if(mode==='out'&&exported)download(`${project!.filename}${format==='native'?'.prefab':'.copypaste.json'}`,format==='native'?nativeFile(exported):toJson(exported.copyPaste));
      else if(result.data)download(`${project!.filename}.json`,toJson(result.data.car));setDownloaded(true);
    }catch(e){setError(e instanceof Error?e.message:'Download failed.');}
  }
  return <div className="app-shell">
    <header className="header"><div className="header-branding"><a className="homepage-brand" href="https://niposch.de/" aria-label="niposch homepage">niposch<span aria-hidden="true">.</span></a><span className="brand-divider" aria-hidden="true"/><a className="brand" href="#" aria-label="RustCar converter home"><h1 className="brand-title">RustCar <span className="brand-light">converter</span></h1></a></div><div className="header-actions"><button className={`help-button ${guide?'active':''}`} onClick={()=>setGuide(!guide)} aria-expanded={guide}><CircleHelp size={17}/> Quick guide</button></div></header>
    <main>
      {guide&&<aside className="guide"><button aria-label="Close guide" onClick={()=>setGuide(false)}><X size={16}/></button><strong>The round trip</strong><ol><li>Load your car. Download <b>.prefab</b> to keep scale, or import the CopyPaste JSON in RustEdit.</li><li>Edit the props in RustEdit and save the car selection as a custom <b>.prefab</b>. Include the spawn-point origin marker; leave it in place relative to the car.</li><li>Switch to <b>Back to RustCar</b>, load the edited prefab, and download your updated car.</li></ol><p>Keep the original JSON or save a project before closing this tab. Item and gib roots remain in the original; wheel visuals are included where possible.</p></aside>}
      <div className="workspace-heading"><div className="tabs" role="tablist" aria-label="Conversion direction"><button role="tab" aria-selected={mode==='out'} aria-controls="converter-panel" id="out-tab" onClick={()=>{setMode('out');setDownloaded(false);}} onKeyDown={e=>{if(e.key==='ArrowRight'){setMode('back');document.getElementById('back-tab')?.focus();}}}><Box size={16}/> To RustEdit <ArrowRight size={14}/></button><button role="tab" aria-selected={mode==='back'} aria-controls="converter-panel" id="back-tab" onClick={()=>{setMode('back');setDownloaded(false);}} onKeyDown={e=>{if(e.key==='ArrowLeft'){setMode('out');document.getElementById('out-tab')?.focus();}}}><RotateCcw size={15}/> Back to RustCar</button></div><Button variant="ghost" size="sm" onClick={reset} disabled={!project&&!edited}><RotateCcw size={13}/> Reset</Button></div>
      <aside className="prefab-help" aria-labelledby="prefab-help-title">
        <h2 id="prefab-help-title">Supported prefabs</h2>
        <p>New props must be server entity prefabs with a <code>BaseEntity</code> component. Duplicate an entity already used by your original car, or choose one listed in a <a href="https://github.com/niposch/rustedit-rustcars-converter#new-props" target="_blank" rel="noreferrer">server catalog</a>. Mesh-only scenery, such as the static metal wheel, is unsupported.</p>
        <p>Existing parts keep their RustCar settings. New props are decorative; seats, engines and wheel physics need separate configuration. <code>stringpool.txt</code> only resolves paths. A catalog checks entity support, not a full vehicle spawn.</p>
      </aside>
      <section className="workspace" id="converter-panel" role="tabpanel" aria-labelledby={mode==='out'?'out-tab':'back-tab'} aria-busy={busy}>
        <div className="source-pane"><div className="section-heading"><span className="step">01</span><h2>Original car</h2><span className="file-type">.JSON</span></div>
          <JsonSource label="Original car" placeholder={'Paste your RustCar JSON here…\n\n{\n  "PropConfigs": […]\n}'} defaultName="pasted-car" sourceName={originalName} onJson={(text,name)=>loadJson(text,name,'original')}>
            <Upload title="Open car JSON" subtitle="RustCar JSON or a saved project" accept=".json" onFile={f=>void onFile(f,'original')} fileName={originalName} onClear={reset} compact={mode==='back'}/>
          </JsonSource>
          {mode==='back'?<><div className="section-heading second-step"><span className="step">02</span><h2>Edited geometry</h2></div>
            <JsonSource label="Edited geometry" placeholder={'Paste your CopyPaste JSON here…\n\n{\n  "entities": […]\n}'} defaultName="pasted-geometry" sourceName={editedName} onJson={(text,name)=>loadJson(text,name,'edited')}>
              <Upload compact title="Open RustEdit export" subtitle=".prefab or CopyPaste .json" accept=".prefab,.json" onFile={f=>void onFile(f,'edited')} fileName={editedName} onClear={()=>{setEdited(null);setEditedName('');setError('');}}/>
            </JsonSource>
            <label className="checkbox-option"><input type="checkbox" checked={removeMissing} onChange={e=>setRemoveMissing(e.target.checked)}/><span>Remove missing props<small>Props absent from the edited file will be deleted.</small></span></label>
            <details className="asset-details" open={!!result.error}><summary>Asset paths {assets.size>0&&<span>{assets.size} {entityPaths?'entities':'paths'}</span>}<ChevronDown size={13}/></summary><p>stringpool.txt resolves IDs. New props need a <a href="https://github.com/niposch/rustedit-rustcars-converter#new-props" target="_blank" rel="noreferrer">server catalog</a>.</p><label className="asset-upload"><FolderOpen size={14}/> Load asset map or catalog<input className="sr-only" type="file" accept=".txt,.json" onChange={e=>{if(e.target.files?.[0])void onFile(e.target.files[0],'assets');e.target.value='';}}/></label></details>
          </>:null}
          {project&&<button className="save-project" onClick={()=>download(`${project.filename}.rustcar-project.json`,toJson(project))}><ArrowDownToLine size={14}/> Save project</button>}
        </div>
        <div className="output-pane"><div className="section-heading"><span className="step">{mode==='out'?'02':'03'}</span><h2>{mode==='out'?'Export':'RustCar export'}</h2><span className={`ready-label ${ready?'is-ready':''}`}><span className="status-dot"/>{ready?'Ready':'Awaiting files'}</span></div>
          <LayoutPreview prefabs={preview||[]}/>
          <div className="stats"><div><strong>{preview?.length??'—'}</strong><span>{mode==='out'?'Editable props':'Imported props'}</span></div><div><strong>{mode==='out'?(exported?new Set(exported.prefabs.map(p=>p.id)).size:'—'):(result.data?.matched??'—')}</strong><span>{mode==='out'?'Unique assets':'Updated'}</span></div><div><strong>{mode==='out'?(exported?exported.refs.filter(r=>!r.editable).length:'—'):(result.data?.added??'—')}</strong><span>{mode==='out'?'Preserved props':'Added'}</span></div></div>
          {mode==='out'?<div className="format-options"><button className={format==='native'?'selected':''} aria-pressed={format==='native'} onClick={()=>setFormat('native')}><span className="radio-dot"/><span>RustEdit prefab<small>Preserves scale</small></span><span className="recommended">RECOMMENDED</span></button><button className={format==='json'?'selected':''} aria-pressed={format==='json'} onClick={()=>setFormat('json')}><span className="radio-dot"/><span>CopyPaste JSON<small>RustEdit import</small></span><FileJson2 size={17}/></button></div>:null}
          {(error||(mode==='back'&&result.error))&&<div className="error" role="alert">{error||result.error}</div>}
          <Button className="download-button" disabled={!ready||busy} onClick={convert}>{downloaded?<Check size={17}/>:<ArrowDownToLine size={17}/>} {busy?'Reading file…':downloaded?'Downloaded':mode==='out'?`Download ${format==='native'?'.prefab':'CopyPaste JSON'}`:'Download RustCar JSON'} <ArrowRight size={17}/></Button>
          <p className="download-caption">{mode==='out'?'Keep the included origin marker with your car.':result.data?`${result.data.removed} removed · ${result.data.missing-result.data.removed} missing props preserved`:'Load the original and your edited prefab'}</p>
        </div>
      </section>
      {warnings&&warnings.length>0&&<details className="conversion-notes"><summary>Conversion notes <span>{warnings.length}</span><ChevronDown size={14}/></summary><ul>{warnings.map(w=><li key={w}>{w}</li>)}</ul></details>}
      <footer><a href="https://karuza.dev/store/product/566c04c2-c4a7-4ba3-983c-3fdb362424f9" target="_blank" rel="noreferrer">RustCar <MoveUpRight size={11}/></a><a href="https://www.rustedit.io/" target="_blank" rel="noreferrer">RustEdit <MoveUpRight size={11}/></a><a href="https://github.com/niposch/rustedit-rustcars-converter" target="_blank" rel="noreferrer">GitHub <MoveUpRight size={11}/></a></footer>
    </main>
  </div>;
}
export default App;
