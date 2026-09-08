import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  glow?: boolean;
}

export function Card({ children, glow = false, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`ui-shadow-sm rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5 ${glow ? 'card-glow' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
