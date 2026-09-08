import { forwardRef, type ButtonHTMLAttributes } from 'react';

import type { LucideIcon } from '@/components/icons';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
> {
  icon: LucideIcon;
  label: string;
  size?: 'sm' | 'md';
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 'md', className = '', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      aria-label={label}
      className={`inline-flex items-center justify-center rounded-md transition-colors hover:bg-[var(--surf-700)] disabled:opacity-70 ${SIZE_CLASSES[size]} ${className}`}
      ref={ref}
      title={label}
      type={type}
      {...rest}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={2.25} />
    </button>
  );
});
