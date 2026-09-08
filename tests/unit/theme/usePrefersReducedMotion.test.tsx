import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { usePrefersReducedMotion } from '@/theme/usePrefersReducedMotion';

function mockMatchMedia(matches: boolean) {
  const listeners: Array<(event: MediaQueryListEvent) => void> = [];

  const mediaQueryList = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.push(listener);
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQueryList as unknown as MediaQueryList);

  return { mediaQueryList, listeners };
}

function Probe() {
  const reduced = usePrefersReducedMotion();
  return <span>{reduced ? 'reduced' : 'full'}</span>;
}

describe('usePrefersReducedMotion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reflects the initial media query state', () => {
    mockMatchMedia(true);
    render(<Probe />);
    expect(screen.getByText('reduced')).toBeInTheDocument();
  });

  it('reacts to a later system preference change', () => {
    const { mediaQueryList, listeners } = mockMatchMedia(false);
    render(<Probe />);
    expect(screen.getByText('full')).toBeInTheDocument();

    mediaQueryList.matches = true;
    act(() => {
      listeners.forEach((listener) => listener({} as MediaQueryListEvent));
    });
    expect(screen.getByText('reduced')).toBeInTheDocument();
  });
});
