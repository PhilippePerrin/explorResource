import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import App from '../../src/app/App';
import { ALL_NAV_ITEMS } from '../../src/app/nav';

describe('App shell', () => {
  it('renders the application title text and current route heading', async () => {
    render(<App />);
    expect(screen.getByText(/Resource Capacity & Project Demand Planner/i)).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: /^Dashboard$/i }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('renders a skip link for keyboard accessibility', () => {
    render(<App />);
    expect(screen.getByText(/Skip to main content/i)).toBeInTheDocument();
  });

  it('exposes every route through the grouped primary navigation', () => {
    render(<App />);
    const primaryNav = screen.getByRole('navigation', { name: 'Primary' });

    for (const item of ALL_NAV_ITEMS) {
      expect(within(primaryNav).getByRole('link', { name: item.label })).toBeInTheDocument();
    }
  });
});
