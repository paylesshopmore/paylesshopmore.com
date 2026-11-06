// Tying goods to customers: the "Without a customer" queue and the page that
// finds the customer. The server enforces the rules (backend
// warehouse/test_customers.py); these pin what the pages let people do.
//
// Worth pinning: nothing is linked until "Yes, these are X's goods"; a name
// match is flagged; the chosen shipment or booking is what is sent; a manager
// changing a customer must give a reason; a worker cannot change one; and
// "nothing found" leaves the goods in the queue.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assignIntakeCustomer,
  getIntakeSheet,
  listIntakeSheets,
  lookupCustomers,
} from '../../api/staff';
import { renderWithProviders } from '../../test/utils';
import AssignCustomer from './AssignCustomer';
import UnassignedQueue from './UnassignedQueue';

vi.mock('../../api/staff', () => ({
  assignIntakeCustomer: vi.fn(),
  getIntakeSheet: vi.fn(),
  listIntakeSheets: vi.fn(),
  lookupCustomers: vi.fn(),
}));

const auth = { user: null };
vi.mock('../../auth/useAuth', () => ({ useAuth: () => auth }));

const WORKER = { id: 7, role: 'warehouse', isWarehouse: true };
const MANAGER = { id: 3, role: 'manager', isWarehouseManager: true, canManageWarehouse: true };

const SHEET = {
  id: 41,
  reference: 'BOX-77',
  supplier: 'Bol.com',
  sender: '',
  recipient: 'K. Klant',
  destination: 'Curaçao',
  notes: '',
  customer: null,
};

const KLAAS = {
  id: 12,
  name: 'Klaas Klant',
  customer_code: 'PLSM-C00012',
  email: 'k***@example.com',
  city: 'Willemstad',
  country: 'CW',
  matched_by: ['tracking_number'],
  exact: true,
  open_shipments: [{ id: 5, tracking_number: 'PLS-3001', stage: 'awaiting_pickup', stage_display: 'Package expected' }],
  open_bookings: [{ id: 9, shipping_number: 'PLSM-00042', destination: 'Curaçao', status: 'new' }],
};

const KARIN = {
  ...KLAAS,
  id: 13,
  name: 'Karin Klant',
  customer_code: 'PLSM-C00013',
  matched_by: ['name'],
  exact: false,
  open_shipments: [],
  open_bookings: [],
};

function renderAssign() {
  return renderWithProviders(
    <Routes>
      <Route path="/warehouse/assign/:sheetId" element={<AssignCustomer />} />
      <Route path="/warehouse/unassigned" element={<p>The queue</p>} />
    </Routes>,
    { route: '/warehouse/assign/41' },
  );
}

async function searchFor(user, text) {
  await user.type(await screen.findByLabelText('Search for the customer'), text);
  await user.click(screen.getByRole('button', { name: 'Search' }));
}

beforeEach(() => {
  auth.user = WORKER;
  getIntakeSheet.mockReset().mockResolvedValue(SHEET);
  lookupCustomers.mockReset().mockResolvedValue({ results: [KLAAS], too_many: false });
  assignIntakeCustomer.mockReset().mockResolvedValue({ ...SHEET, customer: { id: 12, name: 'Klaas Klant' } });
  listIntakeSheets.mockReset();
});

describe('finding the customer', () => {
  it('shows what is on the goods, to recognise the customer by', async () => {
    renderAssign();
    const facts = await screen.findByRole('region', { name: /On the goods/ });
    expect(facts).toHaveTextContent('Bol.com');
    expect(facts).toHaveTextContent('K. Klant');
  });

  it('lists who was found and how, and links nothing yet', async () => {
    const user = userEvent.setup();
    renderAssign();

    await searchFor(user, 'PLS-3001');

    expect(lookupCustomers).toHaveBeenCalledWith('PLS-3001');
    const results = screen.getByRole('list', { name: 'Search for the customer' });
    expect(results).toHaveTextContent('Klaas Klant · PLSM-C00012');
    expect(results).toHaveTextContent('Found by tracking number');
    expect(within(results).getByText('Exact match')).toBeInTheDocument();
    expect(assignIntakeCustomer).not.toHaveBeenCalled();
  });

  it('flags a match on name alone', async () => {
    const user = userEvent.setup();
    lookupCustomers.mockResolvedValue({ results: [KARIN], too_many: false });
    renderAssign();

    await searchFor(user, 'klant');

    expect(screen.getByText('Name only - check carefully')).toBeInTheDocument();
  });

  it('says so when nobody is found, and offers to leave it in the queue', async () => {
    const user = userEvent.setup();
    lookupCustomers.mockResolvedValue({ results: [], too_many: false });
    renderAssign();

    await searchFor(user, 'nobody');

    expect(screen.getByText(/No customer found for "nobody"/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Leave it in the queue' })).toHaveAttribute(
      'href',
      '/warehouse/unassigned',
    );
  });
});

describe('confirming', () => {
  it('links the goods only on "Yes", with the chosen shipment and how they were found', async () => {
    const user = userEvent.setup();
    renderAssign();
    await searchFor(user, 'PLS-3001');

    await user.click(screen.getByRole('button', { name: 'Choose' }));
    expect(assignIntakeCustomer).not.toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: /Shipment PLS-3001/ }));
    await user.click(screen.getByRole('button', { name: 'Yes, these are Klaas Klant’s goods' }));

    expect(assignIntakeCustomer).toHaveBeenCalledWith(41, {
      customer: 12,
      package: 5,
      matched_by: 'tracking number: PLS-3001',
    });
    expect(await screen.findByText('The goods are now under Klaas Klant.')).toBeInTheDocument();
  });

  it('can put them with a booking, or with nothing but the customer', async () => {
    const user = userEvent.setup();
    renderAssign();
    await searchFor(user, 'PLS-3001');
    await user.click(screen.getByRole('button', { name: 'Choose' }));

    expect(screen.getByRole('radio', { name: /Just this customer/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Booking PLSM-00042/ }));
    await user.click(screen.getByRole('button', { name: /Yes, these are/ }));

    expect(assignIntakeCustomer).toHaveBeenCalledWith(41, expect.objectContaining({ booking: 9 }));
    expect(assignIntakeCustomer.mock.calls[0][1]).not.toHaveProperty('package');
  });

  it('"Choose someone else" goes back to the results', async () => {
    const user = userEvent.setup();
    renderAssign();
    await searchFor(user, 'PLS-3001');
    await user.click(screen.getByRole('button', { name: 'Choose' }));

    await user.click(screen.getByRole('button', { name: 'Choose someone else' }));

    expect(screen.getByRole('button', { name: 'Choose' })).toBeInTheDocument();
  });

  it('says what went wrong', async () => {
    const user = userEvent.setup();
    assignIntakeCustomer.mockRejectedValue({ status: 409 });
    renderAssign();
    await searchFor(user, 'PLS-3001');
    await user.click(screen.getByRole('button', { name: 'Choose' }));
    await user.click(screen.getByRole('button', { name: /Yes, these are/ }));

    expect(await screen.findByText('This sheet has gone to the office. Reopen it first.')).toBeInTheDocument();
  });
});

describe('goods that already have a customer', () => {
  beforeEach(() => {
    getIntakeSheet.mockResolvedValue({ ...SHEET, customer: { id: 13, name: 'Karin Klant', customer_code: 'PLSM-C00013' } });
  });

  it('a worker is told only a manager can change it', async () => {
    renderAssign();
    expect(
      await screen.findByText('These goods are already under Karin Klant. Only a manager can change that.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Search for the customer')).toBeNull();
  });

  it('a manager must say why before confirming', async () => {
    const user = userEvent.setup();
    auth.user = MANAGER;
    renderAssign();
    await searchFor(user, 'PLS-3001');
    await user.click(screen.getByRole('button', { name: 'Choose' }));

    const yes = screen.getByRole('button', { name: /Yes, these are/ });
    expect(yes).toBeDisabled();
    await user.type(screen.getByLabelText('Why is the customer being changed?'), 'Wrong Klant');
    expect(yes).toBeEnabled();
    await user.click(yes);

    expect(assignIntakeCustomer).toHaveBeenCalledWith(41, expect.objectContaining({ reason: 'Wrong Klant' }));
  });
});

describe('the queue', () => {
  it('lists the goods without a customer, each one a tap from finding it', async () => {
    listIntakeSheets.mockResolvedValue({
      results: [{ id: 41, reference: 'BOX-77', supplier: 'Bol.com', recipient: 'K. Klant', colli_count: 2, created_at: '2026-11-06T08:00:00Z' }],
      count: 1,
      hasNext: false,
      hasPrevious: false,
    });
    renderWithProviders(<UnassignedQueue />, { route: '/warehouse/unassigned' });

    const link = await screen.findByRole('link', { name: /BOX-77/ });
    expect(link).toHaveAttribute('href', '/warehouse/assign/41');
    expect(link).toHaveTextContent('Bol.com · K. Klant · 2 colli');
    expect(listIntakeSheets).toHaveBeenCalledWith({ unassigned: 'true', page: 1 });
  });

  it('says when there is nothing to do', async () => {
    listIntakeSheets.mockResolvedValue({ results: [], count: 0, hasNext: false, hasPrevious: false });
    renderWithProviders(<UnassignedQueue />, { route: '/warehouse/unassigned' });
    expect(
      await screen.findByText('Everything that came in has a customer. Nothing to do here.'),
    ).toBeInTheDocument();
  });

  it('offers to try again when it cannot load', async () => {
    const user = userEvent.setup();
    listIntakeSheets.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
      results: [],
      count: 0,
      hasNext: false,
      hasPrevious: false,
    });
    renderWithProviders(<UnassignedQueue />, { route: '/warehouse/unassigned' });

    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(listIntakeSheets).toHaveBeenCalledTimes(2));
  });
});
