import { CheckCircle2, XCircle } from 'lucide-react';
import type { connection } from '../../../wailsjs/go/models';
import { Modal } from '../ui/Dialogs';

export function SSHDiagnosticChecks({ report }: { report: connection.SSHDiagnostic }) {
  return (
    <ol className="divide-y divide-white/[0.07] rounded-lg border border-white/[0.07] px-3 text-xs text-gray-300">
      {report.checks.map((check, index) => (
        <li key={index} className="flex items-start gap-2 py-2">
          {check.failure ? (
            <XCircle size={14} className="mt-0.5 shrink-0 text-red-400" aria-label="Failed" />
          ) : (
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" aria-label="Passed" />
          )}
          <div className="min-w-0">
            <p>{check.stage}</p>
            <p className="break-all text-gray-400">{check.jump ? 'Jump host' : 'Target'} · <span className="font-mono">{check.address}</span></p>
            {check.failure && <p className="mt-0.5 text-red-300">{check.failure}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SSHDiagnosticDialog({ report, onClose }: { report: connection.SSHDiagnostic; onClose: () => void }) {
  return (
    <Modal title="SSH connection details" onClose={onClose}>
      <div className="px-5 pb-5"><SSHDiagnosticChecks report={report} /></div>
    </Modal>
  );
}
