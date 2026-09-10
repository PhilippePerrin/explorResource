import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MultiSelectPopoverField } from '@/components/MultiSelectPopoverField';

const OPTIONS = [
  { value: 'E0100', label: 'E0100 — Commercial Analytics' },
  { value: 'E0200', label: 'E0200 — Gapped Delivery' },
  { value: 'P0300', label: 'P0300 — Platform Migration' },
];

function Harness() {
  const [values, setValues] = useState<string[]>([]);

  return (
    <div>
      <button type="button">Outside</button>
      <MultiSelectPopoverField
        fieldKey="projectCodesFilter"
        label="Projects"
        options={OPTIONS}
        values={values}
        onChange={setValues}
      />
    </div>
  );
}

describe('MultiSelectPopoverField', () => {
  it('opens on trigger click, summarizes selection, and toggles a checkbox through onChange', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: /Projects: All projects/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const panel = screen.getByRole('group', { name: 'Projects' });
    await user.click(within(panel).getByLabelText(/E0100 — Commercial Analytics/i));

    expect(
      await screen.findByRole('button', { name: /Projects: 1 projects selected/i }),
    ).toBeInTheDocument();
  });

  it('filters the list via search', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /Projects: All projects/i }));
    const panel = screen.getByRole('group', { name: 'Projects' });

    await user.type(within(panel).getByLabelText(/Search projects/i), 'Platform');

    expect(within(panel).getByText(/P0300 — Platform Migration/i)).toBeInTheDocument();
    expect(within(panel).queryByText(/E0100 — Commercial Analytics/i)).not.toBeInTheDocument();
  });

  it('Select all only selects the filtered options, and Clear empties the selection', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /Projects: All projects/i }));
    let panel = screen.getByRole('group', { name: 'Projects' });
    await user.type(within(panel).getByLabelText(/Search projects/i), 'E0');
    await user.click(within(panel).getByRole('button', { name: /Select all/i }));

    expect(
      await screen.findByRole('button', { name: /Projects: 2 projects selected/i }),
    ).toBeInTheDocument();

    panel = screen.getByRole('group', { name: 'Projects' });
    await user.click(within(panel).getByRole('button', { name: /Clear/i }));

    expect(
      await screen.findByRole('button', { name: /Projects: All projects/i }),
    ).toBeInTheDocument();
  });

  it('closes on outside click and on Escape, returning focus to the trigger on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: /Projects: All projects/i });
    await user.click(trigger);
    expect(screen.getByRole('group', { name: 'Projects' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('group', { name: 'Projects' })).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole('group', { name: 'Projects' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Projects' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
