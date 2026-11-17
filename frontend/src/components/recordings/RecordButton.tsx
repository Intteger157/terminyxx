import { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import type { TerminalTab } from '../../types';
import { useDialogs } from '../ui/Dialogs';
import { IsRecording, StartRecording, StopRecording } from '../../../wailsjs/go/main/App';

/** Status bar: REC toggle for the active session, plus a way to the library. */
export function RecordButton({ tab, onOpenLibrary }: { tab: TerminalTab; onOpenLibrary: () => void }) {
  const dialogs = useDialogs();
  const [recording, setRecording] = useState(false);

  const refresh = useCallback(() => {
    IsRecording(tab.id)
      .then(setRecording)
      .catch(() => setRecording(false));
  }, [tab.id]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const toggle = async () => {
    try {
      if (recording) {
        await StopRecording(tab.id);
        dialogs.toast('Recording saved.', 'success');
      } else {
        const title = tab.profile ? `${tab.profile.username}@${tab.profile.host}` : tab.title;
        await StartRecording(tab.id, title);
      }
    } catch (e) {
      dialogs.toast(String(e).replace(/^Error: /, ''), 'error');
    }
    refresh();
  };

  return (
    <>
      <button
        className={`flex items-center gap-1 h-5 px-2 rounded-md transition-colors flex-shrink-0 ${recording ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25' : 'hover:bg-white/[0.06] hover:text-gray-300'}`}
        onClick={() => void toggle()}
        title={recording ? 'Stop recording this session' : 'Record this session (terminal output only, not keystrokes)'}
        aria-pressed={recording}
      >
        <span className={`w-2 h-2 rounded-full ${recording ? 'bg-red-400 animate-pulse' : 'bg-gray-500'}`} />
        {recording ? 'REC' : 'Rec'}
      </button>
      <button className="flex items-center h-5 px-1.5 rounded-md transition-colors hover:bg-white/[0.06] hover:text-gray-300 flex-shrink-0" onClick={onOpenLibrary} title="Session recordings">
        <History size={11} />
      </button>
    </>
  );
}
