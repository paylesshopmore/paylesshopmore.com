// src/calculator/calculate.js
//
// The shipping calculator's arithmetic. Pure functions: numbers in, numbers
// out, no React. That makes them easy to test (see calculate.test.js) and
// keeps the page component (pages/Calculator) about the screen only.
// The prices come from rates.js.
//
// How an indication is built:
//
//   goods value     price incl. Dutch VAT / (1 + VAT rate)
//                   Goods sent abroad leave without Dutch VAT, so customs on
//                   the island values them without it.
//   volume          length x width x height, in m³
//   chargeable kg   the higher of the actual weight and the volumetric weight
//                   (cm³ / 6000), rounded up to a whole kg - how air freight
//                   is charged
//   freight         sea: volume x price per m³    air: chargeable kg x price per kg
//                   never below the minimum
//   fees            fixed amounts per shipment: administration, documentation
//   handling        by the purchase value (price incl. VAT), from the server's
//                   rules: EUR 50 up to and including EUR 500, EUR 150 above
//   import duty     goods value x the category's duty %
//   local tax       (goods value + freight + duty) x the island's tax %
//   total           freight + fees + duty + local tax
//
// Anything whose rate is not known yet comes back null, and the page asks
// for a quote instead of showing a total.

import { IMPORT_DUTY_PERCENT, RATES, VOLUMETRIC_DIVISOR } from './rates';

// Round to cents: 90.9090... -> 90.91. (Multiply by 100, round to a whole
// number, divide by 100 again.)
const round2 = (value) => Math.round(value * 100) / 100;

// Whether a rate has been filled in. `null` (not set yet), `undefined` (no
// such category) and NaN all count as "not known".
const known = (value) => typeof value === 'number' && Number.isFinite(value);

/** Whether this destination and transport have a price at all. */
export function isPriced(destination, transport, rates = RATES) {
  // `?.` stops with `undefined` instead of crashing when a level is missing,
  // e.g. a destination that is not in the table.
  const freight = rates[destination]?.[transport];
  if (!freight) return false;
  // Sea freight needs a price per m³, air freight a price per kg.
  return transport === 'sea' ? known(freight.perM3) : known(freight.perKg);
}

/**
 * The handling costs for a purchase value, by the server's rules (see
 * api/pricing.js): the first rule whose ceiling the value does not exceed.
 * Exactly the ceiling still counts (EUR 500 -> the EUR 50 rule). Null without
 * rules - the page then shows no handling line and no total.
 *
 * @param {number} purchaseValue
 * @param {{ up_to_eur: string|null, fee_eur: string }[]|null} rules
 */
export function handlingFeeFor(purchaseValue, rules) {
  if (!Array.isArray(rules) || rules.length === 0 || !known(purchaseValue)) return null;
  // In cents, so 500.004 typed as a price is still 500.00 like on the server.
  const value = round2(purchaseValue);
  const rule = rules.find((item) => item.up_to_eur === null || value <= Number(item.up_to_eur));
  const fee = rule ? Number(rule.fee_eur) : Number.NaN;
  return known(fee) ? fee : null;
}

/**
 * @param {{ destination: 'curacao', priceInclVat: number, vatPercent: number,
 *           lengthCm: number, widthCm: number, heightCm: number, weightGrams: number,
 *           category: string, transport: 'sea'|'air' }} input
 * @param {{ rates?: object, duties?: object, handlingRules?: object[]|null }} [tables]
 *   rates and duties default to rates.js (overridden in tests); handlingRules
 *   come from the server (api/pricing.js) - without them there is no
 *   handling line and no total
 */
export function calculate(
  input,
  { rates = RATES, duties = IMPORT_DUTY_PERCENT, handlingRules = null } = {},
) {
  const { destination, priceInclVat, vatPercent, lengthCm, widthCm, heightCm, weightGrams, category, transport } =
    input;

  // 1. The value customs looks at: the shop price without Dutch VAT.
  //    € 121 incl. 21% VAT -> 121 / 1.21 = € 100.
  const goodsValue = round2(priceInclVat / (1 + vatPercent / 100));
  //    The Dutch VAT that was in the price: € 121 - € 100 = € 21.
  const vatAmount = round2(priceInclVat - goodsValue);

  // 2. Size and weight.
  const cubicCm = lengthCm * widthCm * heightCm;
  // 1 m³ = 100 x 100 x 100 cm = 1,000,000 cm³. Kept to 3 decimals (litres).
  const volumeM3 = Math.round((cubicCm / 1_000_000) * 1000) / 1000;
  const actualKg = round2(weightGrams / 1000);
  // A big, light box takes the room of a heavy one on a plane, so airlines
  // charge it as if it weighed cm³ / 6000 kg - rounded UP to a whole kg:
  // 10.78 -> 11, 10.2 -> 11. (round2 first, so a sum like 10.000000001 that
  // is really 10 stays 10 instead of jumping to 11.)
  const volumetricKg = Math.ceil(round2(cubicCm / VOLUMETRIC_DIVISOR));
  // Air freight is charged per whole kg, so the chargeable weight rounds up
  // too: a 12.3 kg box is charged as 13 kg. (The "actual weight" line keeps
  // the exact figure, so the visitor sees what the scale said.)
  const chargeableKg = Math.ceil(Math.max(actualKg, volumetricKg));

  // 3. Freight - only when we have a price for this island and transport.
  //    `?? {}` gives an empty table for an unknown island, so the lookups
  //    below find nothing instead of crashing.
  const table = rates[destination] ?? {};
  let freight = null;
  if (isPriced(destination, transport, rates)) {
    const tariff = table[transport];
    const raw = transport === 'sea' ? volumeM3 * tariff.perM3 : chargeableKg * tariff.perKg;
    // A small parcel still costs at least the minimum (when one is set).
    freight = round2(Math.max(raw, known(tariff.minimum) ? tariff.minimum : 0));
  }

  // 3b. Fixed fees per shipment, e.g. [{ key: 'handling', amount: 150 }].
  //     Only the ones that have an amount; they belong to the freight price,
  //     so they are only listed when the freight is.
  //     Handling comes last, by the purchase value (the price incl. VAT).
  const handling = handlingFeeFor(priceInclVat, handlingRules);
  const fees =
    freight === null
      ? []
      : [
          ...Object.entries(table.fees ?? {})
            .filter(([, amount]) => known(amount))
            .map(([key, amount]) => ({ key, amount })),
          ...(handling === null ? [] : [{ key: 'handling', amount: handling }]),
        ];
  const feesTotal = round2(fees.reduce((sum, fee) => sum + fee.amount, 0));

  // 4. Import duty - a percentage of the goods value, from the island's
  //    tariff (rates.js). Independent of freight, so it can be shown even
  //    before freight prices exist.
  const dutyPercent = duties[destination]?.[category];
  const duty = known(dutyPercent) ? round2((goodsValue * dutyPercent) / 100) : null;

  // 5. Local tax (OB / ABB) - charged over everything that came before, so
  //    it needs freight AND duty to be known.
  const taxPercent = table.localTaxPercent;
  const localTax =
    freight !== null && duty !== null && known(taxPercent)
      ? round2(((goodsValue + freight + duty) * taxPercent) / 100)
      : null;

  // 6. A total only when every part of it is known - a total missing its duty
  //    would look complete and be wrong.
  //    Handling counts as a part too: a total without it would be too low.
  const total =
    freight !== null && duty !== null && localTax !== null && handling !== null
      ? round2(freight + feesTotal + duty + localTax)
      : null;

  return {
    vatAmount,
    goodsValue,
    volumeM3,
    actualKg,
    volumetricKg,
    chargeableKg,
    freight,
    fees,
    feesTotal,
    handling,
    duty,
    dutyPercent: known(dutyPercent) ? dutyPercent : null,
    localTax,
    localTaxPercent: known(taxPercent) ? taxPercent : null,
    total,
    // `priced` tells the page whether to show prices or "request a quote".
    priced: freight !== null,
  };
}

/**
 * What is wrong with the form, as a map of field -> translation key. Empty
 * when it can be calculated.
 *
 * Example: { priceInclVat: 'calculator.errors.priceInclVat' } means the price
 * box is empty or not above 0; the page shows that translation under it.
 */
export function validateInput(values) {
  const errors = {};
  // Form fields arrive as text ('500'), so turn them into numbers first.
  // An empty box, text that is not a number, 0 or a negative number all fail.
  const positive = (key) => {
    const number = Number(values[key]);
    if (values[key] === '' || !Number.isFinite(number) || number <= 0) errors[key] = `calculator.errors.${key}`;
  };
  ['priceInclVat', 'lengthCm', 'widthCm', 'heightCm', 'weightGrams'].forEach(positive);
  if (!values.category) errors.category = 'calculator.errors.category';
  return errors;
}
