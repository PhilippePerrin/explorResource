import type { ResourceImportAnalysis, ResourceImportCommitResult } from './types';

export function generateResourceImportReportMarkdown(options: {
  analysis: ResourceImportAnalysis;
  commitResult?: ResourceImportCommitResult;
}): string {
  const { analysis, commitResult } = options;
  const lines = [
    '# Resource import report',
    '',
    `- File: ${analysis.fileName}`,
    `- SHA-256: ${analysis.fileSha256}`,
    `- Worksheet: ${analysis.sheetName}`,
    `- Duplicate of existing import: ${analysis.duplicateOf ? 'yes' : 'no'}`,
    '',
    '## Row summary',
    '',
    `- Total rows: ${analysis.statistics.totalRows}`,
    `- Organizational rows: ${analysis.statistics.organizationalRows}`,
    `- Resource-type rows: ${analysis.statistics.resourceTypeRows}`,
    `- Person rows: ${analysis.statistics.personRows}`,
    `- Detail rows: ${analysis.statistics.detailRows}`,
    `- Ambiguous rows: ${analysis.statistics.ambiguousRows}`,
    `- Skipped [Inactive Res.] detail rows: ${analysis.statistics.skippedInactiveCount}`,
    '',
    '## Staged changes',
    '',
    `- New resource types: ${analysis.resourceTypesToCreate.length}`,
    `- Resources to create: ${analysis.resources.filter((resource) => resource.action === 'create').length}`,
    `- Resources to update: ${analysis.resources.filter((resource) => resource.action === 'update').length}`,
    `- Resources unchanged: ${analysis.resources.filter((resource) => resource.action === 'unchanged').length}`,
    `- No longer listed in file (not archived automatically): ${analysis.noLongerListed.length}`,
    '',
    '## Anomalies',
    '',
    `- Blocking anomalies: ${analysis.anomalies.filter((item) => item.severity === 'blocking').length}`,
    `- Warning anomalies: ${analysis.anomalies.filter((item) => item.severity === 'warning').length}`,
    '',
  ];

  if (analysis.anomalies.length > 0) {
    lines.push('| Severity | Row | Message |', '| --- | ---: | --- |');
    for (const anomaly of analysis.anomalies) {
      lines.push(
        `| ${anomaly.severity} | ${anomaly.rowNumber ?? ''} | ${anomaly.message.replace(/\|/g, '\\|')} |`,
      );
    }
    lines.push('');
  }

  if (analysis.noLongerListed.length > 0) {
    lines.push('## No longer listed in this file (review manually, not auto-archived)', '');
    for (const resource of analysis.noLongerListed) {
      lines.push(`- ${resource.firstName} ${resource.lastName}`);
    }
    lines.push('');
  }

  if (commitResult) {
    lines.push('## Commit result', '');
    lines.push(`- Import batch id: ${commitResult.importBatch.id}`);
    lines.push(`- Created resource types: ${commitResult.createdResourceTypes}`);
    lines.push(`- Created resources: ${commitResult.createdResources}`);
    lines.push(`- Updated resources: ${commitResult.updatedResources}`);
    lines.push(`- Unchanged resources: ${commitResult.unchangedResources}`);

    if (commitResult.skippedTypeChanges.length > 0) {
      lines.push(
        `- Skipped type changes (existing allocations prevent an in-place change): ${commitResult.skippedTypeChanges.length}`,
      );
      for (const skipped of commitResult.skippedTypeChanges) {
        lines.push(`  - ${skipped.fullName} → ${skipped.attemptedResourceTypeLabel}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

export function createResourceImportReportBlob(markdown: string): Blob {
  return new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
}
