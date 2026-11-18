import { PruneRecordings } from '../../wailsjs/go/main/App';
import { getSettings } from './settings';

/**
 * Applies settings.recordings: deletes finished recordings that are too old,
 * then the oldest ones while the folder is over the size limit. Returns how
 * many were deleted.
 */
export async function pruneRecordings(): Promise<number> {
  const { keepDays, maxSizeMB } = getSettings().recordings;
  if (!keepDays && !maxSizeMB) return 0;
  return PruneRecordings(keepDays, maxSizeMB);
}
