// The shipping calculator page: the form, the result, and the quote with the
// details filled in.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculate } from '../../calculator/calculate';
import { renderWithProviders } from '../../test/utils';
import Calculator from './Calculator';

// The handling-cost rules as the server gives them (backend invoicing/
// calculation.py HANDLING_FEE_RULES).
vi.mock('../../api/pricing', () => ({
  getHandlingRules: vi.fn().mockResolvedValue({
    rules: [
      { up_to_eur: '500.00', fee_eur: '50.00', suppliers_included: null },
      { up_to_eur: null, fee_eur: '150.00', suppliers_included: 2 },
    ],
  }),
}));

vi.mock('../../calculator/calculate', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, calculate: vi.fn(actual.calculate) };
});

async function fillForm(user) {
  await user.type(screen.getByLabelText('Price incl. VAT in euros'), '500');
  await user.click(screen.getByLabelText('21%'));
  await user.type(screen.getByLabelText('Length'), '75');
  await user.type(screen.getByLabelText('Width'), '80');
  await user.type(screen.getByLabelText('Height'), '45');
  await user.type(screen.getByLabelText('Weight'), '35');
  await user.selectOptions(screen.getByLabelText('Import category'), 'shoes');
  await user.click(screen.getByLabelText('Sea freight'));
}

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'en');
  calculate.mockClear();
});

describe('the shipping calculator', () => {
  it('has every question, and an empty result', () => {
    renderWithProviders(<Calculator />, { route: '/calculator' });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Shipping cost calculator' }),
    ).toBeInTheDocument();
    for (const label of ['0%', '9%', '21%', 'Air freight', 'Sea freight']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // Curaçao only: no choice of island, and no Bonaire.
    expect(screen.getByText('Destination: Curaçao')).toBeInTheDocument();
    expect(screen.queryByText(/Bonaire/)).toBeNull();
    expect(screen.getByLabelText('Import category')).toBeInTheDocument();
    expect(screen.getByText('Fill in the form and press Calculate.')).toBeInTheDocument();
  });

  it('says what is missing instead of calculating nonsense', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Calculator />, { route: '/calculator' });

    await user.click(screen.getByRole('button', { name: 'Calculate' }));

    expect(screen.getByText('Enter a price above 0.')).toBeInTheDocument();
    expect(screen.getByText('Choose a category.')).toBeInTheDocument();
    expect(calculate).not.toHaveBeenCalled();
  });

  it('works out freight, fees and import duty, but no total while the OB rate is unknown', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Calculator />, { route: '/calculator' });

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Calculate' }));

    expect(screen.getByText('€413.22')).toBeInTheDocument(); // 500 without 21% VAT
    expect(screen.getByText('Dutch VAT (21%)')).toBeInTheDocument();
    expect(screen.getByText('€86.78')).toBeInTheDocument(); // 500 - 413.22
    expect(screen.getByText('0.27 m³')).toBeInTheDocument();
    // Shoes to Curaçao: 13% duty, from the customs tariff, even without freight prices.
    expect(screen.getByText('Import duty (13%)')).toBeInTheDocument();
    expect(screen.getByText('€53.72')).toBeInTheDocument();
    // 0.27 m³ x € 180, and the fixed fees per shipment.
    expect(screen.getByText('Freight (Sea freight)')).toBeInTheDocument();
    expect(screen.getByText('€48.60')).toBeInTheDocument();
    expect(screen.getByText('Administration fee')).toBeInTheDocument();
    expect(screen.getByText('Documentation fee')).toBeInTheDocument();
    expect(screen.getByText('Handling fee')).toBeInTheDocument();
    // EUR 500 is still the lower rate.
    expect(screen.getByText('€50.00')).toBeInTheDocument();
    expect(screen.getByText(/Not every charge for this destination is known yet/)).toBeInTheDocument();
    expect(screen.queryByText('Total (indication)')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Request a quote with these details' }));

    // The quote form, with what was calculated already in the message.
    const message = document.querySelector('textarea[name="message"]');
    expect(message.value).toContain('Destination: Curaçao');
    expect(message.value).toContain('75 x 80 x 45 cm');
    expect(message.value).toContain('Import category: Shoes');
    expect(message.value).toContain('Transport method: Sea freight');
    expect(message.value).toContain('Dutch VAT (21%): €86.78');
    expect(message.value).toContain('Freight (Sea freight): €48.60');
    expect(message.value).toContain('Handling fee: €50.00');
    expect(message.value).toContain('Import duty (13%): €53.72');
  });

  it('shows the price, line by line, once rates exist', async () => {
    const user = userEvent.setup();
    calculate.mockReturnValueOnce({
      vatAmount: 86.78,
      goodsValue: 413.22,
      volumeM3: 0.27,
      actualKg: 0.04,
      volumetricKg: 45,
      chargeableKg: 45,
      freight: 35,
      fees: [{ key: 'handling', amount: 150 }],
      feesTotal: 150,
      duty: 90.91,
      dutyPercent: 22,
      localTax: 32.35,
      localTaxPercent: 6,
      total: 308.26,
      priced: true,
    });
    renderWithProviders(<Calculator />, { route: '/calculator' });

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Calculate' }));

    expect(screen.getByText('Freight (Sea freight)')).toBeInTheDocument();
    expect(screen.getByText('Import duty (22%)')).toBeInTheDocument();
    expect(screen.getByText('Sales tax (OB) 6%')).toBeInTheDocument();
    expect(screen.getByText('Total (indication)')).toBeInTheDocument();
    expect(screen.getByText('Handling fee')).toBeInTheDocument();
    expect(screen.getByText('€308.26')).toBeInTheDocument();
    expect(screen.queryByText(/We do not calculate the price/)).toBeNull();
  });

  it('updates the handling costs as soon as the price changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Calculator />, { route: '/calculator' });
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Calculate' }));

    const handling = () => screen.getByText('Handling fee').closest('div').querySelector('dd');
    expect(handling()).toHaveTextContent('€50.00');

    // No second press of Calculate: the result follows the form.
    const price = screen.getByLabelText('Price incl. VAT in euros');
    await user.clear(price);
    await user.type(price, '501');
    expect(handling()).toHaveTextContent('€150.00');

    await user.clear(price);
    await user.type(price, '250');
    expect(handling()).toHaveTextContent('€50.00');
  });
});
