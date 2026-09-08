import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Menu } from '@/components/icons';
import { IconButton } from '@/components/ui';

describe('IconButton', () => {
  it('requires and exposes an accessible name via the label prop', () => {
    render(<IconButton icon={Menu} label="Open navigation" onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
  });

  it('renders the icon as decorative (aria-hidden)', () => {
    render(<IconButton icon={Menu} label="Open navigation" onClick={() => {}} />);
    const svg = screen.getByRole('button', { name: 'Open navigation' }).querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('invokes onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton icon={Menu} label="Open navigation" onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
