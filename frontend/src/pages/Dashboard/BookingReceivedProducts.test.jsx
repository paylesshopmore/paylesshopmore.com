// "Ontvangen producten" on a booking in the office dashboard: shows the rows
// the server sends (warehouse/receipts.py), the same ones the customer sees.

import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import BookingReceivedProducts from './BookingReceivedProducts';

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'nl');
});

describe('Ontvangen producten on a booking', () => {
  it('shows each product with its numbers and status', () => {
    renderWithProviders(
      <BookingReceivedProducts
        products={[
          { id: 1, name: 'Stoel', store: 'Ikea', ordered: 5, received: 3, expected: 2, status: 'partial' },
          { id: 2, name: 'Kast', store: 'Ikea', ordered: 1, received: null, expected: null, status: 'unknown' },
        ]}
      />,
    );
    const chair = within(screen.getByText('Stoel').closest('li'));
    expect(chair.getByText('5 besteld · 3 ontvangen · 2 nog verwacht')).toBeInTheDocument();
    expect(chair.getByText('Gedeeltelijk ontvangen')).toBeInTheDocument();
    const cupboard = within(screen.getByText('Kast').closest('li'));
    expect(cupboard.getByText('1 besteld')).toBeInTheDocument();
    expect(cupboard.getByText('Onbekend')).toBeInTheDocument();
  });

  it('says so when the booking has no products', () => {
    renderWithProviders(<BookingReceivedProducts products={[]} />);
    expect(screen.getByText('Geen producten bij deze boeking.')).toBeInTheDocument();
  });
});
