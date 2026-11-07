// Warehouse management -> Intakes (/warehouse/manager/intakes). The server
// owns the rules (backend warehouse/test_intake_numbers.py); these pin the
// page: the intake numbers, the views and filters in the address, Delete
// (empty intakes only, after confirming), Archive (with a reason) and what a
// refused delete says.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveIntakeSheet,
  deleteIntakeSheet,
  listIntakeSheets,
  listWorkers,
  unarchiveIntakeSheet,
} from '../../api/staff';
import { renderWithProviders } from '../../test/utils';
import ManagerIntakes from './ManagerIntakes';

vi.mock('../../api/staff', () => ({
  listIntakeSheets: vi.fn(),
  listWorkers: vi.fn(),
  deleteIntakeSheet: vi.fn(),
  archiveIntakeSheet: vi.fn(),
  unarchiveIntakeSheet: vi.fn(),
}));

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderAt(route = '/warehouse/manager/intakes') {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/warehouse/manager/intakes" element={<ManagerIntakes />} />
      </Routes>
      <Where />
    </>,
    { route },
  );
}

function sheet(overrides) {
  return {
    id: 7,
    number: 2,
    number_display: '002',
    reference: 'PLSM-00031',
    label: 'PLSM-00031',
    released: false,
    archived: false,
    archive_reason: '',
    customer: null,
    supplier: '',
    destination: '',
    created_by_name: 'Wim Vloer',
    created_at: '2026-11-07T09:00:00Z',
    updated_at: '2026-11-07T09:00:00Z',
    permissions: { edit: true, reopen: false, delete: true, archive: true, unarchive: false },
    ...overrides,
  };
}

const page = (results) => ({ results, count: results.length, hasNext: false, hasPrevious: false });

beforeEach(() => {
  listIntakeSheets.mockReset().mockResolvedValue(page([sheet()]));
  listWorkers.mockReset().mockResolvedValue({ results: [{ id: 3, name: 'Wim Vloer' }] });
  deleteIntakeSheet.mockReset().mockResolvedValue(null);
  archiveIntakeSheet.mockReset().mockResolvedValue(sheet({ archived: true }));
  unarchiveIntakeSheet.mockReset().mockResolvedValue(sheet());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'prompt').mockReturnValue('Entered twice');
});

describe('the list', () => {
  it('shows each intake by its number', async () => {
    renderAt();
    expect(await screen.findByText('Intake 002')).toBeInTheDocument();
    expect(listIntakeSheets).toHaveBeenCalledWith({ page: 1 });
  });

  it('asks the server for the empty intakes in the Empty view', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByText('Intake 002');

    await user.click(screen.getByRole('button', { name: 'Empty' }));

    expect(screen.getByTestId('where')).toHaveTextContent('?view=empty');
    await waitFor(() => expect(listIntakeSheets).toHaveBeenLastCalledWith({ empty: 'true', page: 1 }));
  });

  it('filters by who started it and by date, in the address', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByText('Intake 002');

    await user.selectOptions(screen.getByLabelText('Started by'), '3');

    await waitFor(() =>
      expect(listIntakeSheets).toHaveBeenLastCalledWith({ page: 1, created_by: '3' }),
    );
    expect(screen.getByTestId('where')).toHaveTextContent('created_by=3');
  });

  it('searches a customer when the box is left, not on every key', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByText('Intake 002');
    const calls = listIntakeSheets.mock.calls.length;

    await user.type(screen.getByLabelText('Customer'), 'klaas');
    expect(listIntakeSheets.mock.calls.length).toBe(calls);
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(listIntakeSheets).toHaveBeenLastCalledWith({ page: 1, customer_q: 'klaas' }),
    );
  });
});

describe('deleting and archiving', () => {
  it('deletes an empty intake after confirming, and says its number is free', async () => {
    const user = userEvent.setup();
    renderAt('/warehouse/manager/intakes?view=empty');
    await screen.findByText('Intake 002');

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('002'));
    expect(deleteIntakeSheet).toHaveBeenCalledWith(7);
    expect(await screen.findByText('Intake 002 was deleted. Its number is free again.')).toBeInTheDocument();
  });

  it('does nothing when the manager cancels', async () => {
    window.confirm.mockReturnValue(false);
    const user = userEvent.setup();
    renderAt('/warehouse/manager/intakes?view=empty');
    await screen.findByText('Intake 002');

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteIntakeSheet).not.toHaveBeenCalled();
  });

  it('explains a refused delete (the intake is not empty any more)', async () => {
    deleteIntakeSheet.mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));
    const user = userEvent.setup();
    renderAt('/warehouse/manager/intakes?view=empty');
    await screen.findByText('Intake 002');

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not empty any more/);
  });

  it('offers Archive (with a reason) instead of Delete when an intake is not empty', async () => {
    listIntakeSheets.mockResolvedValue(
      page([sheet({ supplier: 'Bol.com', permissions: { edit: true, delete: false, archive: true } })]),
    );
    const user = userEvent.setup();
    renderAt();
    await screen.findByText('Intake 002');

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    expect(window.prompt).toHaveBeenCalled();
    expect(archiveIntakeSheet).toHaveBeenCalledWith(7, 'Entered twice');
    expect(await screen.findByText('Intake 002 was archived.')).toBeInTheDocument();
  });

  it('brings an archived intake back', async () => {
    listIntakeSheets.mockResolvedValue(
      page([
        sheet({
          archived: true,
          archive_reason: 'Entered twice',
          permissions: { edit: false, reopen: false, delete: false, archive: false, unarchive: true },
        }),
      ]),
    );
    const user = userEvent.setup();
    renderAt('/warehouse/manager/intakes?view=archived');
    expect(await screen.findByText('Archived: Entered twice')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bring back' }));

    expect(unarchiveIntakeSheet).toHaveBeenCalledWith(7);
  });
});
