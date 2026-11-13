// The booking form's two modes: the normal form unchanged, and the guided form
// - one step at a time, Continue checks only that step, Back and Edit keep
// everything, and it sends the same booking through the same request.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitBooking } from '../../api/booking';
import { renderWithProviders } from '../../test/utils';
import Booking from './Booking';

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
    user: { firstName: 'Klaas', lastName: 'Klant', email: 'klant@example.com', phone: '+31 6 1234 5678', name: 'Klaas Klant' },
    isAuthenticated: true,
    isChecking: false,
  }),
}));
vi.mock('../../api/booking', async (importOriginal) => ({
  ...(await importOriginal()),
  submitBooking: vi.fn(),
}));
vi.mock('../../api/shops', () => ({
  listShops: vi.fn().mockResolvedValue([{ id: 3, name: 'bol.com' }]),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem('plsm.language', 'en');
  window.sessionStorage.clear();
});

const field = (name) => document.querySelector(`[name="${name}"]`);

async function chooseGuided(user) {
  renderWithProviders(<Booking />, { route: '/booking' });
  await user.click(screen.getByRole('radio', { name: /Guided form/ }));
}

async function fillToReview(user) {
  // 1 Shipment: defaults are fine.
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  // 2 Sender: filled from the account; add the address.
  await user.type(field('sender_address'), 'Hertzstraat 10');
  await user.type(field('sender_postal_code'), '2652 XX');
  await user.type(field('sender_city'), 'Berkel');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  // 3 Recipient.
  await user.type(field('recipient_first_name'), 'Maria');
  await user.type(field('recipient_last_name'), 'Martina');
  await user.type(field('recipient_address'), 'Kaya Grandi 24');
  await user.type(field('recipient_city'), 'Willemstad');
  await user.type(field('recipient_phone'), '+599 9 512 4433');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  // 4 Consignment.
  await screen.findByRole('option', { name: 'bol.com' });
  await user.selectOptions(screen.getByLabelText('Store'), '3');
  await user.type(screen.getByLabelText('What did you order?'), 'Laptop');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  // 5 Options.
  await user.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('booking modes', () => {
  it('opens on the normal form with every section on one page', () => {
    renderWithProviders(<Booking />, { route: '/booking' });
    expect(screen.getByRole('radio', { name: /Normal form/ })).toBeChecked();
    expect(field('sender_first_name')).toBeInTheDocument();
    expect(field('recipient_first_name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send booking' })).toBeInTheDocument();
  });

  it('shows one step at a time with where you are', async () => {
    const user = userEvent.setup();
    await chooseGuided(user);

    expect(screen.getByText('Step 1 of 6: Shipment')).toBeInTheDocument();
    expect(field('sender_first_name')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send booking' })).toBeNull();
  });

  it('will not continue past a step with something missing', async () => {
    const user = userEvent.setup();
    await chooseGuided(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Sender: the address is missing.
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Step 2 of 6: Sender')).toBeInTheDocument();
    expect(field('sender_address')).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not let the progress bar skip ahead', async () => {
    const user = userEvent.setup();
    await chooseGuided(user);
    // Only the current step is reachable at the start: no buttons to jump.
    const progress = screen.getByRole('navigation', { name: 'Booking steps' });
    expect(within(progress).queryAllByRole('button')).toHaveLength(0);
  });

  it('keeps everything when going back, and Edit opens the right step', async () => {
    const user = userEvent.setup();
    await chooseGuided(user);
    await fillToReview(user);

    expect(screen.getByText('Step 6 of 6: Review')).toBeInTheDocument();
    expect(screen.getByText('Maria Martina')).toBeInTheDocument();
    expect(screen.getByText(/bol.com · Laptop/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit: Recipient' }));
    expect(field('recipient_city')).toHaveValue('Willemstad');
    await user.clear(field('recipient_city'));
    await user.type(field('recipient_city'), 'Punda');
    await user.click(screen.getByRole('button', { name: /6\s*Review/ }));

    expect(screen.getByText('Kaya Grandi 24, Punda')).toBeInTheDocument();
  });

  it('sends the same booking as the normal form, once', async () => {
    const user = userEvent.setup();
    let finish;
    submitBooking.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await chooseGuided(user);
    await fillToReview(user);

    await user.click(screen.getByRole('checkbox', { name: /I agree/ }));
    const send = screen.getByRole('button', { name: 'Send booking' });
    await user.click(send);
    await user.click(send); // a double-click while the first is on its way

    expect(submitBooking).toHaveBeenCalledTimes(1);
    const [booking, orders] = submitBooking.mock.calls[0];
    expect(booking).toMatchObject({
      freight: 'sea',
      destination: 'CW',
      sender_first_name: 'Klaas',
      recipient_city: 'Willemstad',
      agreed_terms: true,
      signature_name: 'Klaas Klant',
    });
    expect(orders).toEqual([
      {
        shop: 3,
        description: 'Laptop',
        products: [{ description: 'Laptop', url: '' }],
      },
    ]);

    finish({ id: 41 });
    expect(await screen.findByText('PLSM-0000041')).toBeInTheDocument();
  });

  it('keeps what was typed when switching back to the normal form', async () => {
    const user = userEvent.setup();
    await chooseGuided(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(field('sender_address'), 'Hertzstraat 10');
    await user.click(screen.getByRole('radio', { name: /Normal form/ }));

    expect(field('sender_address')).toHaveValue('Hertzstraat 10');
    expect(field('recipient_first_name')).toBeInTheDocument();
  });
});
