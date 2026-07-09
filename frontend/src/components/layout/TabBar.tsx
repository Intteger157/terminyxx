import { X } from 'lucide-react';
import type { TerminalTab } from '../../types';

interface TabBarProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function TabBar({ tabs, activeTabId, onSelect, onClose, onNew }: TabBarProps) {
  return (
    <div className="flex items-center bg-surface-raised border-b border-border overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`group flex items-center gap-2 px-3 py-2 text-sm border-r border-border cursor-pointer min-w-0 ${
            activeTabId === tab.id
              ? 'bg-surface text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-surface-overlay'
          }`}
          onClick={() => onSelect(tab.id)}
        >
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              tab.connected ? 'bg-green-500' : 'bg-gray-600'
            }`}
          />
          <span className="truncate max-w-[140px]">{tab.title}</span>
          <button
            className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        className="px-3 py-2 text-gray-500 hover:text-white hover:bg-surface-overlay text-lg leading-none flex-shrink-0"
        onClick={onNew}
        title="Новая вкладка"
      >
        +
      </button>
    </div>
  );
}
