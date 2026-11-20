// src/api/payments.js
//
// Paying an invoice online. The browser sends ONLY the invoice number; the
// amount is looked up on the server (backend payments/views.py), so it cannot
// be changed from here. The answer is the address of Stripe's payment page.

import { request } from './client';

/**
 * @param {string} number the invoice number, e.g. 'PLSM-10231'
 * @returns {Promise<{ url: string }>} where to send the customer to pay
 */
export function startCheckout(number) {
  return request('/payments/checkout/', { method: 'POST', body: { number } });
}
