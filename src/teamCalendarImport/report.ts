import type { TeamCalendarAnalysis, TeamCalendarCommitResult } from './types';

export function generateTeamCalendarImportReportMarkdown(options: {
  analysis: TeamCalendarAnalysis;
  commitResult?: TeamCalendarCommitResult;
}): string {
  const { analysis, commitResult } = options;
  const lines = [
    '# Team Calendar (non-working days) import report',
    '',
    `- File: ${analysis.fileName}`,
    `- SHA-256: ${analysis.fileSha256}`,
    `- Worksheet: ${analysis.sheetName}`,
    `- Duplicate of existing import: ${analysis.duplicateOf ? 'yes' : 'no'}`,
    '',
    '## Row summary',
    '',
    `- Resource rows in file: ${analysis.statistics.resourceRows}`,
    `- Matched resource rows: ${analysis.statistics.matchedResourceRows}`,
    `- Unmatched resource rows: ${analysis.statistics.unmatchedResourceRows}`,
    `- Decoded absence cells: ${analysis.statistics.decodedCellCount}`,
    `- Unrecognized markings (excluded, flagged): ${analysis.statistics.unrecognizedMarkingCount}`,
    `- Conflicting markings (text wins, flagged): ${analysis.statistics.conflictingMarkingCount}`,
    '',
    '## Staged monthly totals',
    '',
    `- Resource/month combinations to write: ${analysis.monthlyTotals.length}`,
    '',
    '## Anomalies',
    '',
    `- Blocking anomalies: ${analysis.anomalies.filter((item) => item.severity === 'blocking').length}`,
    `- Warning anomalies: ${analysis.anomalies.filter((item) => item.severity === 'warning').length}`,
    '',
  ];

  if (analysis.anomalies.length > 0) {
    lines.push('| Severity | Row | Cell | Message |', '| --- | ---: | --- | --- |');
    for (const anomaly of analysis.anomalies) {
      lines.push(
        `| ${anomaly.severity} | ${anomaly.rowNumber ?? ''} | ${anomaly.cellRef ?? ''} | ${anomaly.message.replace(/\|/g, '\\|')} |`,
      );
    }
    lines.push('');
  }

  if (commitResult) {
    lines.push('## Commit result', '');
    lines.push(`- Import batch id: ${commitResult.importBatch.id}`);
    lines.push(`- Resource/month rows upserted: ${commitResult.upsertedMonths}`);
    lines.push(`- Resource/month rows cleared (zeroed): ${commitResult.deletedMonths}`);
    lines.push(`- Resources affected: ${commitResult.affectedResourceCount}`);
    lines.push(`- Years affected: ${commitResult.affectedYears.join(', ') || '—'}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function createTeamCalendarImportReportBlob(markdown: string): Blob {
  return new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
}
