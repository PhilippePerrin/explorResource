import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TableShell } from '@/components/ui';

describe('TableShell', () => {
  it('renders a visually hidden caption by default', () => {
    render(
      <TableShell caption="Resources">
        <tbody>
          <tr>
            <td>Alice Martin</td>
          </tr>
        </tbody>
      </TableShell>,
    );

    const table = screen.getByText('Alice Martin').closest('table');
    expect(table).not.toBeNull();
    const caption = table?.querySelector('caption');
    expect(caption).toHaveTextContent('Resources');
    expect(caption).toHaveClass('sr-only');
  });

  it('shows a visible caption when captionVisible is set', () => {
    render(
      <TableShell captionVisible caption="Resources">
        <tbody>
          <tr>
            <td>Alice Martin</td>
          </tr>
        </tbody>
      </TableShell>,
    );

    expect(screen.getByText('Resources')).not.toHaveClass('sr-only');
  });
});
