import type { ImportComparisonSummary, ImportAnalysis, ImportCommitResult } from './types';

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value);
}

export function generateImportReportMarkdown(options: {
  analysis: ImportAnalysis;
  comparison: ImportComparisonSummary;
  commitResult?: ImportCommitResult;
}): string {
  const { analysis, comparison, commitResult } = options;
  const lines = [
    '# Excel import report',
    '',
    `- File: ${analysis.fileName}`,
    `- SHA-256: ${analysis.fileSha256}`,
    `- Worksheet: ${analysis.sheetName}`,
    `- Reference year: ${analysis.referenceYear}`,
    `- Duplicate of existing import: ${analysis.duplicateOf ? 'yes' : 'no'}`,
    '',
    '## Row summary',
    '',
    `- Total rows: ${analysis.statistics.totalRows}`,
    `- Group rows: ${analysis.statistics.groupRows}`,
    `- Project rows: ${analysis.statistics.projectRows}`,
    `- Demand rows: ${analysis.statistics.demandRows}`,
    `- Supply rows: ${analysis.statistics.supplyRows}`,
    `- Ambiguous rows: ${analysis.statistics.ambiguousRows}`,
    '',
    '## Import artifacts',
    '',
    `- Groups to upsert: ${analysis.groups.length}`,
    `- Projects to upsert: ${analysis.projects.length}`,
    `- Demand snapshots: ${analysis.demandSnapshots.length}`,
    `- Import allocations: ${analysis.allocations.length}`,
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

  lines.push('## Comparison with previous validated import', '');
  lines.push(`- Previous batch: ${comparison.previousBatch?.fileName ?? 'None'}`);
  lines.push(`- New keys: ${comparison.newCount}`);
  lines.push(`- Removed keys: ${comparison.removedCount}`);
  lines.push(`- Increased keys: ${comparison.increasedCount}`);
  lines.push(`- Decreased keys: ${comparison.decreasedCount}`);
  lines.push(`- Unchanged keys: ${comparison.unchangedCount}`);
  lines.push(`- Positive delta (days): ${formatAmount(comparison.positiveDelta)}`);
  lines.push(`- Negative delta (days): ${formatAmount(comparison.negativeDelta)}`);
  lines.push(`- Net delta (days): ${formatAmount(comparison.netDelta)}`);
  lines.push('');

  if (comparison.items.length > 0) {
    lines.push(
      '| Project | Resource type | Month | Previous demand | New demand | Delta | State |',
      '| --- | --- | --- | ---: | ---: | ---: | --- |',
    );
    for (const item of comparison.items.slice(0, 50)) {
      lines.push(
        `| ${item.projectCode} | ${item.resourceTypeLabel} | ${item.year}-${String(item.month).padStart(2, '0')} | ${formatAmount(item.previousDemandDays)} | ${formatAmount(item.nextDemandDays)} | ${formatAmount(item.deltaDays)} | ${item.state} |`,
      );
    }
    lines.push('');
  }

  if (commitResult) {
    lines.push('## Commit result', '');
    lines.push(`- Import batch id: ${commitResult.importBatch.id}`);
    lines.push(`- Imported raw rows: ${commitResult.importedRawRows}`);
    lines.push(`- Imported demand snapshots: ${commitResult.importedDemandSnapshots}`);
    lines.push(`- Upserted allocations: ${commitResult.upsertedAllocations}`);
    lines.push(`- Created projects: ${commitResult.createdProjects}`);
    lines.push(`- Updated projects: ${commitResult.updatedProjects}`);
    lines.push(`- Created groups: ${commitResult.createdGroups}`);
    lines.push(`- Updated groups: ${commitResult.updatedGroups}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function createReportBlob(markdown: string): Blob {
  return new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
}
