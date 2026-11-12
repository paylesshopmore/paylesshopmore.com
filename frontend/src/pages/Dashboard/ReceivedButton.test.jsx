// "Bestelling ontvangen" / "Product ontvangen" on a booking in the office
// dashboard: only an admin gets the button; it sends the right call and
// hands the whole booking back.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markOrderReceived, markProductReceived } from '../../api/staff';
import { AuthContext } from '../../auth/context';
import { LanguageProvider } from '../../i18n/LanguageContext';
import ReceivedButton from './ReceivedButton';

vi.mock('../../api/staff', () => ({ markOrderReceived: vi.fn(), markProductReceived: vi.fn() }));

function show(ui, user) {
  return render(
    <LanguageProvider>
      <AuthContext.Provider value={{ user }}>{ui}</AuthContext.Provider>
    </LanguageProvider>,
  );
}

const ADMIN = { isAdmin: true };
const OFFICE = { isAdmin: false };

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'nl');
  markOrderReceived.mockReset();
  markProductReceived.mockReset();
});

describe('ReceivedButton', () => {
  it('lets an admin mark a whole store order as received', async () => {
    const onChanged = vi.fn();
    markOrderReceived.mockResolvedValue({ id: 5 });
    show(<ReceivedButton kind="order" bookingId={5} row={{ id: 9 }} onChanged={onChanged} />, ADMIN);

    await userEvent.click(screen.getByRole('button', { name: 'Bestelling ontvangen' }));
    expect(markOrderReceived).toHaveBeenCalledWith(5, 9, true);
    expect(onChanged).toHaveBeenCalledWith({ id: 5 });
  });

  it('lets an admin mark one product as received', async () => {
    markProductReceived.mockResolvedValue({ id: 5 });
    show(<ReceivedButton kind="product" bookingId={5} row={{ id: 3 }} onChanged={() => {}} />, ADMIN);
    await userEvent.click(screen.getByRole('button', { name: 'Product ontvangen' }));
    expect(markProductReceived).toHaveBeenCalledWith(5, 3, true);
  });

  it('shows who confirmed it and lets the admin undo it after asking', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    markProductReceived.mockResolvedValue({ id: 5 });
    const row = { id: 3, received_at: '2026-11-12T10:00:00Z', received_by_name: 'Ada' };
    show(<ReceivedButton kind="product" bookingId={5} row={row} onChanged={() => {}} />, ADMIN);

    expect(screen.getByText(/Ontvangen - Ada/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ongedaan maken' }));
    expect(markProductReceived).toHaveBeenCalledWith(5, 3, false);
  });

  it('gives other office accounts no button', () => {
    const { container } = show(
      <ReceivedButton kind="order" bookingId={5} row={{ id: 9 }} onChanged={() => {}} />,
      OFFICE,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows other office accounts who confirmed it, without a button', () => {
    const row = { id: 9, received_at: '2026-11-12T10:00:00Z', received_by_name: 'Ada' };
    show(<ReceivedButton kind="order" bookingId={5} row={row} onChanged={() => {}} />, OFFICE);
    expect(screen.getByText(/Hele bestelling ontvangen - Ada/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ReceivedButton refusals', () => {
  it("shows the server's own reason instead of guessing", async () => {
    markOrderReceived.mockRejectedValue(
      Object.assign(new Error('UNAUTHENTICATED'), { status: 403, fields: { detail: 'CSRF Failed: token missing.' } }),
    );
    show(<ReceivedButton kind="order" bookingId={5} row={{ id: 9 }} onChanged={() => {}} />, ADMIN);
    await userEvent.click(screen.getByRole('button', { name: 'Bestelling ontvangen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CSRF Failed: token missing.');
  });
});
