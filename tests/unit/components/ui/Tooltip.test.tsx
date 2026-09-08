import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Tooltip } from '@/components/ui';

describe('Tooltip', () => {
  it('is hidden until the trigger receives focus, then exposed via aria-describedby', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Capacity Command Center">
        <button type="button">CC</button>
      </Tooltip>,
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Capacity Command Center');
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('dismisses on Escape', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Capacity Command Center">
        <button type="button">CC</button>
      </Tooltip>,
    );

    await user.tab();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('dismisses on blur', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="Capacity Command Center">
          <button type="button">CC</button>
        </Tooltip>
        <button type="button">Elsewhere</button>
      </>,
    );

    await user.tab();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await user.tab();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
