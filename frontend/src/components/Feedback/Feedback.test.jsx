// The "Feedback" tab on every page, and the delivery reviews on the profile.
// The server owns the rules (backend feedback/tests.py); these pin the pages.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listMyDeliveries, reviewDelivery, sendFeedback } from '../../api/feedback';
import DeliveryReviews from '../../pages/Profile/DeliveryReviews';
import { renderWithProviders } from '../../test/utils';
import FeedbackButton from './FeedbackButton';

vi.mock('../../api/feedback', () => ({
  sendFeedback: vi.fn(),
  listMyDeliveries: vi.fn(),
  reviewDelivery: vi.fn(),
}));
const auth = { isAuthenticated: false };
vi.mock('../../auth/useAuth', () => ({ useAuth: () => auth }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.isAuthenticated = false;
  window.localStorage.setItem('plsm.language', 'en');
});

describe('the Feedback button', () => {
  it('sends stars, a comment, the e-mail, the page and the language', async () => {
    sendFeedback.mockResolvedValue(null);
    const user = userEvent.setup();
    renderWithProviders(<FeedbackButton />, { route: '/booking' });

    await user.click(screen.getByRole('button', { name: 'Feedback' }));
    await user.click(screen.getByRole('radio', { name: '4 out of 5 stars' }));
    await user.type(screen.getByLabelText('Your comment (optional)'), 'Handy site');
    await user.type(screen.getByLabelText(/Your e-mail address/), 'a@b.nl');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(sendFeedback).toHaveBeenCalledWith({
      rating: 4,
      comment: 'Handy site',
      email: 'a@b.nl',
      page: '/booking',
      language: 'en',
    });
    expect(await screen.findByText('Thank you for your feedback!')).toBeInTheDocument();
  });

  it('asks for stars before sending anything', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeedbackButton />);
    await user.click(screen.getByRole('button', { name: 'Feedback' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Choose 1 to 5 stars first.');
    expect(sendFeedback).not.toHaveBeenCalled();
  });

  it('does not ask a signed-in customer for their e-mail', async () => {
    auth.isAuthenticated = true;
    const user = userEvent.setup();
    renderWithProviders(<FeedbackButton />);
    await user.click(screen.getByRole('button', { name: 'Feedback' }));
    expect(screen.queryByLabelText(/Your e-mail address/)).toBeNull();
  });
});

describe('rating a delivery on the profile', () => {
  const ROWS = [
    { package: 7, tracking_number: 'PLS-7', delivered_at: '2026-11-01T10:00:00Z', review: null },
    { package: 6, tracking_number: 'PLS-6', delivered_at: '2026-10-01T10:00:00Z', review: { rating: 5, comment: 'Top' } },
  ];

  it('shows the review already given, and lets the customer rate the other', async () => {
    listMyDeliveries.mockResolvedValue(ROWS);
    reviewDelivery.mockResolvedValue(null);
    const user = userEvent.setup();
    renderWithProviders(<DeliveryReviews />);

    expect(await screen.findByText('“Top”')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '5 out of 5 stars' }));
    await user.click(screen.getByRole('button', { name: 'Rate' }));

    expect(reviewDelivery).toHaveBeenCalledWith(7, 5, '');
    expect(await screen.findByText('Thank you for your review!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rate' })).toBeNull();
  });

  it('says so when there is nothing delivered yet', async () => {
    listMyDeliveries.mockResolvedValue([]);
    renderWithProviders(<DeliveryReviews />);
    expect(await screen.findByText('You have no delivered shipments yet.')).toBeInTheDocument();
  });
});
