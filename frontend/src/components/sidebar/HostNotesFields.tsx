import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

export interface NotesValue {
  tags: string[];
  notes: string;
}

/** "prod, web  #eu" → ["prod", "web", "eu"] */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,\s]+/)) {
    const t = raw.trim().replace(/^#/, '').toLowerCase();
    if (t && !out.includes(t)) out.push(t.slice(0, 40));
  }
  return out;
}

/** Collapsible "Notes and tags" section of the host dialogs. */
export function HostNotesFields({ value, onChange }: { value: NotesValue; onChange: (v: NotesValue) => void }) {
  const [open, setOpen] = useState(!!(value.notes.trim() || value.tags.length));
  const [tagText, setTagText] = useState(value.tags.join(', '));
  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-300 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        Notes and tags
        {(value.notes.trim() || value.tags.length > 0) && (
          <span className="ml-1 text-2xs text-accent truncate max-w-[220px]">{value.tags.map((t) => `#${t}`).join(' ') || 'note'}</span>
        )}
      </button>
      {open && (
        <div className="mt-3 space-y-3 pl-4 animate-fade-in">
          <div>
            <label className="label">Tags</label>
            <input
              className="input-field"
              value={tagText}
              placeholder="prod, web, eu"
              spellCheck={false}
              onChange={(e) => {
                setTagText(e.target.value);
                onChange({ ...value, tags: parseTags(e.target.value) });
              }}
            />
            <p className="mt-1.5 text-2xs text-gray-600">Separated by commas or spaces. Filter the sidebar with #tag.</p>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input-field min-h-[72px] py-2 resize-y"
              rows={3}
              maxLength={16000}
              value={value.notes}
              placeholder="What the machine is for, who owns it, things to know"
              onChange={(e) => onChange({ ...value, notes: e.target.value })}
            />
            <p className="mt-1.5 text-2xs text-gray-600">Shown when you hover the host in the sidebar, and found by its search.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export const sameNotes = (a: NotesValue, b: NotesValue) => a.notes === b.notes && a.tags.join(',') === b.tags.join(',');
