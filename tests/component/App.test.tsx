import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../../src/app/App';

describe('App shell', () => {
  it('renders the application title text and current route heading', async () => {
    render(<App />);
    expect(screen.getByText(/Resource Capacity & Project Demand Planner/i)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /^Dashboard$/i })).toBeInTheDocument();
  });

  it('renders a skip link for keyboard accessibility', () => {
    render(<App />);
    expect(screen.getByText(/Skip to main content/i)).toBeInTheDocument();
  });
});
