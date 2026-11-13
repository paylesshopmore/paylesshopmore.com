// The invoice editor page, end to end in the browser with the API mocked.
//
// Follows what an employee does: find the shipment, add charges, check the
// totals with "Bereken factuur", save - and the guard rails: no second
// invoice for a shipment, a confirmation before clearing, adjustments only
// for admins.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import InvoiceEditor from './InvoiceEditor';
import * as api from '../../../api/invoiceEditor';
import { listPackages } from '../../../api/staff';

vi.mock('../../../api/invoiceEditor', async (importOriginal) => ({
  ...(await importOriginal()),
  getInvoiceConfig: vi.fn(),
  getShipmentDefaults: vi.fn(),
  getInvoiceForEditing: vi.fn(),
  getInvoiceHistory: vi.fn(),
  calculateInvoice: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
}));
vi.mock('../../../api/staff', async (importOriginal) => ({
  ...(await importOriginal()),
  listPackages: vi.fn(),
  listCustomers: vi.fn(),
}));

function config({ admin = false } = {}) {
  return {
    settings: {
      number_prefix: 'PLSM', number_include_year: true, number_digits: 4, next_number: 'PLSM20260012',
      standard_vat_rate: '21.00', export_vat_rate: '0.00',
      insurance_rate_percent: null, insurance_minimum: null,
      payment_instructions: 'Vermeld {zendingsnummer}.', terms_intro: 'Voorwaarden van {bedrijf}:',
      terms_items: 'De Fenex-condities', exclusions_title: 'Niet inbegrepen:', exclusions_items: 'Opslag',
      export_vat_note: '0% export', footer_text: 'Kleine letters',
    },
    ports: [
      { id: 1, name: 'Rotterdam, NL', freight: 'sea', for_loading: true, for_discharge: false, is_default: true, active: true },
      { id: 2, name: 'Amsterdam Schiphol, NL', freight: 'air', for_loading: true, for_discharge: false, is_default: true, active: true },
      { id: 3, name: 'Willemstad, CUR', freight: 'sea', for_loading: false, for_discharge: true, is_default: true, active: true },
      { id: 4, name: 'Curaçao Airport (CUR)', freight: 'air', for_loading: false, for_discharge: true, is_default: true, active: true },
    ],
    charge_types: [
      { id: 1, name: 'Zeevracht', freight: 'sea', default_amount: null, active: true },
      { id: 2, name: 'Bunkertoeslag', freight: 'sea', default_amount: null, active: true },
      { id: 3, name: 'Luchtvracht', freight: 'air', default_amount: null, active: true },
      { id: 4, name: 'Administratie', freight: 'both', default_amount: '35.00', active: true },
    ],
    company: { name: 'Pay Less Shop More', street: 'Hertzstraat 10', postcode_city: '2652 XX', kvk: '1', vat: 'NL1', iban: 'NL79', email: 'a@b.nl', website: 'x.nl', phone: '' },
    permissions: { can_configure: admin, can_adjust: admin, can_delete: admin },
  };
}

const DEFAULTS = {
  customer: { id: 12, name: 'John Smith' },
  package: 100,
  bill_to: 'John Smith\nKaya Grandi 1',
  phone: '+599 9 123 4567',
  relation_number: 'PLSM0012',
  order_number: 'PLSM-1001',
  shipment_number: 'CIT-SE-006648',
  freight: 'sea',
  port_of_loading: 'Rotterdam, NL',
  port_of_discharge: 'Willemstad, CUR',
  goods_description: 'Een televisie',
  pieces: 2,
  weight_kg: '199.00',
  volume_m3: '1.550',
  insured_value: null,
  existing_invoice: null,
  next_number: 'PLSM20260012',
};

function renderEditor(route = '/dashboard/invoices/new') {
  return renderWithProviders(
    <Routes>
      <Route path="/dashboard/invoices/new" element={<InvoiceEditor />} />
      <Route path="/dashboard/invoices/:id/edit" element={<InvoiceEditor />} />
      <Route path="/dashboard/invoices" element={<p>Facturenlijst</p>} />
    </Routes>,
    { route },
  );
}

/** Find John's shipment by its shipment number and pick it. */
async function pickShipment(user) {
  await user.click(await screen.findByRole('combobox', { name: 'Shipment number' }));
  await user.click(await screen.findByRole('option', { name: /PLSM-1001/ }));
  await screen.findByDisplayValue('CIT-SE-006648');
}

describe('InvoiceEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getInvoiceConfig.mockResolvedValue(config());
    api.getShipmentDefaults.mockResolvedValue(DEFAULTS);
    api.getInvoiceHistory.mockResolvedValue([]);
    listPackages.mockResolvedValue({
      results: [{ id: 100, tracking_number: 'PLSM-1001', customer: { name: 'John Smith' }, description: 'TV', invoice: null }],
    });
  });

  it('opens from a booking with the shipment and the warehouse measurements filled in', async () => {
    api.getShipmentDefaults.mockResolvedValue({
      ...DEFAULTS,
      pieces: 3,
      weight_kg: '225.0',
      measurements: [
        { length_cm: '60.0', width_cm: '40.0', height_cm: '40.0', count: 2 },
        { length_cm: '120.0', width_cm: '80.0', height_cm: '100.0', count: 1 },
      ],
      measured_by_warehouse: 'intake',
    });

    renderEditor('/dashboard/invoices/new?package=100');

    await screen.findByDisplayValue('CIT-SE-006648');
    expect(api.getShipmentDefaults).toHaveBeenCalledWith(100);
    expect(screen.getByText(/from the warehouse’s measurements/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('225,0')).toBeInTheDocument();
  });

  it('fills the form from the chosen shipment', async () => {
    const user = userEvent.setup();
    renderEditor();

    await pickShipment(user);

    expect(api.getShipmentDefaults).toHaveBeenCalledWith(100);
    expect(screen.getByDisplayValue('Een televisie')).toBeInTheDocument();
    expect(screen.getByLabelText('Port of discharge')).toHaveValue('Willemstad, CUR');
    // The live preview shows the shipment too.
    const sheet = screen.getByRole('article', { name: /Factuur PLSM20260012/ });
    expect(within(sheet).getByText('CIT-SE-006648')).toBeInTheDocument();
  });

  it('offers sea charges for sea freight and air charges for air freight', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByText('New invoice');

    expect(screen.getByRole('button', { name: '+ Bunkertoeslag' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Luchtvracht' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Shipping method'), 'air');

    expect(screen.queryByRole('button', { name: '+ Bunkertoeslag' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Luchtvracht' })).toBeInTheDocument();
    expect(screen.getByLabelText('Airport of discharge')).toHaveValue('Curaçao Airport (CUR)');
  });

  it('updates the totals as amounts are typed', async () => {
    const user = userEvent.setup();
    renderEditor();
    await pickShipment(user);

    await user.click(screen.getByRole('button', { name: '+ Zeevracht' }));
    await user.type(screen.getByRole('textbox', { name: 'Charge 1 amount' }), '850');
    // Administratie comes with its default amount of € 35.
    await user.click(screen.getByRole('button', { name: '+ Administratie' }));

    expect(screen.getByTestId('summary-subtotal')).toHaveTextContent('€ 885,00');
    // Not verified as export: 21% VAT.
    expect(screen.getByTestId('summary-vat')).toHaveTextContent('€ 185,85');
    expect(screen.getByTestId('summary-total')).toHaveTextContent('€ 1.070,85');

    await user.click(screen.getByLabelText(/Export outside the EU verified/));

    expect(screen.getByTestId('summary-vat')).toHaveTextContent('€ 0,00');
    expect(screen.getByTestId('summary-total')).toHaveTextContent('€ 885,00');
    // The printable preview agrees with the summary.
    expect(screen.getByTestId('sheet-total')).toHaveTextContent('€ 885,00');
  });

  it('"Bereken factuur" confirms the server gets the same totals', async () => {
    const user = userEvent.setup();
    api.calculateInvoice.mockResolvedValue({
      totals: { subtotal: '885.00', adjustments: '0.00', total_excl: '885.00', vat: '0.00', total: '885.00' },
    });
    renderEditor();
    await pickShipment(user);
    await user.click(screen.getByRole('button', { name: '+ Zeevracht' }));
    await user.type(screen.getByRole('textbox', { name: 'Charge 1 amount' }), '850');
    await user.click(screen.getByRole('button', { name: '+ Administratie' }));
    await user.click(screen.getByLabelText(/Export outside the EU verified/));

    await user.click(screen.getByRole('button', { name: 'Calculate invoice' }));

    expect(await screen.findByText(/the server calculates exactly the same amounts/)).toBeInTheDocument();
  });

  it('shows what is missing instead of saving an incomplete invoice', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByText('New invoice');

    await user.click(screen.getByRole('button', { name: 'Save invoice' }));

    expect(await screen.findByText('Please check the form:')).toBeInTheDocument();
    expect(screen.getAllByText(/Choose a customer and a shipment first/).length).toBeGreaterThan(0);
    expect(api.createInvoice).not.toHaveBeenCalled();
  });

  it('saves the invoice with the Dutch amounts converted', async () => {
    const user = userEvent.setup();
    api.createInvoice.mockResolvedValue({ id: 7 });
    api.getInvoiceForEditing.mockResolvedValue({
      id: 7, number: 'PLSM20260012', status: 'pending_review', editable: true, customer: 12,
      customer_name: 'John Smith', package: 100, invoice_date: '2026-10-07', ...DEFAULTS,
      measurements: [], own_risk: null, insurance_fee: null, export_verified: false,
      lines: [{ kind: 'charge', description: 'Zeevracht', amount: '1370.48' }], texts: config().settings,
    });
    renderEditor();
    await pickShipment(user);
    await user.click(screen.getByRole('button', { name: '+ Zeevracht' }));
    await user.type(screen.getByRole('textbox', { name: 'Charge 1 amount' }), '1.370,48');

    await user.click(screen.getByRole('button', { name: 'Save invoice' }));

    await waitFor(() => expect(api.createInvoice).toHaveBeenCalled());
    expect(api.createInvoice.mock.calls[0][0]).toMatchObject({
      customer: 12,
      package: 100,
      status: 'pending_review',
      weight_kg: '199,00'.replace(',', '.'),
      lines: [{ kind: 'charge', description: 'Zeevracht', amount: '1370.48' }],
    });
    expect(await screen.findByText(/Invoice PLSM20260012 has been saved/)).toBeInTheDocument();
  });

  it('refuses a second invoice for a shipment and offers the existing one', async () => {
    const user = userEvent.setup();
    api.getShipmentDefaults.mockResolvedValue({
      ...DEFAULTS,
      existing_invoice: { id: 3, number: 'PLSM20260003', status: 'sent' },
    });
    renderEditor();
    await pickShipment(user);

    expect(screen.getByText(/already has an invoice \(PLSM20260003\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open existing invoice' })).toHaveAttribute(
      'href',
      '/dashboard/invoices/3/edit',
    );
    expect(screen.getByRole('button', { name: 'Save invoice' })).toBeDisabled();
  });

  it('asks before clearing a filled-in form', async () => {
    const user = userEvent.setup();
    renderEditor();
    await pickShipment(user);

    await user.click(screen.getByRole('button', { name: 'Clear form' }));
    const dialog = screen.getByRole('dialog', { name: 'Clear the form?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByDisplayValue('CIT-SE-006648')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear form' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByDisplayValue('CIT-SE-006648')).not.toBeInTheDocument();
  });

  it('lets only an admin add a contractual adjustment', async () => {
    renderEditor();
    await screen.findByText('New invoice');
    expect(screen.queryByRole('button', { name: '+ Add adjustment' })).not.toBeInTheDocument();
    expect(screen.getByText(/Only an admin can add or change this/)).toBeInTheDocument();
  });

  it('an admin can add a negative adjustment and sees a credit', async () => {
    const user = userEvent.setup();
    api.getInvoiceConfig.mockResolvedValue(config({ admin: true }));
    renderEditor();
    await pickShipment(user);
    await user.click(screen.getByRole('button', { name: '+ Zeevracht' }));
    await user.type(screen.getByRole('textbox', { name: 'Charge 1 amount' }), '100');
    await user.click(screen.getByLabelText(/Export outside the EU verified/));

    await user.click(screen.getByRole('button', { name: '+ Add adjustment' }));
    await user.type(screen.getByRole('textbox', { name: 'Adjustment 1 amount' }), '-150');

    expect(screen.getByTestId('summary-total')).toHaveTextContent('-€ 50,00');
    expect(screen.getByText('Credit amount (to be paid to the customer)')).toBeInTheDocument();
  });

  it('starts a new invoice at the next number, and the number can be changed', async () => {
    const user = userEvent.setup();
    renderEditor();
    await pickShipment(user);

    const box = screen.getByLabelText('Invoice number');
    expect(box).toHaveValue('PLSM20260012'); // the next number, as suggested
    expect(box).toBeEnabled();
    expect(box).not.toHaveAttribute('readonly');

    await user.clear(box);
    await user.type(box, 'PLSM20260031');
    expect(box).toHaveValue('PLSM20260031');
  });

  it('sends the number only when it was changed', async () => {
    const user = userEvent.setup();
    api.createInvoice.mockResolvedValue({ id: 7 });
    api.getInvoiceForEditing.mockResolvedValue({
      id: 7, number: 'PLSM20260031', status: 'pending_review', editable: true, customer: 12,
      customer_name: 'John Smith', package: 100, invoice_date: '2026-10-07', ...DEFAULTS,
      measurements: [], own_risk: null, insurance_fee: null, export_verified: false,
      lines: [{ kind: 'charge', description: 'Zeevracht', amount: '100.00' }], texts: config().settings,
    });
    renderEditor();
    await pickShipment(user);
    await user.click(screen.getByRole('button', { name: '+ Zeevracht' }));
    await user.type(screen.getByRole('textbox', { name: 'Charge 1 amount' }), '100');
    const box = screen.getByLabelText('Invoice number');
    await user.clear(box);
    await user.type(box, 'PLSM20260031');

    await user.click(screen.getByRole('button', { name: 'Save invoice' }));

    await waitFor(() => expect(api.createInvoice).toHaveBeenCalled());
    expect(api.createInvoice.mock.calls[0][0].number).toBe('PLSM20260031');
  });

  it('shows the server explaining a number that is already used', async () => {
    const user = userEvent.setup();
    const refusal = new Error('VALIDATION');
    refusal.status = 400;
    refusal.fields = { number: ['That invoice number is already used by another invoice.'] };
    api.createInvoice.mockRejectedValue(refusal);
    renderEditor();
    await pickShipment(user);
    await user.click(screen.getByRole('button', { name: '+ Zeevracht' }));
    await user.type(screen.getByRole('textbox', { name: 'Charge 1 amount' }), '100');

    await user.click(screen.getByRole('button', { name: 'Save invoice' }));

    expect(await screen.findByText(/already used by another invoice/)).toBeInTheDocument();
  });

  it('opens a sent invoice read-only, with its own number', async () => {
    api.getInvoiceForEditing.mockResolvedValue({
      id: 3, number: 'PLSM20260003', status: 'sent', editable: false, customer: 12,
      customer_name: 'John Smith', package: 100, invoice_date: '2026-10-01', ...DEFAULTS,
      measurements: [], own_risk: null, insurance_fee: null, export_verified: true,
      lines: [{ kind: 'charge', description: 'Zeevracht', amount: '850.00' }], texts: config().settings,
    });
    renderEditor('/dashboard/invoices/3/edit');

    expect(await screen.findByRole('heading', { name: 'Invoice PLSM20260003' })).toBeInTheDocument();
    expect(screen.getByText(/can no longer be changed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save invoice' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print invoice' })).toBeEnabled();
    // A saved invoice's number cannot be typed over: it is on the customer's document.
    expect(screen.getByLabelText('Invoice number')).toHaveValue('PLSM20260003');
    expect(screen.getByLabelText('Invoice number')).toBeDisabled();
  });

  it('speaks Dutch when Nederlands is chosen in the language menu', async () => {
    window.localStorage.setItem('plsm.language', 'nl');
    renderEditor();

    expect(await screen.findByRole('heading', { name: 'Nieuwe factuur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Factuur opslaan' })).toBeInTheDocument();
    expect(screen.getByLabelText('Loshaven')).toBeInTheDocument();
  });

  // Papiamentu is switched off (i18n/translations.js LANGUAGES): a saved
  // Papiamentu choice is ignored, and the language is picked as for a first
  // visit - the browser's (English in jsdom), else Dutch.
  it('ignores a saved Papiamentu choice while Papiamentu is off', async () => {
    window.localStorage.setItem('plsm.language', 'pap');
    renderEditor();

    expect(await screen.findByRole('heading', { name: 'New invoice' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Factura nobo' })).not.toBeInTheDocument();
  });

  it('keeps the printed invoice in Dutch whatever the screen language', async () => {
    renderEditor();
    await screen.findByText('New invoice');

    const sheet = screen.getByRole('article', { name: /Factuur/ });
    expect(within(sheet).getByText('Laadhaven')).toBeInTheDocument();
    expect(within(sheet).getByText('Subtotaal dienstverlening')).toBeInTheDocument();
  });
});
