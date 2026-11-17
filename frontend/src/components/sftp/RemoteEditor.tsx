import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Modal, errorText, useDialogs } from '../ui/Dialogs';
import { SFTPReadForEdit, SFTPWriteEdited } from '../../../wailsjs/go/main/App';

const CONFLICT = 'EDIT_CONFLICT';

interface Props {
  connectionId: string;
  path: string;
  onClose: () => void;
}

/** Plain-text editor for a file on the server (opened with F4 in the SFTP panel). */
export function RemoteEditor({ connectionId, path, onClose }: Props) {
  const dialogs = useDialogs();
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState(''); // what is on the server, as shown here
  const [version, setVersion] = useState('');
  const [crlf, setCrlf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== null && text !== saved;

  useEffect(() => {
    let cancelled = false;
    SFTPReadForEdit(connectionId, path)
      .then((f) => {
        if (cancelled) return;
        // Browsers keep \n only inside a textarea; the original line endings
        // are put back on save.
        const eol = f.content.includes('\r\n');
        const shown = f.content.replace(/\r\n/g, '\n');
        setCrlf(eol);
        setText(shown);
        setSaved(shown);
        setVersion(f.version);
      })
      .catch((e) => !cancelled && setError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, [connectionId, path]);

  useEffect(() => {
    if (text !== null) areaRef.current?.focus();
  }, [text === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Closing with unsaved changes (Esc, backdrop click) must never lose them silently.
  const tryClose = async () => {
    if (dirty && !(await dialogs.confirm({ title: 'Discard changes?', message: `${path} has unsaved changes.`, confirmLabel: 'Discard', danger: true, focusCancel: true }))) return;
    onClose();
  };
  const closeRef = useRef(tryClose);
  closeRef.current = tryClose;

  // The browser's own "leave page" prompt guards a window close.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const save = async (force = false) => {
    if (text === null || saving) return;
    setSaving(true);
    try {
      const out = crlf ? text.replace(/\n/g, '\r\n') : text;
      const v = await SFTPWriteEdited(connectionId, path, out, version, force);
      setVersion(v);
      setSaved(text);
      dialogs.toast('Saved.', 'success');
    } catch (e) {
      const msg = errorText(e);
      if (msg.includes(CONFLICT)) {
        const ok = await dialogs.confirm({
          title: 'The file changed on the server',
          message: 'Someone or something modified it after you opened it. Overwrite it with your version?',
          confirmLabel: 'Overwrite',
          danger: true,
          focusCancel: true,
        });
        if (ok) {
          setSaving(false);
          return save(true);
        }
      } else {
        dialogs.toast(msg, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && e.code === 'KeyS') {
      e.preventDefault();
      e.stopPropagation();
      void save();
      return;
    }
    if (e.key === 'Tab' && !mod && !e.altKey) {
      // Insert a tab instead of moving focus; keep the undo stack when possible.
      e.preventDefault();
      if (!document.execCommand('insertText', false, '\t')) {
        const t = e.currentTarget;
        const { selectionStart: s, selectionEnd: en } = t;
        setText(t.value.slice(0, s) + '\t' + t.value.slice(en));
        requestAnimationFrame(() => t.setSelectionRange(s + 1, s + 1));
      }
    }
  };

  const updateCursor = () => {
    const t = areaRef.current;
    if (!t) return;
    const before = t.value.slice(0, t.selectionStart);
    const line = before.split('\n').length;
    setCursor({ line, col: before.length - before.lastIndexOf('\n') });
  };

  const lines = useMemo(() => (text === null ? 0 : text.split('\n').length), [text]);

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          {path.split('/').pop()}
          {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved changes" />}
        </span>
      }
      subtitle={<span className="font-mono">{path}</span>}
      onClose={() => void closeRef.current()}
      width="max-w-5xl"
    >
      <div className="px-5 pb-5">
        {error ? (
          <p className="py-8 text-center text-[12.5px] text-red-300">{error}</p>
        ) : text === null ? (
          <div className="py-10 flex justify-center text-gray-500">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : (
          <>
            <textarea
              ref={areaRef}
              className="w-full h-[58vh] resize-none rounded-xl bg-black/30 border border-white/[0.05] p-3 font-mono text-[12.5px] leading-relaxed text-gray-200 outline-none focus:border-accent/40 whitespace-pre overflow-auto"
              value={text}
              spellCheck={false}
              wrap="off"
              onChange={(e) => {
                setText(e.target.value);
                updateCursor();
              }}
              onKeyDown={onKeyDown}
              onKeyUp={updateCursor}
              onClick={updateCursor}
            />
            <div className="mt-3 flex items-center gap-3">
              <span className="font-mono text-2xs text-gray-500 tabular-nums">
                Ln {cursor.line}, Col {cursor.col} · {lines} lines · {crlf ? 'CRLF' : 'LF'}
              </span>
              <div className="flex-1" />
              <button className="btn-ghost h-8 px-3" onClick={() => void closeRef.current()}>
                Close
              </button>
              <button className="btn-primary inline-flex items-center gap-1.5" disabled={!dirty || saving} onClick={() => void save()}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
