import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UtilizationBadge } from '@/components/UtilizationBadge';
import type { UtilizationResult } from '@/domain/calculations';

const utilization: UtilizationResult = {
  ratePercent: 125,
  status: 'critical-overload',
  isCriticalOverload: true,
};

describe('UtilizationBadge', () => {
  it('shows the status label by default', () => {
    render(<UtilizationBadge tooltip="Test tooltip" utilization={utilization} />);

    expect(screen.getByText('Critical overload')).toBeInTheDocument();
    expect(screen.getByText('125%')).toBeInTheDocument();
  });

  it('hides the visible status label when showLabel is false, but keeps it in aria-label/title', () => {
    render(
      <UtilizationBadge showLabel={false} tooltip="Test tooltip" utilization={utilization} />,
    );

    expect(screen.queryByText('Critical overload')).not.toBeInTheDocument();
    expect(screen.getByText('125%')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Critical overload\. Test tooltip$/i)).toBeInTheDocument();
    expect(screen.getByTitle('Test tooltip')).toBeInTheDocument();
  });
});
