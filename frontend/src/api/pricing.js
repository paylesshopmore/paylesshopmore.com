// src/api/pricing.js
//
// Prices the website shows but does not keep a copy of. The handling costs
// live on the server (backend invoicing/calculation.py HANDLING_FEE_RULES),
// where the office's bookings use them too; the calculator asks for them
// here once and applies them as the visitor types.

import { request } from './client';

/**
 * The handling-cost rules, top to bottom: the first whose `up_to_eur` the
 * purchase value does not exceed applies (`null` = no ceiling).
 *
 * @returns {Promise<{ rules: { up_to_eur: string|null, fee_eur: string,
 *   suppliers_included: number|null }[] }>}
 */
export function getHandlingRules() {
  return request('/pricing/handling/');
}
