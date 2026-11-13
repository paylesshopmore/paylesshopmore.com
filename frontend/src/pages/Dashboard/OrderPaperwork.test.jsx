// The paperwork of one store order on the office's Bookings page: the invoice
// (with a request button), the order confirmation (a status; the customer has to
// send it, so there is no request button) and the track-and-trace. The server decides when asking is allowed; what it
// says when it refuses is shown as written.

import { screen, within } from '@testing-library/react';
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
  confirmation_requested_at: null,
  confirmation_requested_by_name: '',
};
const INVOICE = { id: 2, kind: 'invoice', name: 'factuur-bol.pdf', url: '/api/staff/bookings/attachments/2/' };
const CONFIRMATION = {
  id: 4,
  kind: 'order_confirmation',
  name: 'orderbevestiging.pdf',
  url: '/api/staff/bookings/attachments/4/',
  created_at: '2026-11-13T10:40:00Z',
};

function show(order = ORDER, booking = BOOKING, onChanged = vi.fn()) {
  renderWithProviders(<OrderPaperwork booking={booking} order={order} onChanged={onChanged} />);
  return onChanged;
}

/**
 * The block (dt + dd) under one heading, e.g. the invoice or the confirmation.
 * Looks among the headings (<dt>, role "term") only: the same word also appears
 * in the buttons and hints.
 */
const block = (heading) =>
  within(
    screen
      .getAllByRole('term')
      .find((term) => term.textContent.startsWith(heading))
      .closest('div'),
  );

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'nl');
  requestOrderInvoice.mockReset();
});

describe('the invoice (unchanged)', () => {
  it('says it is missing, and offers to ask the customer for it', () => {
    show();
    expect(block('Factuur').getByText('Ontbreekt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Factuur opvragen' })).toBeEnabled();
  });

  it('shows the invoice the customer added, as a link, and no request button', () => {
    show({ ...ORDER, documents: [INVOICE, { id: 3, kind: 'other', name: 'x.pdf', url: '/api/x/' }] });
    const link = screen.getByRole('link', { name: 'factuur-bol.pdf' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.queryByRole('button', { name: 'Factuur opvragen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'x.pdf' })).not.toBeInTheDocument();
  });

  it('asks the customer and hands the whole booking back', async () => {
    const onChanged = show();
    requestOrderInvoice.mockResolvedValue({ id: 5, orders: [] });

    await userEvent.click(screen.getByRole('button', { name: 'Factuur opvragen' }));

    expect(requestOrderInvoice).toHaveBeenCalledWith(5, 9);
    expect(onChanged).toHaveBeenCalledWith({ id: 5, orders: [] });
  });

  it('shows who asked and when', () => {
    show({ ...ORDER, invoice_requested_at: '2026-11-12T10:00:00Z', invoice_requested_by_name: 'Ada' });
    expect(screen.getByText(/Gevraagd op .* door Ada/)).toBeInTheDocument();
  });

  it("shows the server's own reason when it refuses", async () => {
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
});

describe('the order confirmation (the customer has to send it)', () => {
  it('is not marked optional, and starts as Missing', () => {
    show();
    const card = block('Orderbevestiging');
    expect(card.getByText('Ontbreekt')).toBeInTheDocument();
    expect(card.queryByText('(optioneel)')).not.toBeInTheDocument();
  });

  it('says the customer has to send it, and has no request button', () => {
    show();
    expect(block('Orderbevestiging').getByText('De klant moet de orderbevestiging zelf versturen.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Orderbevestiging opvragen/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Stuurt de klant een melding en een e-mail met het verzoek de orderbevestiging/)).not.toBeInTheDocument();
  });

  it('stays Missing for a booking where an old request was recorded: nothing is "requested" any more', () => {
    show({ ...ORDER, confirmation_requested_at: '2026-11-13T10:40:00Z', confirmation_requested_by_name: 'Ada' });
    const card = block('Orderbevestiging');
    expect(card.getByText('Ontbreekt')).toBeInTheDocument();
    expect(card.queryByText('Gevraagd')).not.toBeInTheDocument();
  });

  it('becomes Uploaded when the customer uploaded it, with a view button and the date', () => {
    show({ ...ORDER, documents: [CONFIRMATION] });

    const card = block('Orderbevestiging');
    expect(card.getByText('Geüpload')).toBeInTheDocument();
    const view = screen.getByRole('link', { name: 'Orderbevestiging bekijken' });
    expect(view).toHaveAttribute('target', '_blank');
    expect(view).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(card.getByText(/Geüpload op/)).toBeInTheDocument();
    expect(card.queryByText('De klant moet de orderbevestiging zelf versturen.')).not.toBeInTheDocument();
  });

  it('does not treat the invoice as the confirmation', () => {
    show({ ...ORDER, documents: [INVOICE] });
    expect(block('Orderbevestiging').getByText('Ontbreekt')).toBeInTheDocument();
  });

  it('a confirmation alone leaves the invoice missing', () => {
    show({ ...ORDER, documents: [CONFIRMATION] });
    expect(block('Factuur').getByText('Ontbreekt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Factuur opvragen' })).toBeEnabled();
  });
});

describe('the track-and-trace', () => {
  it('shows the code', () => {
    show({ ...ORDER, tracking_code: '3SABC1234567' });
    expect(screen.getByText('3SABC1234567')).toBeInTheDocument();
  });

  it('says "not given" when the customer did not fill it in', () => {
    show();
    expect(screen.getAllByText('Niet opgegeven')).toHaveLength(1);
  });

  it('turns a web address into a link, and never anything else', () => {
    show({ ...ORDER, tracking_code: 'https://jouw.postnl.nl/track?B=3SABC' });
    expect(screen.getByRole('link', { name: 'https://jouw.postnl.nl/track?B=3SABC' })).toBeInTheDocument();
  });

  it('shows a script address as plain text, not a link', () => {
    const { container } = renderWithProviders(
      <OrderPaperwork booking={BOOKING} order={{ ...ORDER, tracking_code: 'javascript:alert(1)' }} onChanged={vi.fn()} />,
    );
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
  });
});
