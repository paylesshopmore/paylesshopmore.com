// "Ontvangen producten" on an intake sheet: the warehouse counts each
// ordered product in a delivery and confirms the count. The server decides
// the totals (backend warehouse/receipts.py); this checks what is sent and
// that the answer replaces what is on screen.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { getIntakeProducts, saveIntakeProducts } from '../../api/staff';
import IntakeProducts from './IntakeProducts';

vi.mock('../../api/staff', () => ({ getIntakeProducts: vi.fn(), saveIntakeProducts: vi.fn() }));

const line = (extra) => ({
  product: 11,
  name: 'Stoel',
  store: 'Ikea',
  ordered: 5,
  counted_here: null,
  counted_elsewhere: 0,
  received: 0,
  expected: 5,
  status: 'not_received',
  confirmed_by: '',
  confirmed_at: null,
  ...extra,
});

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'nl');
  getIntakeProducts.mockReset();
  saveIntakeProducts.mockReset();
});

describe('Ontvangen producten', () => {
  it('confirms the typed count and shows the new total', async () => {
    getIntakeProducts.mockResolvedValue({ booking: 3, lines: [line(), line({ product: 12, name: 'Lamp', ordered: 2 })] });
    saveIntakeProducts.mockResolvedValue({
      booking: 3,
      lines: [
        line({ counted_here: 3, received: 3, expected: 2, status: 'partial', confirmed_by: 'Wim', confirmed_at: '2026-11-12T10:00:00Z' }),
        line({ product: 12, name: 'Lamp', ordered: 2 }),
      ],
    });
    renderWithProviders(<IntakeProducts sheetId={9} linked archived={false} />);

    const box = await screen.findByLabelText('Aantal Stoel in deze levering');
    await userEvent.type(box, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Telling bevestigen' }));

    // Only the box with a number is sent; the empty one stays "not counted".
    expect(saveIntakeProducts).toHaveBeenCalledWith(9, [{ product: 11, quantity: 3 }]);
    const chair = within(screen.getByText('Stoel').closest('li'));
    expect(await chair.findByText('Gedeeltelijk ontvangen')).toBeInTheDocument();
    expect(chair.getByText(/Bevestigd door Wim/)).toBeInTheDocument();
  });

  it('says there is nothing to count on a sheet without a booking', () => {
    renderWithProviders(<IntakeProducts sheetId={9} linked={false} archived={false} />);
    expect(screen.getByText(/niet gekoppeld aan een boeking/)).toBeInTheDocument();
    expect(getIntakeProducts).not.toHaveBeenCalled();
  });

  it('shows the counts of an archived sheet without a confirm button', async () => {
    getIntakeProducts.mockResolvedValue({ booking: 3, lines: [line({ counted_here: 2 })] });
    renderWithProviders(<IntakeProducts sheetId={9} linked archived />);
    expect(await screen.findByLabelText('Aantal Stoel in deze levering')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Telling bevestigen' })).not.toBeInTheDocument();
  });
});
