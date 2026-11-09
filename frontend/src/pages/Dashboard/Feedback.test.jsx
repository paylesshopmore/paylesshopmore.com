// Dashboard -> Feedback: the list, its filters, and "Mark handled".

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listStaffFeedback, updateStaffFeedback } from '../../api/feedback';
import { renderWithProviders } from '../../test/utils';
import Feedback from './Feedback';

vi.mock('../../api/feedback', () => ({
  listStaffFeedback: vi.fn(),
  updateStaffFeedback: vi.fn(),
}));

const ROW = {
  id: 3,
  kind: 'site',
  rating: 2,
  comment: 'The booking page is slow',
  customer: null,
  email: 'a@b.nl',
  page: '/booking',
  package_tracking: '',
  handled_at: null,
  handled_by_name: '',
  created_at: '2026-11-09T09:00:00Z',
};

beforeEach(() => {
  listStaffFeedback.mockReset().mockResolvedValue({ results: [ROW], count: 1, hasNext: false, hasPrevious: false });
  updateStaffFeedback.mockReset().mockResolvedValue({ ...ROW, handled_at: '2026-11-09T10:00:00Z', handled_by_name: 'Olga' });
});

describe('Dashboard -> Feedback', () => {
  it('shows what was sent, starting with what is not handled yet', async () => {
    renderWithProviders(<Feedback />);

    expect(await screen.findByText('The booking page is slow')).toBeInTheDocument();
    expect(screen.getByText('Visitor (not signed in)')).toBeInTheDocument();
    expect(screen.getByText('On /booking')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '2 out of 5 stars' })).toBeInTheDocument();
    expect(listStaffFeedback).toHaveBeenCalledWith(expect.objectContaining({ handled: 'false' }));
  });

  it('marks feedback handled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Feedback />);
    await user.click(await screen.findByRole('button', { name: 'Mark handled' }));

    expect(updateStaffFeedback).toHaveBeenCalledWith(3, { handled: true });
    expect(await screen.findByText('By Olga')).toBeInTheDocument();
  });

  it('filters by stars', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Feedback />);
    await screen.findByText('The booking page is slow');
    await user.selectOptions(screen.getByLabelText('Stars'), '1');
    await waitFor(() =>
      expect(listStaffFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ rating: '1' })),
    );
  });
});
