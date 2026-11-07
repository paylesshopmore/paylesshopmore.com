// The warehouse home page: Scan, New intake sheet, four number tiles that
// are also the list's views, and the list itself.
//
// It refreshes itself every minute, and it is the page a shared floor device
// gets left on. Those refreshes must not count as somebody working, or the
// device never goes idle and stays signed in as the last worker for as long
// as the screen is on.

import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { createIntakeSheet, listWarehouseShipments } from '../../api/staff';
import WarehouseHome from './WarehouseHome';

vi.mock('../../api/staff', () => ({
  listWarehouseShipments: vi.fn(),
  createIntakeSheet: vi.fn(),
}));

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { firstName: 'Wim', isWarehouse: true } }),
}));

const IN_WAREHOUSE = 'received,awaiting_measurement,measured,awaiting_packaging,packed,ready';

const ROW = {
  id: 7,
  tracking_number: 'PLSM-0007',
  customer: 'Ana Martis',
  warehouse_location: 'A-03',
  warehouse_stage: 'awaiting_measurement',
  warehouse_stage_at: null,
  has_open_damage: true,
};

/** Says where the app went. */
function Here() {
  const { pathname, search } = useLocation();
  return <p>{`At ${pathname}${search}`}</p>;
}

function renderHome() {
  return renderWithProviders(
    <Routes>
      <Route path="/warehouse" element={<WarehouseHome />} />
      <Route path="/warehouse/intake" element={<Here />} />
    </Routes>,
    { route: '/warehouse' },
  );
}

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'en');
  // The "on the way" list asks for stage awaiting_pickup: nothing there unless
  // a test says so; everything else gets ROW.
  listWarehouseShipments.mockReset().mockImplementation((filters) =>
    Promise.resolve(filters.stage === 'awaiting_pickup' ? { results: [], count: 0 } : { results: [ROW], count: 1 }),
  );
  createIntakeSheet.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the warehouse home page', () => {
  it('lists the packages in the warehouse, with why one is flagged', async () => {
    renderHome();

    expect(await screen.findByText('PLSM-0007')).toBeInTheDocument();
    expect(screen.getByText('Damage reported')).toBeInTheDocument();
    expect(listWarehouseShipments).toHaveBeenCalledWith(
      { page_size: 50, stage: IN_WAREHOUSE },
      { background: false },
    );
  });

  it('shows a number on each tile', async () => {
    listWarehouseShipments.mockImplementation((filters) => {
      const counts = { awaiting_pickup: 15, ready: 4 };
      const count = filters.attention ? 3 : (counts[filters.stage] ?? 31);
      return Promise.resolve({ results: [ROW], count });
    });
    renderHome();

    const tiles = screen.getByRole('group', { name: 'Show' });
    expect(await within(tiles).findByRole('button', { name: /In the warehouse\s*31/ })).toBeInTheDocument();
    expect(within(tiles).getByRole('button', { name: /Requiring attention\s*3/ })).toBeInTheDocument();
    expect(within(tiles).getByRole('button', { name: /Ready to ship\s*4/ })).toBeInTheDocument();
    expect(within(tiles).getByRole('button', { name: /On the way\s*15/ })).toBeInTheDocument();
    // Counts are asked for with page_size 1: only the number is read.
    expect(listWarehouseShipments).toHaveBeenCalledWith(
      { page_size: 1, stage: IN_WAREHOUSE, attention: 'true' },
      { background: false },
    );
  });

  it('shows the new packages the office has sent, on the way in', async () => {
    const user = userEvent.setup();
    const expected = { ...ROW, id: 9, tracking_number: 'CI-1234', warehouse_stage: 'awaiting_pickup', has_open_damage: false };
    listWarehouseShipments.mockImplementation((filters) =>
      Promise.resolve(
        filters.stage === 'awaiting_pickup' ? { results: [expected], count: 1 } : { results: [ROW], count: 1 },
      ),
    );
    renderHome();
    await screen.findByText('PLSM-0007');

    await user.click(screen.getByRole('button', { name: /On the way/ }));

    expect(await screen.findByRole('link', { name: /CI-1234/ })).toHaveAttribute('href', '/warehouse/packages/9');
    expect(screen.getByRole('heading', { name: /On the way/ })).toBeInTheDocument();
    expect(screen.getByText(/Open one when it arrives/)).toBeInTheDocument();
    expect(listWarehouseShipments).toHaveBeenCalledWith({ page_size: 50, stage: 'awaiting_pickup' }, { background: false });
  });

  it('narrows the list to problems', async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByText('PLSM-0007');

    await user.click(screen.getByRole('button', { name: /Requiring attention/ }));

    expect(screen.getByRole('button', { name: /Requiring attention/ })).toHaveAttribute('aria-pressed', 'true');
    expect(listWarehouseShipments).toHaveBeenCalledWith(
      { page_size: 50, stage: IN_WAREHOUSE, attention: 'true' },
      { background: false },
    );
  });

  it('searches every package', async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByText('PLSM-0007');

    await user.type(screen.getByRole('searchbox'), 'PLSM-0007');

    expect(await screen.findByRole('heading', { name: /Search results/ })).toBeInTheDocument();
    expect(listWarehouseShipments).toHaveBeenCalledWith({ page_size: 50, search: 'PLSM-0007' }, { background: false });
  });

  it('starts a new intake sheet and opens it', async () => {
    const user = userEvent.setup();
    createIntakeSheet.mockResolvedValue({ id: 41 });
    renderHome();

    await user.click(screen.getByRole('button', { name: /New intake sheet/ }));

    expect(createIntakeSheet).toHaveBeenCalled();
    expect(await screen.findByText('At /warehouse/intake?sheet=41')).toBeInTheDocument();
  });

  it('loads as somebody opening it, and refreshes in the background', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    renderHome();
    expect(await screen.findByText('PLSM-0007')).toBeInTheDocument();

    // Opening the page is somebody doing something.
    expect(listWarehouseShipments).toHaveBeenLastCalledWith(expect.any(Object), { background: false });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    // The minute's refresh is not.
    expect(listWarehouseShipments).toHaveBeenLastCalledWith(expect.any(Object), { background: true });
  });
});
