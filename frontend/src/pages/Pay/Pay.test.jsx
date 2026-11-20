// The online payment page: what the customer types, what is sent, and what
// they see when it goes wrong.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, API_ERRORS } from '../../api/client';
import { startCheckout } from '../../api/payments';
import { renderWithProviders } from '../../test/utils';
import Pay from './Pay';

vi.mock('../../api/payments', () => ({ startCheckout: vi.fn() }));

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'en');
  startCheckout.mockReset();
});

describe('Pay', () => {
  it('has a labelled input and tells a screen reader about errors', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Pay />, { route: '/pay' });

    await user.click(screen.getByRole('button', { name: 'Continue to payment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your invoice number.');
    expect(screen.getByLabelText('Invoice number')).toHaveAttribute('aria-invalid', 'true');
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it('does not call the server for a number in the wrong format', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Pay />, { route: '/pay' });

    await user.type(screen.getByLabelText('Invoice number'), 'W-12345');
    await user.click(screen.getByRole('button', { name: 'Continue to payment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('starts with PLSM-');
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it('sends only the cleaned-up number', async () => {
    const user = userEvent.setup();
    // Not a Stripe address, so the page refuses to follow it and stays put.
    startCheckout.mockResolvedValue({ url: 'https://evil.example/pay' });
    renderWithProviders(<Pay />, { route: '/pay' });

    await user.type(screen.getByLabelText('Invoice number'), ' plsm-10231 ');
    await user.click(screen.getByRole('button', { name: 'Continue to payment' }));

    await waitFor(() => expect(startCheckout).toHaveBeenCalledWith('PLSM-10231'));
    expect(await screen.findByRole('alert')).toHaveTextContent('not available right now');
  });

  it('says so when no open invoice is found', async () => {
    const user = userEvent.setup();
    startCheckout.mockRejectedValue(new ApiError(API_ERRORS.UNAVAILABLE, null, 404));
    renderWithProviders(<Pay />, { route: '/pay' });

    await user.type(screen.getByLabelText('Invoice number'), 'PLSM-10231');
    await user.click(screen.getByRole('button', { name: 'Continue to payment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('could not find an open invoice');
  });

  it('shows a friendly note when the customer comes back from Stripe unpaid', () => {
    renderWithProviders(<Pay />, { route: '/pay?cancelled=1' });
    expect(screen.getByRole('status')).toHaveTextContent('nothing was charged');
  });
});
