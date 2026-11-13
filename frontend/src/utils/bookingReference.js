// src/utils/bookingReference.js
//
// The reference a booking is shown under, on the office's Bookings page and on
// the customer's "My bookings".
//
//   - Once the office has given the booking a shipping number (PLSM-00004,
//     typed or handed out by the "Send to warehouse" button), that number is
//     the reference. It is what sends the booking to the warehouse.
//   - Until then the booking has no shipping number, so it is shown as
//     PLSM- plus its own id padded to seven digits: booking 10 is
//     PLSM-0000010, booking 11 is PLSM-0000011, and so on, growing by one for
//     every new booking.
//
// The padded id is for DISPLAY ONLY. It is not stored and it does not send the
// booking anywhere: the office still numbers a booking to start its journey.
// That is also why the two can differ - the shipping number the office gives
// later comes from its own counter, not from this id.

/** How many digits the id is padded to: PLSM-0000010. */
const DIGITS = 7;

/**
 * @param {{ id: number, shipping_number?: string }} booking
 * @returns {string} e.g. "PLSM-00004" (numbered) or "PLSM-0000010" (not yet)
 */
export function bookingReference(booking) {
  const numbered = (booking.shipping_number || '').trim();
  if (numbered) return numbered;
  return `PLSM-${String(booking.id).padStart(DIGITS, '0')}`;
}
