// src/pages/Dashboard/invoice/invoiceForm.js
//
// THE INVOICE FORM'S DATA, WITHOUT ANY REACT IN IT.
//
// The editor page keeps one plain object, `form`, with everything the
// employee typed (see emptyForm below). This file holds every function that
// reads or converts that object:
//
//   emptyForm / formFromDefaults / formFromSaved   make a form
//   computeInvoice   work out lines, volume, insurance and totals (live)
//   validate         what is missing or wrong, in plain words
//   toApiBody        the form as the server expects it
//   buildDocument    what the printable invoice shows
//
// Keeping this out of the components means each function can be tested on
// its own, and the components stay about layout.
//
// Everything typed is kept as TEXT exactly as typed ("1.370,48"), and only
// converted when needed. That way an input never jumps or reformats itself
// while somebody is typing in it.

import {
  calculateTotals,
  centsToDecimal,
  formatEuro,
  insuranceFeeCents,
  isCredit,
  measurePackages,
  parseCents,
} from './invoiceMath';

export const ADJUSTMENT_LABEL = 'Contractuele verrekening conform overeenkomst';

let lastKey = 0;
/** A unique key for a list row, so React can tell rows apart. */
export function newKey() {
  lastKey += 1;
  return lastKey;
}

/** Today as YYYY-MM-DD, the value <input type="date"> uses. */
export function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function newLine(kind = 'charge', description = '', amount = '') {
  return { key: newKey(), kind, description, amount };
}

export function newMeasurement() {
  return { key: newKey(), length_cm: '', width_cm: '', height_cm: '', count: '1' };
}

/** A blank form. `invoiceId` stays null until the invoice has been saved. */
export function emptyForm() {
  return {
    invoiceId: null, // the saved invoice's id, once there is one
    number: '', // its number (PLSM20260012), or the next one when unsaved
    suggestedNumber: '', // the next number as offered when the form opened (a new invoice only)
    status: null, // 'pending_review', 'sent', ... for a saved invoice
    editable: true, // false once approved or sent: then read-only
    rejectionReason: '',
    customer: null, // { id, name }
    package: null, // the shipment's id
    invoice_date: today(),
    bill_to: '',
    phone: '',
    relation_number: '',
    order_number: '',
    shipment_number: '',
    freight: 'sea',
    port_of_loading: '',
    port_of_discharge: '',
    goods_description: '',
    pieces: '',
    weight_kg: '',
    volume_m3: '',
    useMeasurements: false, // true: volume comes from the box calculator
    measurements: [newMeasurement()],
    insured_value: '',
    own_risk: '',
    insurance_fee: '',
    export_verified: false,
    lines: [],
    texts: null, // a saved invoice's own wording; null = today's settings
  };
}

/** A decimal from the API ("199.00") as the text a Dutch user reads ("199,00"). */
function dutch(value) {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}

/** A new form for a shipment, filled from GET compose-defaults. */
export function formFromDefaults(defaults) {
  return {
    ...emptyForm(),
    number: defaults.next_number ?? '',
    suggestedNumber: defaults.next_number ?? '',
    customer: defaults.customer,
    package: defaults.package,
    bill_to: defaults.bill_to ?? '',
    phone: defaults.phone ?? '',
    relation_number: defaults.relation_number ?? '',
    order_number: defaults.order_number ?? '',
    shipment_number: defaults.shipment_number ?? '',
    freight: defaults.freight || 'sea',
    port_of_loading: defaults.port_of_loading ?? '',
    port_of_discharge: defaults.port_of_discharge ?? '',
    goods_description: defaults.goods_description ?? '',
    pieces: defaults.pieces === null || defaults.pieces === undefined ? '' : String(defaults.pieces),
    weight_kg: dutch(defaults.weight_kg),
    volume_m3: dutch(defaults.volume_m3),
    insured_value: dutch(defaults.insured_value),
    // The boxes the warehouse measured, when it has: the volume is then
    // worked out from them, as for boxes typed in by hand.
    ...((defaults.measurements ?? []).length > 0
      ? {
          useMeasurements: true,
          measurements: defaults.measurements.map((row) => ({
            key: newKey(),
            length_cm: dutch(row.length_cm),
            width_cm: dutch(row.width_cm),
            height_cm: dutch(row.height_cm),
            count: String(row.count ?? '1'),
          })),
        }
      : {}),
    measuredByWarehouse: defaults.measured_by_warehouse ?? null,
  };
}

/** A form for an invoice that already exists, from GET <id>/edit/. */
export function formFromSaved(saved) {
  const measurements = (saved.measurements ?? []).map((row) => ({
    key: newKey(),
    length_cm: dutch(row.length_cm),
    width_cm: dutch(row.width_cm),
    height_cm: dutch(row.height_cm),
    count: String(row.count ?? '1'),
  }));

  return {
    ...emptyForm(),
    invoiceId: saved.id,
    number: saved.number,
    status: saved.status,
    editable: saved.editable,
    rejectionReason: saved.rejection_reason ?? '',
    customer: { id: saved.customer, name: saved.customer_name },
    package: saved.package,
    invoice_date: saved.invoice_date ?? saved.dated_on ?? today(),
    bill_to: saved.bill_to,
    phone: saved.phone,
    relation_number: saved.relation_number,
    order_number: saved.order_number,
    shipment_number: saved.shipment_number,
    freight: saved.freight || 'sea',
    port_of_loading: saved.port_of_loading,
    port_of_discharge: saved.port_of_discharge,
    goods_description: saved.goods_description,
    pieces: saved.pieces === null ? '' : String(saved.pieces),
    weight_kg: dutch(saved.weight_kg),
    volume_m3: dutch(saved.volume_m3),
    useMeasurements: measurements.length > 0,
    measurements: measurements.length > 0 ? measurements : [newMeasurement()],
    insured_value: dutch(saved.insured_value),
    own_risk: dutch(saved.own_risk),
    insurance_fee: dutch(saved.insurance_fee),
    export_verified: saved.export_verified,
    lines: saved.lines.map((line) => ({
      key: newKey(),
      kind: line.kind,
      description: line.description,
      amount: dutch(line.amount),
    })),
    texts: saved.texts,
  };
}

// ---- ports ------------------------------------------------------------------

/** Active ports for this shipping method and direction, from the settings. */
export function portsFor(ports, freight, direction) {
  return ports.filter(
    (port) =>
      port.active &&
      (port.freight === freight || port.freight === 'both') &&
      (direction === 'loading' ? port.for_loading : port.for_discharge),
  );
}

/** The port to pre-select: the one marked default, or else the first. */
export function defaultPort(ports, freight, direction) {
  const options = portsFor(ports, freight, direction);
  return (options.find((port) => port.is_default) ?? options[0])?.name ?? '';
}

/** The VAT rate this form gets: the export rate only for a verified export. */
export function vatRateFor(form, settings) {
  return form.export_verified ? settings.export_vat_rate : settings.standard_vat_rate;
}

/** "Verzekering (verzekerde waarde € 8.390,00 - eigen risico € 250,00)" */
export function insuranceDescription(insuredCents, ownRiskCents) {
  const parts = [`verzekerde waarde ${formatEuro(insuredCents)}`];
  if (ownRiskCents !== null) parts.push(`eigen risico ${formatEuro(ownRiskCents)}`);
  return `Verzekering (${parts.join(' - ')})`;
}

/**
 * Everything the form adds up to, worked out the same way as the server.
 *
 * Returns:
 *   lines       [{ key, kind, description, cents }] in print order, with the
 *               insurance line's wording and amount filled in
 *   measured    the box calculator's result (or null when not used)
 *   volumeM3    the volume that will be printed, as text ("2.208")
 *   insurance   { insuredCents, ownRiskCents, feeCents, fromRate }
 *   vatRate     the percentage that applies
 *   totals      { subtotal, adjustments, totalExcl, vat, total } in cents,
 *               or null while an amount is missing or unreadable
 */
export function computeInvoice(form, settings) {
  const measured = form.useMeasurements ? measurePackages(form.measurements) : null;

  const insuredCents = parseCents(form.insured_value);
  const ownRiskCents = parseCents(form.own_risk);
  const rateFee = insuranceFeeCents(
    insuredCents,
    settings.insurance_rate_percent,
    parseCents(settings.insurance_minimum),
  );
  const feeCents = rateFee ?? parseCents(form.insurance_fee);

  const lines = form.lines.map((line) => {
    if (line.kind === 'insurance') {
      return {
        key: line.key,
        kind: line.kind,
        description: insuranceDescription(insuredCents, ownRiskCents),
        cents: feeCents,
      };
    }
    return {
      key: line.key,
      kind: line.kind,
      description: line.kind === 'adjustment' ? line.description.trim() || ADJUSTMENT_LABEL : line.description,
      cents: parseCents(line.amount),
    };
  });

  const vatRate = vatRateFor(form, settings);
  const complete = lines.length > 0 && lines.every((line) => line.cents !== null);
  const totals = complete
    ? calculateTotals(
        lines.filter((line) => line.kind !== 'adjustment').map((line) => line.cents),
        lines.filter((line) => line.kind === 'adjustment').map((line) => line.cents),
        vatRate,
      )
    : null;

  return {
    lines,
    measured,
    volumeM3: measured && measured.pieces > 0 ? measured.volumeM3 : form.volume_m3.replace(',', '.'),
    volumeWeightKg: measured && measured.pieces > 0 ? measured.volumeWeightKg : null,
    pieces: form.pieces !== '' ? form.pieces : measured && measured.pieces > 0 ? String(measured.pieces) : '',
    insurance: { insuredCents, ownRiskCents, feeCents, fromRate: rateFee !== null },
    vatRate,
    totals,
  };
}

/**
 * What is wrong with the form.
 *
 * Returns { ok, fields: { name: key }, lines: { lineKey: key }, list: [keys] }.
 *
 * The values are message KEYS such as 'noLines', not sentences: the screen
 * looks each one up in src/i18n/invoiceTranslations.js under `errors`, so the
 * message appears in whichever language the employee has chosen
 * (tr(`errors.${key}`)).
 *
 * The server checks all of this again - these are here so the employee
 * finds out while typing, not after pressing save.
 */
export function validate(form, settings, permissions) {
  const fields = {};
  const lines = {};

  if (!form.customer || !form.package) fields.package = 'pickShipment';
  // A number written by hand: letters, digits and dashes (it becomes a file name).
  const chosen = chosenNumber(form);
  if (chosen.length > 30) fields.number = 'numberLong';
  else if (chosen && !/^[A-Za-z0-9-]+$/.test(chosen)) fields.number = 'numberFormat';

  if (!form.invoice_date) fields.invoice_date = 'date';
  else if (form.invoice_date > today()) fields.invoice_date = 'futureDate';

  // A number like 199, 1,55 or 1.55 (at most three decimals).
  const isNumber = (text) => /^\d+([.,]\d{1,3})?$/.test(text.trim());
  if (form.weight_kg !== '' && !isNumber(form.weight_kg)) fields.weight_kg = 'weightNumber';
  if (form.volume_m3 !== '' && !isNumber(form.volume_m3)) fields.volume_m3 = 'volumeNumber';
  if (form.pieces !== '' && !/^\d+$/.test(form.pieces.trim())) fields.pieces = 'wholeNumber';

  if (form.useMeasurements && measurePackages(form.measurements).incomplete > 0) {
    fields.measurements = 'boxes';
  }

  if (form.lines.length === 0) fields.lines = 'noLines';
  for (const line of form.lines) {
    const cents = parseCents(line.amount);
    if (line.kind === 'charge') {
      if (!line.description.trim()) lines[line.key] = 'description';
      else if (cents === null) lines[line.key] = 'amount';
      else if (cents < 0) lines[line.key] = 'negative';
    } else if (line.kind === 'adjustment') {
      if (cents === null) lines[line.key] = 'adjustmentAmount';
      if (!permissions.can_adjust) lines[line.key] = 'adminOnly';
    }
  }

  if (form.lines.some((line) => line.kind === 'insurance')) {
    const insured = parseCents(form.insured_value);
    if (insured === null || insured < 0) fields.insured_value = 'insuredValue';
    const noRate = settings.insurance_rate_percent === null || settings.insurance_rate_percent === '';
    const fee = parseCents(form.insurance_fee);
    if (noRate && (fee === null || fee < 0)) fields.insurance_fee = 'premium';
  }
  for (const name of ['insured_value', 'own_risk']) {
    if (form[name] !== '' && parseCents(form[name]) === null && !fields[name]) fields[name] = 'money';
  }

  // Each kind of problem once, even when three lines have the same one.
  const list = [...new Set([...Object.values(fields), ...Object.values(lines)])];
  return { ok: list.length === 0, fields, lines, list };
}

/**
 * A number typed by a person -> what the API wants. "" means "not filled in".
 *   "1,55" -> "1.55"     "1.250,5" -> "1250.5"     "199" -> "199"     "" -> null
 */
function apiNumber(text) {
  const value = String(text ?? '').trim();
  if (value === '') return null;
  // With a comma, the comma is the decimal mark and any dots are thousands.
  if (value.includes(',')) return value.replace(/\./g, '').replace(',', '.');
  return value;
}

/**
 * The invoice number the person CHOSE, or '' for "the next one".
 *
 * A new invoice's number box starts with the next number (say PLSM20260015).
 * Only a number that was changed is sent to the server. Left as suggested, the
 * server hands out the next number itself when it saves, so two people writing
 * invoices at the same moment never fight over the same suggestion.
 */
export function chosenNumber(form) {
  if (form.invoiceId) return ''; // a saved invoice keeps its number
  const typed = String(form.number ?? '').trim();
  return typed === form.suggestedNumber ? '' : typed;
}

/** The form as the server's InvoiceEditorSerializer expects it. */
export function toApiBody(form, status = 'pending_review') {
  const money = (text) => {
    const cents = parseCents(text);
    return cents === null ? null : centsToDecimal(cents);
  };

  return {
    customer: form.customer?.id,
    package: form.package,
    status,
    number: chosenNumber(form),
    invoice_date: form.invoice_date,
    bill_to: form.bill_to,
    phone: form.phone,
    relation_number: form.relation_number,
    order_number: form.order_number,
    shipment_number: form.shipment_number,
    freight: form.freight,
    port_of_loading: form.port_of_loading,
    port_of_discharge: form.port_of_discharge,
    goods_description: form.goods_description,
    pieces: form.pieces === '' ? null : Number.parseInt(form.pieces, 10),
    weight_kg: apiNumber(form.weight_kg),
    volume_m3: form.useMeasurements ? null : apiNumber(form.volume_m3),
    measurements: form.useMeasurements
      ? form.measurements.map((row) => ({
          length_cm: apiNumber(row.length_cm),
          width_cm: apiNumber(row.width_cm),
          height_cm: apiNumber(row.height_cm),
          count: Number.parseInt(row.count, 10),
        }))
      : [],
    insured_value: money(form.insured_value),
    own_risk: money(form.own_risk),
    insurance_fee: money(form.insurance_fee),
    export_verified: form.export_verified,
    lines: form.lines.map((line) => ({
      kind: line.kind,
      description: line.kind === 'adjustment' ? line.description.trim() || ADJUSTMENT_LABEL : line.description.trim(),
      amount: line.kind === 'insurance' ? null : money(line.amount),
    })),
  };
}

/**
 * What the printable invoice shows, worked out from the form.
 * InvoiceTemplate.jsx only lays this out; it does no sums of its own.
 */
export function buildDocument(form, config, computed) {
  const { settings, company } = config;
  const texts = form.texts ?? settings;
  const fill = (text) =>
    (text ?? '')
      .replaceAll('{zendingsnummer}', form.shipment_number)
      .replaceAll('{bedrijf}', company.name);
  const items = (text) =>
    (text ?? '')
      .split('\n')
      .map((item) => fill(item).trim())
      .filter(Boolean);

  return {
    number: form.number || 'Concept',
    dated: form.invoice_date,
    billTo: form.bill_to.split('\n').filter((line) => line.trim()),
    phone: form.phone,
    relationNumber: form.relation_number,
    orderNumber: form.order_number,
    shipmentNumber: form.shipment_number,
    portOfLoading: form.port_of_loading,
    portOfDischarge: form.port_of_discharge,
    goodsDescription: form.goods_description,
    pieces: computed.pieces,
    weightKg: form.weight_kg,
    volumeM3: computed.volumeM3,
    volumeWeightKg: computed.volumeWeightKg,
    charges: computed.lines.filter((line) => line.kind !== 'adjustment'),
    adjustments: computed.lines.filter((line) => line.kind === 'adjustment'),
    totals: computed.totals,
    credit: computed.totals ? isCredit(computed.totals.total) : false,
    vatRate: computed.vatRate,
    exportVerified: form.export_verified,
    company,
    paymentInstructions: fill(texts.payment_instructions),
    termsIntro: fill(texts.terms_intro),
    termsItems: items(texts.terms_items),
    exclusionsTitle: fill(texts.exclusions_title),
    exclusionsItems: items(texts.exclusions_items),
    exportVatNote: form.export_verified ? texts.export_vat_note : '',
    footer: items(texts.footer_text),
  };
}

/** True when the form holds anything worth asking about before clearing it. */
export function hasContent(form) {
  return Boolean(form.package || form.lines.length > 0 || form.bill_to.trim());
}
