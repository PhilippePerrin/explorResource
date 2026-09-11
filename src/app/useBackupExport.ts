import { useState } from 'react';

import { exportBackup } from '@/persistence/backup';

function formatExportTimestamp(value: string): string {
  return value.replaceAll(':', '-').replaceAll('.', '-');
}

export function buildBackupFileName(exportedAt: string): string {
  return `resource-capacity-planner-backup-${formatExportTimestamp(exportedAt)}.json`;
}

export interface UseBackupExportResult {
  exporting: boolean;
  feedback: string;
  triggerExport: () => Promise<void>;
}

export function useBackupExport(): UseBackupExportResult {
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState('');

  async function triggerExport() {
    setExporting(true);
    setFeedback('');

    try {
      const backup = await exportBackup();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], {
          type: 'application/json',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = buildBackupFileName(backup.exportedAt);
      anchor.click();
      URL.revokeObjectURL(url);
      setFeedback('Backup exported.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to export backup.');
    } finally {
      setExporting(false);
    }
  }

  return { exporting, feedback, triggerExport };
}
