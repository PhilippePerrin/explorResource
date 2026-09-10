import { AlertTriangle, Ban, Circle, CircleDot } from '@/components/icons';
import type { UtilizationStatus } from '@/domain/calculations';

export const UTILIZATION_STATUSES: readonly UtilizationStatus[] = [
  'available',
  'used',
  'overload',
  'critical-overload',
];

export function getUtilizationDescriptor(status: UtilizationStatus) {
  switch (status) {
    case 'available':
      return {
        Icon: Circle,
        label: 'Available',
        classes:
          'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
      };
    case 'used':
      return {
        Icon: CircleDot,
        label: 'Used',
        classes:
          'border-[var(--status-caution-border)] bg-[var(--status-caution-bg)] text-[var(--status-caution-text)]',
      };
    case 'overload':
      return {
        Icon: AlertTriangle,
        label: 'Overload',
        classes:
          'border-[var(--status-attention-border)] bg-[var(--status-attention-bg)] text-[var(--status-attention-text)]',
      };
    case 'critical-overload':
      return {
        Icon: Ban,
        label: 'Critical overload',
        classes:
          'border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-text)]',
      };
  }
}
