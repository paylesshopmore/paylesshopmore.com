// The manager's package review (/warehouse/manager/packages). The server
// owns the rules (backend warehouse/test_review.py); these pin the page:
// the list and its checks, Approve, Send back with a required note, the
// filters in the address, and what a conflict says.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewIntakeSheet } from '../../api/staff';
import { getReviewQueue } from '../../api/warehouse';
import { renderWithProviders } from '../../test/utils';
import ManagerReview from './ManagerReview';

vi.mock('../../api/warehouse', () => ({ getReviewQueue: vi.fn() }));
vi.mock('../../api/staff', () => ({ reviewIntakeSheet: vi.fn() }));

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderAt(route = '/warehouse/manager/packages') {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/warehouse/manager/packages" element={<ManagerReview />} />
      </Routes>
      <Where />
    </>,
    { route },
  );
}

const ROW = {
  id: 41,
  reference: 'CI-4001',
  label: 'CI-4001',
  quality_status: 'awaiting_review',
  revision: 1,
  customer: { id: 12, name: 'Klaas Klant', customer_code: 'PLSM-C00012' },
  supplier: 'Bol.com',
  destination: 'Curaçao',
  recipient: 'Maria Rosario',
  released_at: '2026-11-06T09:00:00Z',
  released_by: 'Wim Tromp',
  review_note: '',
  reviewed_at: null,
  reviewed_by: null,
  issues: ['missing_weight', 'name_differs'],
  problems: ['missing_weight'],
};

const page = (results) => ({ count: results.length, page: 1, has_next: false, results });

beforeEach(() => {
  getReviewQueue.mockReset().mockResolvedValue(page([ROW]));
  reviewIntakeSheet.mockReset().mockResolvedValue({});
});

describe('the list', () => {
  it('opens on what is awaiting review, with what the checks found', async () => {
    renderAt();

    const row = (await screen.findByText('CI-4001')).closest('li');
    expect(getReviewQueue).toHaveBeenCalledWith({ status: 'awaiting_review', issue: '', page: 1 });
    expect(row).toHaveTextContent('Klaas Klant (PLSM-C00012)');
    expect(row).toHaveTextContent('Released by Wim Tromp');
    expect(within(row).getByText('No weight')).toBeInTheDocument();
    expect(within(row).getByText('Different name on goods')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Open sheet' })).toHaveAttribute(
      'href',
      '/warehouse/intake?sheet=41',
    );
  });

  it('says so when nothing is waiting', async () => {
    getReviewQueue.mockResolvedValue(page([]));
    renderAt();
    expect(await screen.findByText('Nothing waiting for review. Well done, floor.')).toBeInTheDocument();
  });

  it('switches status and check, keeping them in the address', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByText('CI-4001');

    await user.click(screen.getByRole('button', { name: 'Needs correction' }));
    await waitFor(() =>
      expect(getReviewQueue).toHaveBeenLastCalledWith({ status: 'needs_correction', issue: '', page: 1 }),
    );
    await user.selectOptions(screen.getByLabelText('Check'), 'duplicate');
    await waitFor(() =>
      expect(getReviewQueue).toHaveBeenLastCalledWith({ status: 'needs_correction', issue: 'duplicate', page: 1 }),
    );
    expect(screen.getByTestId('where')).toHaveTextContent('status=needs_correction&issue=duplicate');
  });
});

describe('deciding', () => {
  it('approves', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByText('CI-4001');

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(reviewIntakeSheet).toHaveBeenCalledWith(41, 'approve', '');
    expect(await screen.findByText('CI-4001 approved.')).toBeInTheDocument();
    // Fetched again, so the list no longer holds it.
    await waitFor(() => expect(getReviewQueue).toHaveBeenCalledTimes(2));
  });

  it('sends back only with a note', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByText('CI-4001');

    await user.click(screen.getByRole('button', { name: 'Send back' }));
    const send = screen.getByRole('button', { name: 'Send back to the floor' });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText('Note for the floor'), 'Weight is missing');
    await user.click(send);

    expect(reviewIntakeSheet).toHaveBeenCalledWith(41, 'correction', 'Weight is missing');
    expect(await screen.findByText('CI-4001 sent back to the floor.')).toBeInTheDocument();
  });

  it('an approved sheet can be sent back but not approved again', async () => {
    getReviewQueue.mockResolvedValue(page([{ ...ROW, quality_status: 'approved' }]));
    renderAt('/warehouse/manager/packages?status=approved');
    await screen.findByText('CI-4001');

    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Send back' })).toBeInTheDocument();
  });

  it('says so when somebody else got there first', async () => {
    const user = userEvent.setup();
    reviewIntakeSheet.mockRejectedValue({ status: 409 });
    renderAt();
    await screen.findByText('CI-4001');

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Somebody else has just reviewed this sheet.');
  });
});
