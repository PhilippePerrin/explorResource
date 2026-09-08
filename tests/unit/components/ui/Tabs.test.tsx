import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Tabs, type TabItem } from '@/components/ui';

const ITEMS: readonly TabItem[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function ControlledTabs() {
  const [value, setValue] = useState('light');
  return <Tabs items={ITEMS} label="Theme" value={value} onChange={setValue} />;
}

describe('Tabs', () => {
  it('renders a tablist with the selected tab marked via aria-selected', () => {
    render(<ControlledTabs />);

    expect(screen.getByRole('tablist', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Light' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Dark' })).toHaveAttribute('aria-selected', 'false');
  });

  it('only the selected tab is in the tab order (roving tabindex)', () => {
    render(<ControlledTabs />);

    expect(screen.getByRole('tab', { name: 'Light' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Dark' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'System' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves selection with ArrowRight/ArrowLeft and wraps at the ends', async () => {
    const user = userEvent.setup();
    render(<ControlledTabs />);

    screen.getByRole('tab', { name: 'Light' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Dark' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Dark' })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'System' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'System' })).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps to the first/last tab with Home/End', async () => {
    const user = userEvent.setup();
    render(<ControlledTabs />);

    screen.getByRole('tab', { name: 'Light' }).focus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'System' })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Light' })).toHaveFocus();
  });
});
