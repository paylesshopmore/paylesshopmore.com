// The invoice settings page: the company details (KVK, BTW, IBAN, ...)
// can be changed by an admin, and only looked at by anyone else.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import InvoiceSettingsPage from './InvoiceSettingsPage';
import * as api from '../../../api/invoiceEditor';

vi.mock('../../../api/invoiceEditor', async (importOriginal) => ({
  ...(await importOriginal()),
  getInvoiceConfig: vi.fn(),
  saveInvoiceSettings: vi.fn(),
}));

const COMPANY = {
  name: 'Pay Less Shop More',
  street: 'Hertzstraat 10',
  postcode_city: '2652 XX Berkel en Rodenrijs',
  kvk: '9322289',
  vat: 'NL866317843B01',
  iban: 'NL79INGB0115158162',
  email: 'info@paylessshopmore.com',
  website: 'www.paylessshopmore.com',
  phone: '010 310 5317',
};

function config(admin) {
  return {
    settings: {
      number_prefix: 'PLSM', number_include_year: true, number_digits: 4, next_number: 'PLSM20260012',
      next_sequence: 12,
      standard_vat_rate: '21.00', export_vat_rate: '0.00', insurance_rate_percent: null, insurance_minimum: null,
      payment_instructions: '', terms_intro: '', terms_items: '', exclusions_title: '', exclusions_items: '',
      export_vat_note: '', footer_text: '',
    },
    ports: [],
    charge_types: [],
    company: COMPANY,
    permissions: { can_configure: admin, can_adjust: admin, can_delete: admin },
  };
}

describe('InvoiceSettingsPage - company details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets an admin change the KVK number', async () => {
    const user = userEvent.setup();
    api.getInvoiceConfig.mockResolvedValue(config(true));
    api.saveInvoiceSettings.mockResolvedValue({ ...config(true), company: { ...COMPANY, kvk: '12345678' } });
    renderWithProviders(<InvoiceSettingsPage />);

    const kvk = await screen.findByLabelText('KVK number (Chamber of Commerce)');
    expect(kvk).toHaveValue('9322289');
    await user.clear(kvk);
    await user.type(kvk, '12345678');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(api.saveInvoiceSettings).toHaveBeenCalled());
    expect(api.saveInvoiceSettings.mock.calls[0][0].company).toMatchObject({ kvk: '12345678', iban: COMPANY.iban });
    expect(await screen.findByText(/Settings saved/)).toBeInTheDocument();
  });

  it('shows the server explaining a wrong IBAN', async () => {
    const user = userEvent.setup();
    api.getInvoiceConfig.mockResolvedValue(config(true));
    const refusal = new Error('VALIDATION');
    refusal.status = 400;
    refusal.fields = { company: { iban: ['That does not look like an IBAN (e.g. NL79INGB0115158162).'] } };
    api.saveInvoiceSettings.mockRejectedValue(refusal);
    renderWithProviders(<InvoiceSettingsPage />);

    await user.click(await screen.findByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText(/iban: That does not look like an IBAN/)).toBeInTheDocument();
  });

  it('shows the details read-only to someone who is not an admin', async () => {
    api.getInvoiceConfig.mockResolvedValue(config(false));
    renderWithProviders(<InvoiceSettingsPage />);

    expect(await screen.findByLabelText('KVK number (Chamber of Commerce)')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
  });
});

describe('InvoiceSettingsPage - the invoice counter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows where the numbering is, and lets an admin carry on from another number', async () => {
    const user = userEvent.setup();
    api.getInvoiceConfig.mockResolvedValue(config(true));
    api.saveInvoiceSettings.mockResolvedValue(config(true));
    renderWithProviders(<InvoiceSettingsPage />);

    const counter = await screen.findByLabelText('Next number in the series');
    expect(counter).toHaveValue(12);
    await user.clear(counter);
    await user.type(counter, '15');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(api.saveInvoiceSettings).toHaveBeenCalled());
    expect(api.saveInvoiceSettings.mock.calls[0][0].next_sequence).toBe(15);
  });

  it('does not send the counter when it was not touched', async () => {
    const user = userEvent.setup();
    api.getInvoiceConfig.mockResolvedValue(config(true));
    api.saveInvoiceSettings.mockResolvedValue(config(true));
    renderWithProviders(<InvoiceSettingsPage />);

    // Only the VAT rate is changed. The counter may be out of date by now (an
    // invoice could have been saved), so it must not be sent back.
    const vat = await screen.findByLabelText('Standard rate (%)');
    await user.clear(vat);
    await user.type(vat, '9');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(api.saveInvoiceSettings).toHaveBeenCalled());
    expect(api.saveInvoiceSettings.mock.calls[0][0]).not.toHaveProperty('next_sequence');
  });

  it('is read-only for someone who is not an admin', async () => {
    api.getInvoiceConfig.mockResolvedValue(config(false));
    renderWithProviders(<InvoiceSettingsPage />);

    expect(await screen.findByLabelText('Next number in the series')).toBeDisabled();
  });
});
