// The reference a booking is shown under: its shipping number once the office
// gave one, otherwise PLSM- and its id padded to seven digits.

import { describe, expect, it } from 'vitest';
import { bookingReference } from './bookingReference';

describe('bookingReference', () => {
  it('shows an unnumbered booking as PLSM- and its id padded to seven digits', () => {
    expect(bookingReference({ id: 10, shipping_number: '' })).toBe('PLSM-0000010');
    expect(bookingReference({ id: 1 })).toBe('PLSM-0000001');
  });

  it('keeps growing with every new booking', () => {
    const next = [10, 11, 12, 1234567].map((id) => bookingReference({ id, shipping_number: '' }));
    expect(next).toEqual(['PLSM-0000010', 'PLSM-0000011', 'PLSM-0000012', 'PLSM-1234567']);
  });

  it('shows the office\'s shipping number once there is one', () => {
    expect(bookingReference({ id: 10, shipping_number: 'PLSM-00004' })).toBe('PLSM-00004');
  });

  it('treats a blank shipping number as not numbered yet', () => {
    expect(bookingReference({ id: 10, shipping_number: '   ' })).toBe('PLSM-0000010');
  });
});
