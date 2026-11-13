// The form logic: from what the employee typed to lines, totals and the
// request body. These are the five situations the invoice spec asks to be
// tested - normal, zero-VAT export, negative adjustment, missing shipment
// data and multiple packages - plus validation.

import { describe, expect, it } from 'vitest';
import {
  buildDocument,
  chosenNumber,
  computeInvoice,
  emptyForm,
  newLine,
  newMeasurement,
  toApiBody,
  validate,
} from './invoiceForm';

const SETTINGS = {
  standard_vat_rate: '21.00',
  export_vat_rate: '0.00',
  insurance_rate_percent: null,
  insurance_minimum: null,
  payment_instructions: 'Gelieve bij betaling het zendingsnummer ({zendingsnummer}) te vermelden.',
  terms_intro: 'Wanneer u een zending doet met {bedrijf}, gaat u akkoord met:',
  terms_items: 'De Algemene voorwaarden\nDe Fenex-condities',
  exclusions_title: 'Niet inbegrepen:',
  exclusions_items: 'Opslag',
  export_vat_note: '0% BTW export',
  footer_text: 'Kleine letters',
};
const CONFIG = {
  settings: SETTINGS,
  company: { name: 'Pay Less Shop More' },
  permissions: { can_adjust: true },
};

/** A filled-in form for John's shipment with the three standard charges. */
function johnsForm(overrides = {}) {
  return {
    ...emptyForm(),
    customer: { id: 12, name: 'John Smith' },
    package: 100,
    shipment_number: 'CIT-SE-006648',
    lines: [
      newLine('charge', 'Zeevracht', '850'),
      newLine('charge', 'Administratie', '35,00'),
      newLine('charge', 'Handling Fee', '485,48'),
    ],
    ...overrides,
  };
}

describe('computeInvoice', () => {
  it('normal invoice: standard VAT when export is not verified', () => {
    const { totals, vatRate } = computeInvoice(johnsForm(), SETTINGS);

    expect(vatRate).toBe('21.00');
    expect(totals).toEqual({ subtotal: 137048, adjustments: 0, totalExcl: 137048, vat: 28780, total: 165828 });
  });

  it('zero-VAT export invoice: only when export is verified', () => {
    const { totals } = computeInvoice(johnsForm({ export_verified: true }), SETTINGS);

    expect(totals.vat).toBe(0);
    expect(totals.total).toBe(137048);
  });

  it('negative contractual adjustment lowers the total', () => {
    const form = johnsForm({ export_verified: true });
    form.lines.push(newLine('adjustment', '', '-100'));

    const { totals, lines } = computeInvoice(form, SETTINGS);

    expect(totals.adjustments).toBe(-10000);
    expect(totals.total).toBe(127048);
    expect(lines.at(-1).description).toBe('Contractuele verrekening conform overeenkomst');
  });

  it('an adjustment larger than the charges makes a credit invoice', () => {
    const form = johnsForm({ export_verified: true });
    form.lines.push(newLine('adjustment', '', '-2.000,00'));

    const doc = buildDocument(form, CONFIG, computeInvoice(form, SETTINGS));

    expect(doc.totals.total).toBe(-62952);
    expect(doc.credit).toBe(true);
  });

  it('multiple packages: volume and volume weight from the calculator', () => {
    const form = johnsForm({
      useMeasurements: true,
      measurements: [
        { ...newMeasurement(), length_cm: '120', width_cm: '80', height_cm: '100', count: '2' },
        { ...newMeasurement(), length_cm: '60', width_cm: '40', height_cm: '40', count: '3' },
      ],
    });

    const computed = computeInvoice(form, SETTINGS);

    expect(computed.pieces).toBe('5');
    expect(computed.volumeM3).toBe('2.208');
    expect(computed.volumeWeightKg).toBe('368.00');
  });

  it('missing shipment data still gives totals and a printable document', () => {
    const form = johnsForm({ shipment_number: '', bill_to: '', weight_kg: '', volume_m3: '' });

    const computed = computeInvoice(form, SETTINGS);
    const doc = buildDocument(form, CONFIG, computed);

    expect(computed.totals.total).toBe(165828);
    expect(doc.billTo).toEqual([]);
    expect(doc.paymentInstructions).toBe('Gelieve bij betaling het zendingsnummer () te vermelden.');
  });

  it('no totals while an amount is still missing', () => {
    const form = johnsForm();
    form.lines.push(newLine('charge', 'Weegkosten', ''));

    expect(computeInvoice(form, SETTINGS).totals).toBeNull();
  });

  it('insurance premium from a configured rate', () => {
    const form = johnsForm({ insured_value: '8.390,00', own_risk: '250' });
    form.lines.push(newLine('insurance'));

    const computed = computeInvoice(form, { ...SETTINGS, insurance_rate_percent: '1.5', insurance_minimum: '25.00' });
    const insurance = computed.lines.find((line) => line.kind === 'insurance');

    expect(insurance.cents).toBe(12585);
    expect(insurance.description).toBe('Verzekering (verzekerde waarde € 8.390,00 - eigen risico € 250,00)');
  });
});

describe('validate', () => {
  const permissions = { can_adjust: false };

  it('asks for a customer, a shipment and a charge', () => {
    const result = validate(emptyForm(), SETTINGS, permissions);

    expect(result.ok).toBe(false);
    expect(result.fields.package).toBe('pickShipment');
    expect(result.fields.lines).toBe('noLines');
  });

  it('refuses a negative charge and points at the line', () => {
    const form = johnsForm();
    form.lines[0].amount = '-5';

    const result = validate(form, SETTINGS, permissions);

    expect(result.lines[form.lines[0].key]).toBe('negative');
  });

  it('only an admin may add an adjustment', () => {
    const form = johnsForm();
    form.lines.push(newLine('adjustment', '', '-10'));

    expect(validate(form, SETTINGS, { can_adjust: false }).ok).toBe(false);
    expect(validate(form, SETTINGS, { can_adjust: true }).ok).toBe(true);
  });

  it('wants a premium typed in when no rate is configured', () => {
    const form = johnsForm({ insured_value: '1000' });
    form.lines.push(newLine('insurance'));

    expect(validate(form, SETTINGS, permissions).fields.insurance_fee).toBe('premium');
  });

  it('points at an incomplete box in the calculator', () => {
    const form = johnsForm({ useMeasurements: true, measurements: [newMeasurement()] });

    expect(validate(form, SETTINGS, permissions).fields.measurements).toBe('boxes');
  });

  it('accepts a complete form', () => {
    expect(validate(johnsForm(), SETTINGS, permissions).ok).toBe(true);
  });
});

describe('toApiBody', () => {
  it('turns Dutch-typed numbers into API decimals', () => {
    const body = toApiBody(johnsForm({ weight_kg: '1.250,5', volume_m3: '1,55', insured_value: '8.390,00' }), 'sent');

    expect(body).toMatchObject({
      customer: 12,
      package: 100,
      status: 'sent',
      weight_kg: '1250.5',
      volume_m3: '1.55',
      insured_value: '8390.00',
      measurements: [],
    });
    expect(body.lines.map((line) => line.amount)).toEqual(['850.00', '35.00', '485.48']);
  });

  it('sends the measured boxes instead of a typed volume', () => {
    const form = johnsForm({
      useMeasurements: true,
      volume_m3: '9',
      measurements: [{ ...newMeasurement(), length_cm: '120,5', width_cm: '80', height_cm: '100', count: '2' }],
    });

    const body = toApiBody(form);

    expect(body.volume_m3).toBeNull();
    expect(body.measurements).toEqual([{ length_cm: '120.5', width_cm: '80', height_cm: '100', count: 2 }]);
  });
});

describe('the invoice number box', () => {
  const fresh = (number, suggested = 'PLSM20260015') => johnsForm({ number, suggestedNumber: suggested });

  it('sends nothing while the number is the suggested one', () => {
    expect(chosenNumber(fresh('PLSM20260015'))).toBe('');
    expect(toApiBody(fresh('PLSM20260015')).number).toBe('');
  });

  it('sends the number when it was changed (to carry on from another number)', () => {
    expect(chosenNumber(fresh('PLSM20260031'))).toBe('PLSM20260031');
    expect(toApiBody(fresh('  PLSM20260031 ')).number).toBe('PLSM20260031');
  });

  it('an emptied box means "the next number"', () => {
    expect(chosenNumber(fresh('   '))).toBe('   '.trim());
    expect(toApiBody(fresh('')).number).toBe('');
  });

  it('a saved invoice never sends a number: it keeps the one it has', () => {
    const saved = johnsForm({ invoiceId: 7, number: 'PLSM20260014', suggestedNumber: '' });
    expect(toApiBody(saved).number).toBe('');
  });

  it('refuses odd characters and too long a number, pointing at the box', () => {
    expect(validate(fresh('PLSM 2026/15'), SETTINGS, { can_adjust: true }).fields.number).toBe('numberFormat');
    expect(validate(fresh('A'.repeat(31)), SETTINGS, { can_adjust: true }).fields.number).toBe('numberLong');
  });

  it('accepts letters, digits and dashes', () => {
    expect(validate(fresh('OLD-77'), SETTINGS, { can_adjust: true }).fields.number).toBeUndefined();
  });
});
