import type { LucideIcon } from '@/components/icons';

export type IconChipTone =
  'neutral' | 'accent' | 'success' | 'caution' | 'attention' | 'critical' | 'info';
export type IconChipSize = 'sm' | 'md' | 'lg';

export interface IconChipProps {
  icon: LucideIcon;
  tone?: IconChipTone;
  size?: IconChipSize;
  className?: string;
}

const SIZE_CLASSES: Record<IconChipSize, { wrapper: string; icon: number }> = {
  sm: { wrapper: 'h-7 w-7', icon: 14 },
  md: { wrapper: 'h-9 w-9', icon: 18 },
  lg: { wrapper: 'h-12 w-12', icon: 22 },
};

export function IconChip({
  icon: Icon,
  tone = 'neutral',
  size = 'md',
  className = '',
}: IconChipProps) {
  const sizeConfig = SIZE_CLASSES[size];

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border ui-icon-chip-${tone} ${sizeConfig.wrapper} ${className}`}
    >
      <Icon aria-hidden="true" size={sizeConfig.icon} strokeWidth={2.25} />
    </span>
  );
}
