// The paperwork of one store order on the office's Bookings page: the invoice
// the customer added (or a button to ask for it), the webshop's order number and
// the track-and-trace. The server decides when asking is allowed; what it says
// when it refuses is shown as written.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestOrderInvoice } from '../../api/staff';
import { renderWithProviders } from '../../test/utils';
import OrderPaperwork from './OrderPaperwork';

vi.mock('../../api/staff', () => ({ requestOrderInvoice: vi.fn() }));

const BOOKING = { id: 5, status: 'confirmed', account: { id: 1, name: 'Klaas', email: 'k@example.com' } };
const ORDER = {
  id: 9,
  shop_name: 'Bol.com',
  description: 'Laptop',
  documents: [],
  order_number: '',
  tracking_code: '',
  invoice_requested_at: null,
  invoice_requested_by_name: '',
};
const INVOICE = { id: 2, kind: 'invoice', name: 'factuur-bol.pdf', url: '/api/staff/bookings/attachments/2/' };

function show(order = ORDER, booking = BOOKING, onChanged = vi.fn()) {
  renderWithProviders(<OrderPaperwork booking={booking} order={order} onChanged={onChanged} />);
  return onChanged;
}

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'nl');
  requestOrderInvoice.mockReset();
});

describe('the invoice', () => {
  it('says it is missing, and offers to ask the customer for it', () => {
    show();
    expect(screen.getByText('Factuur')).toBeInTheDocument();
    expect(screen.getByText('Ontbreekt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Factuur opvragen' })).toBeEnabled();
  });

  it('shows the invoice the customer added, as a link, and no request button', () => {
    show({ ...ORDER, documents: [INVOICE, { id: 3, kind: 'other', name: 'x.pdf', url: '/api/x/' }] });
    const link = screen.getByRole('link', { name: 'factuur-bol.pdf' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.queryByText('Ontbreekt')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Factuur opvragen' })).not.toBeInTheDocument();
    // Other documents (the order confirmation, ...) are not the invoice.
    expect(screen.queryByRole('link', { name: 'x.pdf' })).not.toBeInTheDocument();
  });

  it('asks the customer and hands the whole booking back', async () => {
    const onChanged = show();
    requestOrderInvoice.mockResolvedValue({ id: 5, orders: [] });

    await userEvent.click(screen.getByRole('button', { name: 'Factuur opvragen' }));

    expect(requestOrderInvoice).toHaveBeenCalledWith(5, 9);
    expect(onChanged).toHaveBeenCalledWith({ id: 5, orders: [] });
  });

  it('shows who asked and when, once it has been asked', () => {
    show({ ...ORDER, invoice_requested_at: '2026-11-12T10:00:00Z', invoice_requested_by_name: 'Ada' });
    expect(screen.getByText(/Gevraagd op .* door Ada/)).toBeInTheDocument();
  });

  it("shows the server's own reason when it refuses (for example: already asked today)", async () => {
    show();
    requestOrderInvoice.mockRejectedValue(
      Object.assign(new Error('VALIDATION'), {
        status: 400,
        fields: { detail: ['The customer was already asked for this invoice in the last 24 hours.'] },
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Factuur opvragen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already asked for this invoice');
  });

  it('says so when it cannot be asked: no customer account, or the booking is closed', () => {
    const { unmount } = renderWithProviders(
      <OrderPaperwork booking={{ ...BOOKING, account: null }} order={ORDER} onChanged={vi.fn()} />,
    );
    expect(screen.getByText(/geen klantaccount/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Factuur opvragen' })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(
      <OrderPaperwork booking={{ ...BOOKING, status: 'shipped' }} order={ORDER} onChanged={vi.fn()} />,
    );
    expect(screen.getByText(/verzonden of geannuleerd/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Factuur opvragen' })).not.toBeInTheDocument();
  });
});

describe('the order number and the track-and-trace', () => {
  it('shows both, marked optional', () => {
    show({ ...ORDER, order_number: '1234567890', tracking_code: '3SABC1234567' });
    expect(screen.getByText('1234567890')).toBeInTheDocument();
    expect(screen.getByText('3SABC1234567')).toBeInTheDocument();
    expect(screen.getAllByText('(optioneel)')).toHaveLength(2);
  });

  it('says "not given" when the customer did not fill them in', () => {
    show();
    expect(screen.getAllByText('Niet opgegeven')).toHaveLength(2);
  });

  it('turns a web address into a link, and never anything else', () => {
    show({ ...ORDER, tracking_code: 'https://jouw.postnl.nl/track?B=3SABC' });
    expect(screen.getByRole('link', { name: 'https://jouw.postnl.nl/track?B=3SABC' })).toBeInTheDocument();
  });

  it('shows a script address as plain text, not a link', () => {
    const { container } = renderWithProviders(
      <OrderPaperwork
        booking={BOOKING}
        order={{ ...ORDER, tracking_code: 'javascript:alert(1)', order_number: '<img src=x onerror=alert(1)>' }}
        onChanged={vi.fn()}
      />,
    );
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    // The order number is plain text too: it is whatever the customer typed.
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
