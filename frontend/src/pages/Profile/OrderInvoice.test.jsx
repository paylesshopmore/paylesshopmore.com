// "Factuur bekijken" on a shipment: the invoice, and "Ontvangst in ons
// magazijn" - which products reached the warehouse.
//
// The server works out every number and status (backend
// warehouse/receipts.py, tested in warehouse/test_receipts.py); these tests
// check the page shows what it is sent, in Dutch, in each of the cases:
// fully received, partly received, nothing received, unknown - with and
// without an invoice, and when the server refuses (somebody else's order).

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { getOrderOverview, setHandover } from '../../api/profile';
import ShipmentDetails from './ShipmentDetails';
import OrderInvoice from './OrderInvoice';

vi.mock('../../api/profile', () => ({ getOrderOverview: vi.fn(), setHandover: vi.fn() }));

const SHIPMENT = {
  id: 7,
  tracking_number: 'PLSM-00007',
  status: 'paid',
  created_at: '2026-10-01T10:00:00Z',
  shipped_at: null,
  delivered_at: null,
  estimated_arrival: null,
  destination: 'Curaçao',
  stages: [],
};

const PRODUCTS = [
  { id: 1, name: 'Stoel', store: 'Ikea', ordered: 5, received: 3, expected: 2, status: 'partial' },
  { id: 2, name: 'Tafel', store: 'Ikea', ordered: 1, received: 1, expected: 0, status: 'received' },
  { id: 3, name: 'Lamp', store: 'Ikea', ordered: 2, received: 0, expected: 2, status: 'not_received' },
  { id: 4, name: 'Kast', store: 'Ikea', ordered: 1, received: null, expected: null, status: 'unknown' },
];

const INVOICE = {
  id: 12,
  number: 'PLSM20260012',
  dated_on: '2026-10-15',
  value_eur: '145.00',
  download_url: '/api/invoices/12/pdf/',
  lines: [
    { description: 'Zeevracht', amount: '120.00' },
    { description: 'Handling Fee', amount: '25.00' },
  ],
};

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'nl');
  getOrderOverview.mockReset();
  setHandover.mockReset();
});

/** The product row (list item) holding this product name. */
const row = (name) => screen.getByText(name).closest('li');

describe('Factuur bekijken', () => {
  it('is a button on the shipment that opens the panel, with a way back', async () => {
    getOrderOverview.mockResolvedValue({ invoice: null, products: [] });
    renderWithProviders(
      <ShipmentDetails shipment={SHIPMENT} invoices={[]} dateFormat={new Intl.DateTimeFormat('nl')} lock={null} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Factuur bekijken' }));
    expect(getOrderOverview).toHaveBeenCalledWith(7);
    expect(await screen.findByText('Ontvangst in ons magazijn')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Terug naar de zending' }));
    expect(screen.getByRole('button', { name: 'Factuur bekijken' })).toBeInTheDocument();
  });

  it('shows the invoice with its download button', async () => {
    getOrderOverview.mockResolvedValue({ invoice: INVOICE, products: PRODUCTS });
    renderWithProviders(<OrderInvoice shipment={SHIPMENT} onBack={() => {}} />);

    expect(await screen.findByText('PLSM20260012')).toBeInTheDocument();
    expect(screen.getByText('Zeevracht')).toBeInTheDocument();
    const download = screen.getByRole('link', { name: 'Factuur downloaden' });
    expect(download).toHaveAttribute('href', '/api/invoices/12/pdf/');
    expect(screen.queryByText('Je factuur is nog niet beschikbaar.')).not.toBeInTheDocument();
  });

  it('says the invoice is not available yet, and still shows every product', async () => {
    getOrderOverview.mockResolvedValue({ invoice: null, products: PRODUCTS });
    renderWithProviders(<OrderInvoice shipment={SHIPMENT} onBack={() => {}} />);

    expect(await screen.findByText('Je factuur is nog niet beschikbaar.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Factuur downloaden' })).not.toBeInTheDocument();
    for (const name of ['Stoel', 'Tafel', 'Lamp', 'Kast']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('shows ordered, received and still expected, with the status', async () => {
    getOrderOverview.mockResolvedValue({ invoice: null, products: PRODUCTS });
    renderWithProviders(<OrderInvoice shipment={SHIPMENT} onBack={() => {}} />);
    await screen.findByText('Stoel');

    // The example from the request: 5 chairs ordered, 3 registered.
    const chair = within(row('Stoel'));
    expect(chair.getByText('5 besteld · 3 ontvangen · 2 nog verwacht')).toBeInTheDocument();
    expect(chair.getByText('Gedeeltelijk ontvangen')).toBeInTheDocument();

    expect(within(row('Tafel')).getByText('Ontvangen')).toBeInTheDocument();

    const lamp = within(row('Lamp'));
    expect(lamp.getByText('2 besteld · 0 ontvangen · 2 nog verwacht')).toBeInTheDocument();
    expect(lamp.getByText('Nog niet ontvangen')).toBeInTheDocument();

    // Unknown: only what is known (ordered), never a made-up 0.
    const cupboard = within(row('Kast'));
    expect(cupboard.getByText('1 besteld')).toBeInTheDocument();
    expect(cupboard.getByText('Ontvangststatus onbekend')).toBeInTheDocument();
  });

  it('shows an older order without numbers as unknown', async () => {
    getOrderOverview.mockResolvedValue({
      invoice: null,
      products: [
        { id: 'order-3', name: 'Twee jassen', store: 'Zalando', ordered: null, received: null, expected: null, status: 'unknown' },
      ],
    });
    renderWithProviders(<OrderInvoice shipment={SHIPMENT} onBack={() => {}} />);

    await screen.findByText('Twee jassen');
    const jackets = within(row('Twee jassen'));
    expect(jackets.getByText('Ontvangststatus onbekend')).toBeInTheDocument();
    expect(jackets.queryByText(/besteld/)).not.toBeInTheDocument();
  });

  it('loads again on Vernieuwen, so a corrected count shows', async () => {
    getOrderOverview
      .mockResolvedValueOnce({ invoice: null, products: [PRODUCTS[0]] })
      .mockResolvedValueOnce({
        invoice: null,
        products: [{ ...PRODUCTS[0], received: 4, expected: 1 }],
      });
    renderWithProviders(<OrderInvoice shipment={SHIPMENT} onBack={() => {}} />);
    expect(await screen.findByText('5 besteld · 3 ontvangen · 2 nog verwacht')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Vernieuwen' }));
    expect(await screen.findByText('5 besteld · 4 ontvangen · 1 nog verwacht')).toBeInTheDocument();
    expect(getOrderOverview).toHaveBeenCalledTimes(2);
  });

  it('shows nothing of the order when the server refuses it', async () => {
    // Somebody else's shipment id: the server answers 404.
    getOrderOverview.mockRejectedValue(Object.assign(new Error('NOT_FOUND'), { status: 404 }));
    renderWithProviders(<OrderInvoice shipment={SHIPMENT} onBack={() => {}} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Dit overzicht kon niet worden geladen.');
    expect(screen.queryByText('Ontvangst in ons magazijn')).not.toBeInTheDocument();
  });
});
