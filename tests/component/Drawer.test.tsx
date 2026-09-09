import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Drawer } from '@/components/ui/Drawer';

function DrawerHarness() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setOpen(true)} type="button">
        Open drawer
      </button>
      <Drawer onClose={() => setOpen(false)} open={open} title="Create project">
        <form>
          <label htmlFor="project-code">Project code</label>
          <input id="project-code" type="text" />
          <button type="submit">Create project</button>
        </form>
      </Drawer>
    </div>
  );
}

describe('Drawer', () => {
  it('opens with the correct aria attributes and focuses the first field', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    const trigger = screen.getByRole('button', { name: /Open drawer/i });
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: /Create project/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText(/Project code/i)).toHaveFocus();
  });

  it('traps focus with Tab/Shift+Tab and closes on Escape, restoring focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    const trigger = screen.getByRole('button', { name: /Open drawer/i });
    await user.click(trigger);

    await screen.findByRole('dialog');
    const input = screen.getByLabelText(/Project code/i);
    const submitButton = screen.getByRole('button', { name: /^Create project$/i });
    const closeButton = screen.getByRole('button', { name: /Close panel/i });

    expect(input).toHaveFocus();

    await user.tab();
    expect(submitButton).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(input).toHaveFocus();

    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes when the close button is clicked', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    await user.click(screen.getByRole('button', { name: /Open drawer/i }));
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: /Close panel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
