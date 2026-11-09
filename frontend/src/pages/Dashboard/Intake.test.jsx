// Opening an intake sheet shows it in a pop-up over the list, and asks before
// closing over typing nobody saved.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignIntakeFreight, deleteIntakeSheet, listIntakeSheets, updateIntakeSheet } from '../../api/staff';
import { renderWithProviders } from '../../test/utils';
import Intake from './Intake';

vi.mock('../../api/staff', async (importOriginal) => ({
  ...(await importOriginal()),
  listIntakeSheets: vi.fn(),
  getIntakeRecipients: vi.fn().mockResolvedValue({ count: 2, addresses: ['a@example.com', 'b@example.com'] }),
  listIntakePhotos: vi.fn().mockResolvedValue([]),
  updateIntakeSheet: vi.fn(),
  assignIntakeFreight: vi.fn(),
  deleteIntakeSheet: vi.fn(),
  getIntakeSheet: vi.fn().mockResolvedValue(null),
}));
const auth = { user: { id: 1, role: 'office', notifications: { warehouse: true } }, refreshUser: vi.fn() };
vi.mock('../../auth/useAuth', () => ({ useAuth: () => auth }));

const SHEET = {
  id: 11,
  label: 'PLSM-00001',
  reference: 'PLSM-00001',
  status: 'draft',
  status_display: 'Draft',
  released: false,
  revision: 1,
  created_by_name: '',
  employee_name: '',
  measurements: [],
  missing: ['Aantal colli'],
  received_on: null,
  freight: 'sea',
};

function renderIntake() {
  return renderWithProviders(
    <Routes>
      <Route path="/warehouse/intake" element={<Intake />} />
    </Routes>,
    { route: '/warehouse/intake' },
  );
}

beforeEach(() => {
  window.localStorage.removeItem('plsm.intakeMode');
  auth.user = { id: 1, role: 'office', notifications: { warehouse: true } };
  listIntakeSheets.mockReset().mockResolvedValue({ results: [SHEET], count: 1, hasNext: false, hasPrevious: false });
});

describe('Intake sheets', () => {
  it('opens a sheet in a pop-up, titled with its number', async () => {
    const user = userEvent.setup();
    renderIntake();

    await user.click(await screen.findByRole('button', { name: 'Open sheet' }));

    const dialog = screen.getByRole('dialog', { name: 'Intake sheet PLSM-00001' });
    expect(within(dialog).getByRole('button', { name: 'Save draft' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks before closing over unsaved typing', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderIntake();

    await user.click(await screen.findByRole('button', { name: 'Open sheet' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Supplier' }), 'Bol.com');
    await user.keyboard('{Escape}');

    expect(confirm).toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('shows the shipment number as text that nobody can change, a manager included', async () => {
    auth.user = { id: 2, role: 'manager', isWarehouseManager: true, canManageWarehouse: true };
    const user = userEvent.setup();
    renderIntake();
    await user.click(await screen.findByRole('button', { name: 'Open sheet' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('PLSM-00001')).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox', { name: 'Shipment / reference' })).toBeNull();
  });

  it('goes step by step, saving typing on Next', async () => {
    const user = userEvent.setup();
    updateIntakeSheet.mockReset().mockImplementation(async (id, fields) => ({ ...SHEET, ...fields, measurements: [] }));
    renderIntake();
    await user.click(await screen.findByRole('button', { name: 'Open sheet' }));
    const dialog = screen.getByRole('dialog');

    // Step 1 only: the checks of step 2 are not on screen yet.
    expect(within(dialog).queryByRole('radio', { name: 'Yes' })).toBeNull();
    await user.type(within(dialog).getByRole('textbox', { name: 'Supplier' }), 'Bol.com');
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));

    expect(updateIntakeSheet).toHaveBeenCalledWith(11, expect.objectContaining({ supplier: 'Bol.com' }));
    expect(within(dialog).queryByRole('textbox', { name: 'Supplier' })).toBeNull();
    expect(within(dialog).getAllByRole('radio', { name: 'Yes' })).toHaveLength(3);

    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(within(dialog).getByRole('textbox', { name: 'Supplier' })).toHaveValue('Bol.com');
  });

  it('sends only from the last step, saying what is still missing', async () => {
    const user = userEvent.setup();
    renderIntake();
    await user.click(await screen.findByRole('button', { name: 'Open sheet' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).queryByRole('button', { name: /release/i })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: /Review and send/ }));

    expect(within(dialog).getByRole('button', { name: /release/i })).toBeDisabled();
    expect(within(dialog).getAllByText(/Still to fill in/).length).toBeGreaterThan(0);
  });

  it('can show the whole form at once instead, and remembers that', async () => {
    const user = userEvent.setup();
    renderIntake();
    await user.click(await screen.findByRole('button', { name: 'Open sheet' }));
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Whole form' }));

    // Every part at once: step 1's boxes and step 2's checks together, and
    // Release without going through the steps.
    expect(within(dialog).getByRole('textbox', { name: 'Supplier' })).toBeInTheDocument();
    expect(within(dialog).getAllByRole('radio', { name: 'Yes' })).toHaveLength(3);
    expect(within(dialog).getByRole('button', { name: /release/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Next' })).toBeNull();
    expect(window.localStorage.getItem('plsm.intakeMode')).toBe('form');
  });

  it('shows the warehouse the freight read-only, waiting for the office', async () => {
    listIntakeSheets.mockResolvedValue({
      results: [{ ...SHEET, freight: '', can_assign_freight: false }],
      count: 1,
      hasNext: false,
      hasPrevious: false,
    });
    const user = userEvent.setup();
    renderIntake();
    await user.click(await screen.findByRole('button', { name: 'Open sheet' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText('Waiting for office assignment')).toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox', { name: 'Freight' })).toBeNull();
  });

  it('lets the office assign the freight, saved at once', async () => {
    listIntakeSheets.mockResolvedValue({
      results: [{ ...SHEET, freight: '', can_assign_freight: true }],
      count: 1,
      hasNext: false,
      hasPrevious: false,
    });
    assignIntakeFreight.mockResolvedValue({ ...SHEET, freight: 'air', can_assign_freight: true });
    const user = userEvent.setup();
    renderIntake();
    await user.click(await screen.findByRole('button', { name: 'Open sheet' }));
    const dialog = screen.getByRole('dialog');

    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Freight' }), 'air');

    expect(assignIntakeFreight).toHaveBeenCalledWith(11, 'air');
    expect(await within(dialog).findByText('Freight assigned.')).toBeInTheDocument();
  });

  it('never sends the freight with a save from the form', async () => {
    const user = userEvent.setup();
    updateIntakeSheet.mockReset().mockImplementation(async (id, fields) => ({ ...SHEET, ...fields, measurements: [] }));
    renderIntake();
    await user.click(await screen.findByRole('button', { name: 'Open sheet' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Supplier' }), 'Bol.com');
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    expect(updateIntakeSheet).toHaveBeenCalled();
    expect(updateIntakeSheet.mock.calls[0][1]).not.toHaveProperty('freight');
  });

  it('shows one number per intake: the PLSM shipment number', async () => {
    listIntakeSheets.mockResolvedValue({
      results: [{ ...SHEET, number: 7, number_display: '007' }],
      count: 1,
      hasNext: false,
      hasPrevious: false,
    });
    const user = userEvent.setup();
    renderIntake();

    expect(await screen.findByText('PLSM-00001')).toBeInTheDocument();
    expect(screen.queryByText(/007/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open sheet' }));
    expect(within(screen.getByRole('dialog')).queryByText('Intake 007')).toBeNull();
  });

  it('shows another worker’s draft read-only, saying why', async () => {
    auth.user = { id: 5, role: 'warehouse', isWarehouse: true };
    listIntakeSheets.mockResolvedValue({
      results: [{ ...SHEET, created_by_name: 'Wanda', permissions: { edit: false, reopen: false } }],
      count: 1,
      hasNext: false,
      hasPrevious: false,
    });
    const user = userEvent.setup();
    renderIntake();
    await user.click(await screen.findByRole('button', { name: 'Open sheet' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText(/Another worker started this intake/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Save draft' })).toBeNull();
  });

  it('tells a worker to ask a manager instead of offering Reopen', async () => {
    auth.user = { id: 5, role: 'warehouse', isWarehouse: true };
    listIntakeSheets.mockResolvedValue({
      results: [{ ...SHEET, status: 'released', released: true, permissions: { edit: false, reopen: false } }],
      count: 1,
      hasNext: false,
      hasPrevious: false,
    });
    const user = userEvent.setup();
    renderIntake();
    await user.click(await screen.findByRole('button', { name: 'Open sheet' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText(/Only a manager can reopen it/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Reopen/ })).toBeNull();
  });

  it('lets a manager delete an empty intake from the list, after confirming', async () => {
    auth.user = { id: 2, role: 'manager', isWarehouseManager: true, canManageWarehouse: true };
    deleteIntakeSheet.mockReset().mockResolvedValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    listIntakeSheets.mockResolvedValue({
      results: [{ ...SHEET, permissions: { edit: true, delete: true } }],
      count: 1,
      hasNext: false,
      hasPrevious: false,
    });
    const user = userEvent.setup();
    renderIntake();

    await user.click(await screen.findByRole('button', { name: 'Delete intake PLSM-00001' }));

    expect(deleteIntakeSheet).toHaveBeenCalledWith(11);
    expect(await screen.findByText('Intake PLSM-00001 was deleted. Its number is free again.')).toBeInTheDocument();
    window.confirm.mockRestore();
  });

  it('shows no Delete on an intake that is not empty', async () => {
    renderIntake();
    await screen.findByRole('button', { name: 'Open sheet' });
    expect(screen.queryByRole('button', { name: /Delete intake/ })).toBeNull();
  });
});
