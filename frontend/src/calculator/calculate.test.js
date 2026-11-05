// The calculator's arithmetic, with the rates as shipped (Curaçao's freight,
// fees and import duty are filled in; its OB rate is not yet) and with sample
// rates.

import { describe, expect, it } from 'vitest';
import { calculate, handlingFeeFor, isPriced, validateInput } from './calculate';
import { IMPORT_CATEGORIES, IMPORT_DUTY_PERCENT } from './rates';

// A 75 x 80 x 45 cm box of shoes, € 500 incl. 21% VAT, by sea to Curaçao.
const INPUT = {
  destination: 'curacao',
  priceInclVat: 500,
  vatPercent: 21,
  lengthCm: 75,
  widthCm: 80,
  heightCm: 45,
  weightGrams: 35,
  category: 'shoes',
  transport: 'sea',
};

// Sample numbers for the tests only - not real rates.
const RATES = {
  curacao: {
    sea: { perM3: 100, minimum: 35 },
    air: { perKg: 6, minimum: 20 },
    fees: { administration: 10 },
    localTaxPercent: 6,
  },
};
const DUTIES = { curacao: { shoes: 22 } };
// Sample handling rules, shaped like the server's (api/pricing.js).
const HANDLING = [
  { up_to_eur: '500.00', fee_eur: '20.00', suppliers_included: null },
  { up_to_eur: null, fee_eur: '60.00', suppliers_included: 2 },
];

describe('the calculator, with the rates as shipped', () => {
  it('still works out value, volume and weights', () => {
    const out = calculate(INPUT);

    expect(out.goodsValue).toBe(413.22); // 500 / 1.21
    expect(out.vatAmount).toBe(86.78); // 500 - 413.22
    expect(out.volumeM3).toBe(0.27); // 270,000 cm3
    expect(out.actualKg).toBe(0.04); // 35 g
    expect(out.volumetricKg).toBe(45); // 270,000 / 6000
    expect(out.chargeableKg).toBe(45);
  });

  it('rounds the volumetric weight up to a whole kg', () => {
    // 60 x 49 x 22 = 64,680 cm3 / 6000 = 10.78 kg -> 11 kg
    expect(calculate({ ...INPUT, lengthCm: 60, widthCm: 49, heightCm: 22 }).volumetricKg).toBe(11);
    // 60 x 50 x 20 = 60,000 cm3 / 6000 = exactly 10 kg: stays 10
    expect(calculate({ ...INPUT, lengthCm: 60, widthCm: 50, heightCm: 20 }).volumetricKg).toBe(10);
  });

  it('rounds a heavy box up to a whole kg too, but shows its exact weight', () => {
    // 12,300 g in a small box: heavier than its 1 kg volume weight.
    const out = calculate({ ...INPUT, lengthCm: 10, widthCm: 10, heightCm: 10, weightGrams: 12300, transport: 'air' });

    expect(out.actualKg).toBe(12.3);
    expect(out.chargeableKg).toBe(13);
    expect(out.freight).toBe(91); // 13 kg x 7
  });

  it('prices freight: EUR 180 per m3 by sea, EUR 7 per kg by air', () => {
    expect(isPriced('curacao', 'sea')).toBe(true);
    expect(isPriced('curacao', 'air')).toBe(true);
    expect(calculate(INPUT).freight).toBe(48.6); // 0.27 m3 x 180
    expect(calculate({ ...INPUT, transport: 'air' }).freight).toBe(315); // 45 kg x 7
  });

  it('adds administration and documentation per shipment, and handling by the purchase value', () => {
    // Without the server's rules: no handling line (and so no total).
    expect(calculate(INPUT).fees).toEqual([
      { key: 'administration', amount: 25 },
      { key: 'documentation', amount: 30 },
    ]);

    const rules = [
      { up_to_eur: '500.00', fee_eur: '50.00', suppliers_included: null },
      { up_to_eur: null, fee_eur: '150.00', suppliers_included: 2 },
    ];
    const out = calculate(INPUT, { handlingRules: rules });
    expect(out.fees).toEqual([
      { key: 'administration', amount: 25 },
      { key: 'documentation', amount: 30 },
      { key: 'handling', amount: 50 }, // EUR 500: still the lower rate
    ]);
    expect(out.feesTotal).toBe(105);
    expect(calculate({ ...INPUT, priceInclVat: 501 }, { handlingRules: rules }).handling).toBe(150);
  });

  it('gives no total while the OB rate is unknown, rather than an invented one', () => {
    const out = calculate(INPUT);

    expect(out.priced).toBe(true);
    expect(out.localTax).toBeNull();
    expect(out.total).toBeNull();
  });

  it("already knows Curaçao's import duty, from the customs tariff", () => {
    const out = calculate(INPUT);

    expect(out.dutyPercent).toBe(13); // shoes, chapter 64
    expect(out.duty).toBe(53.72); // 413.22 x 13%
  });
});

describe("Curaçao's import duty table", () => {
  it('has a rate for every category in the form', () => {
    for (const category of IMPORT_CATEGORIES) {
      expect(typeof IMPORT_DUTY_PERCENT.curacao[category]).toBe('number');
    }
  });

  it('matches the tariff for a few well-known goods', () => {
    const duty = IMPORT_DUTY_PERCENT.curacao;
    expect(duty.clothing).toBe(10.5); // chapters 61 and 62
    expect(duty.books).toBe(0); // heading 49.01
    expect(duty.computers).toBe(0); // heading 84.71
    expect(duty.furniture).toBe(22); // heading 94.03
    expect(duty.smallAppliances).toBe(27); // headings 85.08 to 85.16
  });

  it('works with a rate that has a decimal', () => {
    const out = calculate({ ...INPUT, priceInclVat: 121, category: 'clothing' });
    expect(out.duty).toBe(10.5); // 100 x 10.5%
  });
});

describe('the calculator, with rates', () => {
  const run = (overrides) => calculate({ ...INPUT, ...overrides }, { rates: RATES, duties: DUTIES, handlingRules: HANDLING });

  it('prices sea freight by volume, never below the minimum', () => {
    expect(run({}).freight).toBe(35); // 0.27 m3 x 100 = 27, minimum 35
    expect(run({ lengthCm: 150 }).freight).toBe(54); // 0.54 m3 x 100
  });

  it('prices air freight by chargeable weight', () => {
    expect(run({ transport: 'air' }).freight).toBe(270); // 45 kg x 6
  });

  it('adds duty on the goods value and local tax on the whole', () => {
    const out = run({});

    expect(out.duty).toBe(90.91); // 413.22 x 22%
    expect(out.localTax).toBe(32.35); // (413.22 + 35 + 90.91) x 6%
    expect(out.feesTotal).toBe(30); // 10 + 20
    expect(out.total).toBe(188.26); // 35 + 30 + 90.91 + 32.35
  });

  it('lists no fees for a route without a freight price', () => {
    const out = calculate(INPUT, { rates: { curacao: { sea: { perM3: null }, fees: { administration: 20 } } }, duties: DUTIES });

    expect(out.fees).toEqual([]);
    expect(out.feesTotal).toBe(0);
  });

  it('gives no total while a part of it is unknown', () => {
    const out = run({ category: 'toys' });

    expect(out.freight).toBe(35);
    expect(out.duty).toBeNull();
    expect(out.total).toBeNull();
  });

  it('takes VAT off the price, and 0% leaves it as it is', () => {
    expect(run({ vatPercent: 0 }).goodsValue).toBe(500);
    expect(run({ vatPercent: 0 }).vatAmount).toBe(0);
    expect(run({ vatPercent: 9 }).goodsValue).toBe(458.72);
  });
});

describe('checking the form', () => {
  it('asks for every number above 0, and a category', () => {
    const errors = validateInput({
      priceInclVat: '',
      lengthCm: '0',
      widthCm: '-2',
      heightCm: 'x',
      weightGrams: '35',
      category: '',
    });

    expect(Object.keys(errors).sort()).toEqual([
      'category',
      'heightCm',
      'lengthCm',
      'priceInclVat',
      'widthCm',
    ]);
  });

  it('is happy with a complete form', () => {
    const values = {
      priceInclVat: '500',
      lengthCm: '75',
      widthCm: '80',
      heightCm: '45',
      weightGrams: '35',
      category: 'shoes',
    };
    expect(validateInput(values)).toEqual({});
  });
});

describe('handling costs, by the rules from the server', () => {
  const RULES = [
    { up_to_eur: '500.00', fee_eur: '50.00', suppliers_included: null },
    { up_to_eur: null, fee_eur: '150.00', suppliers_included: 2 },
  ];

  it.each([
    [100, 50],
    [250, 50],
    [500, 50],
    [500.004, 50],
    [501, 150],
    [750, 150],
    [1000, 150],
  ])('EUR %s purchase -> EUR %s handling', (value, fee) => {
    expect(handlingFeeFor(value, RULES)).toBe(fee);
  });

  it('is unknown without the rules, and then there is no total either', () => {
    expect(handlingFeeFor(500, null)).toBeNull();
    const tables = {
      rates: { curacao: { sea: { perM3: 100 }, fees: { administration: 25 }, localTaxPercent: 6 } },
      duties: { curacao: { shoes: 10 } },
    };
    const input = {
      destination: 'curacao', priceInclVat: 121, vatPercent: 21, lengthCm: 100, widthCm: 100,
      heightCm: 100, weightGrams: 1000, category: 'shoes', transport: 'sea',
    };
    const without = calculate(input, tables);
    expect(without.handling).toBeNull();
    expect(without.fees.map((fee) => fee.key)).toEqual(['administration']);
    expect(without.total).toBeNull();

    const withRules = calculate(input, { ...tables, handlingRules: RULES });
    expect(withRules.fees).toEqual([
      { key: 'administration', amount: 25 },
      { key: 'handling', amount: 50 },
    ]);
    expect(withRules.total).not.toBeNull();
  });
});
