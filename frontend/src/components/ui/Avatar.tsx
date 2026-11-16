import type { ReactNode } from 'react';
import { hostColor, initials } from '../../lib/hosts';

export function Avatar({
  label,
  colorKey,
  live,
  icon,
  size = 28,
}: {
  label: string;
  colorKey: string;
  live?: boolean;
  icon?: ReactNode;
  size?: number;
}) {
  return (
    <span
      className="relative flex-shrink-0 flex items-center justify-center rounded-lg font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size <= 24 ? 9.5 : 10.5,
        color: hostColor(colorKey),
        background: hostColor(colorKey, 0.12),
        boxShadow: `inset 0 0 0 1px ${hostColor(colorKey, 0.22)}`,
      }}
    >
      {icon ?? initials(label)}
      {live && (
        <span className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-app shadow-[0_0_6px_rgb(52_211_153/0.8)]" />
      )}
    </span>
  );
}
