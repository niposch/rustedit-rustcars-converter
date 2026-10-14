import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ClipboardPaste, FileUp } from 'lucide-react';
import { Button } from './ui/button';

type Props = {
  label: string;
  placeholder: string;
  defaultName: string;
  sourceName: string;
  onJson: (text: string, name: string) => void;
  children: ReactNode;
};

export function JsonSource({ label, placeholder, defaultName, sourceName, onJson, children }: Props) {
  const [method, setMethod] = useState<'file' | 'json'>('file');
  const [text, setText] = useState('');
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState('');
  const [appliedText, setAppliedText] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (method === 'json') textarea.current?.focus();
  }, [method]);

  function load() {
    try {
      onJson(text, `${name.trim() || defaultName}.json`);
      setAppliedText(text);
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not read JSON.');
    }
  }

  return <div className="json-source">
    <div className="input-method" role="group" aria-label={`${label} input method`}>
      <button aria-pressed={method === 'file'} onClick={() => setMethod('file')}><FileUp size={13}/> File</button>
      <button aria-pressed={method === 'json'} onClick={() => setMethod('json')}><ClipboardPaste size={13}/> Paste JSON</button>
    </div>
    {method === 'file' ? children : <div className="json-editor">
      <label className="json-name">Name <input aria-label={`${label} name`} value={name} onChange={event => setName(event.target.value)} placeholder={defaultName}/></label>
      <textarea ref={textarea} aria-label={`${label} JSON`} value={text} placeholder={placeholder}
        spellCheck={false} autoCapitalize="off" autoCorrect="off"
        onChange={event => { setText(event.target.value); setError(''); }}
        onKeyDown={event => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); load(); }
        }}/>
      {error && <div className="json-input-error" role="alert">{error}</div>}
      <div className="json-editor-actions">
        <span className="json-editor-status" aria-live="polite">{appliedText === text && sourceName ? <><Check size={12}/> Loaded</> : appliedText !== null && sourceName ? 'Changes not applied' : 'Ctrl + V to paste'}</span>
        <Button size="sm" variant="secondary" disabled={!text.trim()} onClick={load}>Load JSON</Button>
      </div>
    </div>}
  </div>;
}
