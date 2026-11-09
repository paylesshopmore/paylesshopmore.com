// The "What to do next" banner on the profile: it has to tell a freshly
// signed-in customer that a booking is the next step, and link to the form.

import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import NextSteps from './NextSteps';

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'en');
});

describe('NextSteps', () => {
  it('shows the three steps in order', () => {
    renderWithProviders(<NextSteps />);

    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent('Order from a webshop');
    expect(steps[1]).toHaveTextContent('Make a booking');
    expect(steps[2]).toHaveTextContent('Follow your shipment');
  });

  it('links the main button to the booking form', () => {
    renderWithProviders(<NextSteps />);

    expect(screen.getByRole('link', { name: 'Make a booking' })).toHaveAttribute(
      'href',
      '/booking',
    );
    // Only the booking button: no pre-alert button in this box.
    expect(screen.queryByRole('link', { name: 'Pre-alert a package' })).toBeNull();
  });
});
