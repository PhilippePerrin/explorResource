import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '@/components/ConfirmDialog';

function ConfirmDialogHarness() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setOpen(true)} type="button">
        Open dialog
      </button>
      <ConfirmDialog
        confirmLabel="Confirm action"
        description="Dialog body"
        onCancel={() => setOpen(false)}
        onConfirm={vi.fn()}
        open={open}
        title="Confirm test action"
      />
    </div>
  );
}

describe('ConfirmDialog', () => {
  it('traps focus and returns it to the trigger when closed', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialogHarness />);

    const trigger = screen.getByRole('button', { name: /Open dialog/i });
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: /Confirm test action/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: /Confirm action/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: /Cancel/i })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
