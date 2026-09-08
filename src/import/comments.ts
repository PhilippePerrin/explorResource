import { normalizeAmount } from '@/domain/normalization/normalizeAmount';

export interface ParsedDemandSupplyComment {
  demandDays: number;
  supplyDays: number;
}

const DEMAND_PATTERN = /Demand\s*:\s*([+-]?\d+(?:[.,]\d+)?)\s*\(Day\)/i;
const SUPPLY_PATTERN = /Supply\s*:\s*([+-]?\d+(?:[.,]\d+)?)\s*\(Day\)/i;

function parseDecimal(value: string): number {
  return Number(value.replace(',', '.'));
}

export function getCellCommentText(
  cell: { c?: Array<{ t?: string }> } | undefined,
): string | undefined {
  const text = cell?.c
    ?.map((comment) => comment.t?.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  return text ? text : undefined;
}

export function parseDemandSupplyComment(
  commentText: string | undefined,
): ParsedDemandSupplyComment | null {
  if (!commentText) {
    return null;
  }

  const demandMatch = DEMAND_PATTERN.exec(commentText);
  const supplyMatch = SUPPLY_PATTERN.exec(commentText);

  if (!demandMatch || !supplyMatch) {
    return null;
  }

  const demandDaysText = demandMatch[1];
  const supplyDaysText = supplyMatch[1];

  if (!demandDaysText || !supplyDaysText) {
    return null;
  }

  return {
    demandDays: normalizeAmount(parseDecimal(demandDaysText)),
    supplyDays: normalizeAmount(parseDecimal(supplyDaysText)),
  };
}
