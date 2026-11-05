// src/ocr/labelFields.js
//
// Making sense of the text on a shipping label: which piece is a weight,
// which is the box's size, which is the tracking number. Pure functions, no
// React, so every rule here can be tested on its own (labelFields.test.js).
//
// The label reader (pages/Dashboard/LabelReader.jsx) uses this to:
//
//   1. split a line that holds several captions into separate chips
//      ("SHIP DATE: 03NOV26 ACTWGT: 13.40 KG" -> two chips),
//   2. tag each chip with what it probably is (classifyChip),
//   3. turn a chip into numbers for the Measurement boxes, converted to the
//      units we store: KG for weight, CM for sizes (parseWeight,
//      parseDimensions, parseLength).
//
// What it does NOT do is guess names and addresses - which name is the
// sender is for the person holding the box to say. Only text with a printed
// caption ("ACTWGT:", "TRK#", "DIMS:") is ever filled in by itself.

// ---------------------------------------------------------------- units

// How many kg / cm one of each unit is. 1000 G = 1 KG, 1000 MM = 100 CM,
// 1 M = 100 CM.
const KG_PER = { kg: 1, g: 0.001 };
const CM_PER = { cm: 1, mm: 0.1, m: 100 };

/** Rounds to the decimals the database keeps (kg: 2, cm: 1), as a number. */
function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** A weight in kg, from a value in `unit` ('kg' or 'g'). */
export function toKg(value, unit = 'kg') {
  return round(value * (KG_PER[unit] ?? 1), 2);
}

/** A size in cm, from a value in `unit` ('cm', 'mm' or 'm'). */
export function toCm(value, unit = 'cm') {
  return round(value * (CM_PER[unit] ?? 1), 1);
}

/** Volume in m³ from three sizes in cm: L × W × H / 1,000,000. */
export function volumeM3(length, width, height) {
  if ([length, width, height].some((value) => value === null || value === undefined || Number.isNaN(value))) {
    return null;
  }
  return (length * width * height) / 1_000_000;
}

/**
 * "13,40" or "13.40" or "1.234,5" as a number; null when it is not one.
 * The last . or , is the decimal point when both appear.
 */
export function toNumber(text) {
  let value = String(text ?? '').trim();
  if (!value) return null;
  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // The earlier one is a thousands separator.
    const thousands = lastDot > lastComma ? ',' : '.';
    value = value.split(thousands).join('');
  }
  value = value.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(value) && !/^\.\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const NUMBER = String.raw`(\d+(?:[.,]\d+)*)`;
// KG before G, so "13 KG" is not read as 13 G; "KGS", "KILO", "GR", "GRAM" too.
const WEIGHT_UNIT = String.raw`(kgs?|kilos?|kilograms?|grams?|gr|g)`;
// MM before M.
const LENGTH_UNIT = String.raw`(cm|mm|m)`;

function weightUnit(word) {
  return /^k/i.test(word) ? 'kg' : 'g';
}

/**
 * The first weight in a piece of text, in kg.
 *
 *   parseWeight('ACTWGT: 13.40 KG')  -> { kg: 13.4, unit: 'kg' }
 *   parseWeight('13400 G')           -> { kg: 13.4, unit: 'g' }
 *   parseWeight('13.4')              -> { kg: 13.4, unit: 'kg' }   (defaultUnit)
 *
 * @param {string} text
 * @param {{ defaultUnit?: 'kg'|'g'|null }} [options]  the unit for a bare
 *   number; null means a bare number is not a weight
 * @returns {{ kg: number, unit: 'kg'|'g' } | null}
 */
export function parseWeight(text, { defaultUnit = 'kg' } = {}) {
  const value = String(text ?? '');
  const withUnit = value.match(new RegExp(`${NUMBER}\\s*${WEIGHT_UNIT}(?![\\p{L}])`, 'iu'));
  if (withUnit) {
    const number = toNumber(withUnit[1]);
    if (number === null) return null;
    const unit = weightUnit(withUnit[2]);
    return { kg: toKg(number, unit), unit };
  }
  if (!defaultUnit) return null;
  const bare = value.match(new RegExp(NUMBER));
  const number = bare ? toNumber(bare[1]) : null;
  return number === null ? null : { kg: toKg(number, defaultUnit), unit: defaultUnit };
}

/**
 * One size, in cm: '60 CM' -> 60, '600 mm' -> 60, '0.6 m' -> 60, '60' -> 60.
 *
 * @returns {{ cm: number, unit: 'cm'|'mm'|'m' } | null}
 */
export function parseLength(text, { defaultUnit = 'cm' } = {}) {
  const value = String(text ?? '');
  const withUnit = value.match(new RegExp(`${NUMBER}\\s*${LENGTH_UNIT}(?![\\p{L}])`, 'iu'));
  if (withUnit) {
    const number = toNumber(withUnit[1]);
    if (number === null) return null;
    const unit = withUnit[2].toLowerCase();
    return { cm: toCm(number, unit), unit };
  }
  if (!defaultUnit) return null;
  const bare = value.match(new RegExp(NUMBER));
  const number = bare ? toNumber(bare[1]) : null;
  return number === null ? null : { cm: toCm(number, defaultUnit), unit: defaultUnit };
}

/**
 * Length × width × height, in cm, from the way labels print them:
 *
 *   '60x40x20 CM', '60 X 40 X 20cm', '600*400*200 MM', '0,6×0,4×0,2 m',
 *   'L60 W40 H20 CM', 'L: 60 B: 40 H: 20'
 *
 * Without a unit, cm. Returns null when there are not three sizes.
 *
 * @returns {{ length: number, width: number, height: number, unit: 'cm'|'mm'|'m' } | null}
 */
export function parseDimensions(text) {
  const value = String(text ?? '');
  const tail = String.raw`\s*${LENGTH_UNIT}?(?![\p{L}])`;
  const crossed = value.match(
    new RegExp(`${NUMBER}\\s*${LENGTH_UNIT}?\\s*[x×*]\\s*${NUMBER}\\s*${LENGTH_UNIT}?\\s*[x×*]\\s*${NUMBER}${tail}`, 'iu'),
  );
  let numbers;
  let unitWord;
  if (crossed) {
    numbers = [crossed[1], crossed[3], crossed[5]];
    // The unit is usually printed once, at the end; sometimes after each.
    unitWord = crossed[6] || crossed[4] || crossed[2];
  } else {
    // L 60 W 40 H 20 (B for breedte, A for ancho/altura is too ambiguous).
    const lettered = value.match(
      new RegExp(
        `L\\s*[:=]?\\s*${NUMBER}\\s*[,;/]?\\s*[WB]\\s*[:=]?\\s*${NUMBER}\\s*[,;/]?\\s*H\\s*[:=]?\\s*${NUMBER}${tail}`,
        'iu',
      ),
    );
    if (!lettered) return null;
    numbers = [lettered[1], lettered[2], lettered[3]];
    unitWord = lettered[4];
  }
  const unit = (unitWord || 'cm').toLowerCase();
  const [length, width, height] = numbers.map(toNumber);
  if ([length, width, height].includes(null)) return null;
  return { length: toCm(length, unit), width: toCm(width, unit), height: toCm(height, unit), unit };
}

// ---------------------------------------------------------------- captions

// The "Shipment details" a label can carry, in the order they are shown. The
// same keys as SHIPMENT_DETAIL_KEYS in backend/warehouse/serializers.py.
export const SHIPMENT_DETAILS = [
  'tracking_number',
  'ship_date',
  'shipment_reference',
  'reference',
  'purchase_order',
  'invoice',
  'department',
  'origin_id',
  'carrier',
  'service',
];

// The Measurement boxes a chip can go into.
export const MEASURE_TARGETS = [
  'actualWeight',
  'volumetricWeight',
  'chargeableWeight',
  'dimensions',
  'length',
  'width',
  'height',
];

// Which column of a measured line each Measurement box writes.
export const MEASURE_FIELD = {
  actualWeight: 'weight_kg',
  volumetricWeight: 'volumetric_weight_kg',
  chargeableWeight: 'chargeable_weight_kg',
  length: 'length_cm',
  width: 'width_cm',
  height: 'height_cm',
};

// Printed captions, by what they introduce. Checked in this order, so the
// more specific ones come first: "VOL WGT" must not be read as "WGT", and
// "DIM WEIGHT" is a volume weight, not a size. English, Dutch, French,
// Spanish and German, the languages labels at the warehouse arrive in.
// Each is matched at the start of a chip and must not run on into a word.
const CAPTIONS = [
  ['volumetricWeight', String.raw`vol(?:ume)?\.?\s*(?:wgt|wt|weight)|volumetric(?:\s*weight)?|dim\.?\s*(?:wgt|wt|weight)|volumegewicht|poids\s+volum[eé]trique|peso\s+volum[eé]trico|volumengewicht`],
  ['chargeableWeight', String.raw`(?:chg|chrg|chargeable|chargable|billable|billed)\.?\s*(?:wgt|wt|weight)?|poids\s+taxable|peso\s+(?:facturable|tasable|cobrable)|belastbaar\s+gewicht|frachtpflichtiges\s+gewicht`],
  ['actualWeight', String.raw`act\.?\s*(?:wgt|wt|weight)|actual\s+weight|gross\s*(?:wgt|wt|weight)?|g\.\s*w\.?|wgt|weight|gewicht|brutogewicht|bruttogewicht|poids(?:\s+r[eé]el|\s+brut)?|peso(?:\s+real|\s+bruto)?`],
  ['dimensions', String.raw`dims?|dimensions?|afmetingen|afm\.?|ma(?:ss|ß)e|dimensiones|size`],
  ['ship_date', String.raw`ship\s*date|shipping\s+date|date\s+d['’]?\s*exp[eé]dition|verzenddatum|versanddatum|fecha\s+de\s+env[ií]o`],
  ['tracking_number', String.raw`trk\s*#?|tracking(?:\s*(?:no|nr|number|#))?|awb(?:\s*(?:no|nr))?|zendingnummer|sendungsnummer|track\s*&\s*trace|n[°º]\s*de\s*suivi|seguimiento`],
  ['shipment_reference', String.raw`cad`],
  // Not "P.O. Box", which is an address.
  ['purchase_order', String.raw`p\.?\s*o\.?(?!\s*box)|purchase\s+order|inkooporder|bestelnummer|bon\s+de\s+commande|orden\s+de\s+compra`],
  ['reference', String.raw`ref(?:erence|erentie|erenz|erencia)?\.?|kenmerk`],
  ['invoice', String.raw`inv(?:oice)?|factuur|facture|factura|rechnung`],
  ['department', String.raw`dept\.?|department|afdeling|abteilung|departamento`],
  ['origin_id', String.raw`origin\s*id`],
].map(([kind, source]) => ({
  kind,
  source,
  // Whole chip: caption, separators, then the value (maybe empty).
  whole: new RegExp(`^(?:${source})(?![\\p{L}\\p{N}])\\s*[:#.=\\-]*\\s*(.*)$`, 'iu'),
}));

// A caption in the middle of a line, followed by ":" or "#": where a line is
// cut into two chips. Some captions (DATE, WT, size) are too common as
// ordinary words to cut on.
const SPLIT = new RegExp(
  `\\s+(?=(?:${CAPTIONS.map((caption) => caption.source).join('|')})\\s*[:#])`,
  'giu',
);

// Courier names printed on their own. Only exact words: a sender called
// "DHL Parcel Benelux" is still a sender.
const CARRIERS = /^(fedex|dhl|ups|postnl|dpd|gls|tnt|usps|bpost|colissimo|chronopost|hermes|dhl express|fedex express)$/i;

/**
 * Splits OCR lines into chips: a line holding more than one caption is cut
 * before each one after the first. Nothing is dropped.
 *
 *   ['SHIP DATE: 03NOV26 ACTWGT: 13.40 KG', 'J. Jansen']
 *     -> ['SHIP DATE: 03NOV26', 'ACTWGT: 13.40 KG', 'J. Jansen']
 *
 * @param {string[]} lines
 * @returns {string[]}
 */
export function splitChips(lines) {
  return (lines ?? []).flatMap((line) =>
    String(line)
      .split(SPLIT)
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

/**
 * What a chip (or several chips joined) probably is.
 *
 *   classifyChip('ACTWGT: 13.40 KG')
 *     -> { kind: 'actualWeight', value: '13.40 KG', captioned: true,
 *          weight: { kg: 13.4, unit: 'kg' } }
 *   classifyChip('DIMS: 60x40x20 CM')
 *     -> { kind: 'dimensions', value: '60x40x20 CM', captioned: true,
 *          dimensions: { length: 60, width: 40, height: 20, unit: 'cm' } }
 *   classifyChip('13.40 KG')      -> { kind: 'weight', captioned: false, ... }
 *   classifyChip('INV')           -> { kind: 'invoice', value: '', captioned: true }
 *   classifyChip('C MELODIE')     -> { kind: null, value: 'C MELODIE', captioned: false }
 *
 * `kind` is a Measurement box (actualWeight, volumetricWeight,
 * chargeableWeight, dimensions), 'weight' for a weight without a caption
 * (actual or volume weight - the worker says which), a Shipment details key,
 * or null when it is not recognised.
 *
 * @param {string} text
 */
export function classifyChip(text) {
  const chip = String(text ?? '').trim();

  for (const caption of CAPTIONS) {
    const found = chip.match(caption.whole);
    if (!found) continue;
    const value = found[1].trim();
    const result = { kind: caption.kind, value, captioned: true };
    if (caption.kind === 'dimensions') {
      const dimensions = parseDimensions(value);
      // "SIZE: M" is a T-shirt, not a box.
      if (!dimensions && value) continue;
      return { ...result, dimensions };
    }
    if (caption.kind.endsWith('Weight')) {
      return { ...result, weight: parseWeight(value) };
    }
    return result;
  }

  // No caption: a size or a weight can still be recognised by its shape.
  const dimensions = parseDimensions(chip);
  if (dimensions) return { kind: 'dimensions', value: chip, captioned: false, dimensions };
  const weight = parseWeight(chip, { defaultUnit: null });
  // Only when the chip is just the weight: "Lot 21 kg" street names aside,
  // a weight on a label stands on its own.
  if (weight && /^\s*\d+(?:[.,]\d+)*\s*\p{L}+\.?\s*$/u.test(chip)) {
    return { kind: 'weight', value: chip, captioned: false, weight };
  }
  if (CARRIERS.test(chip)) return { kind: 'carrier', value: chip, captioned: false };

  return { kind: null, value: chip, captioned: false };
}

/**
 * Whether a chip is certain enough to be filled in without a tap: it has a
 * printed caption, and a value that can be used.
 */
export function isConfident(classified) {
  if (!classified?.captioned || !classified.kind) return false;
  if (classified.kind === 'dimensions') return Boolean(classified.dimensions);
  if (classified.kind.endsWith('Weight')) return Boolean(classified.weight);
  return SHIPMENT_DETAILS.includes(classified.kind) && classified.value !== '';
}

/**
 * What a Measurement box gets from a piece of text, as the measured line's
 * columns (strings, as the form holds them). Null when there is no number
 * to take.
 *
 *   measureValues('actualWeight', 'ACTWGT: 13.40 KG')
 *     -> { weight_kg: '13.4', weight_unit: 'kg' }
 *   measureValues('dimensions', '600x400x200 MM')
 *     -> { length_cm: '60', width_cm: '40', height_cm: '20', dimension_unit: 'mm' }
 *
 * @param {string} target  one of MEASURE_TARGETS
 * @param {string} text
 * @returns {object|null}
 */
export function measureValues(target, text) {
  const classified = classifyChip(text);
  // "TRK# 8796 3229 7750" is a number, but not a weight or a size.
  if (classified.captioned && SHIPMENT_DETAILS.includes(classified.kind)) return null;
  // The value after a caption when there is one: "DIMS: 60x40x20" -> "60x40x20".
  const value = classified.captioned ? classified.value : String(text ?? '');

  if (target === 'dimensions') {
    const dimensions = parseDimensions(value);
    if (!dimensions) return null;
    return {
      length_cm: String(dimensions.length),
      width_cm: String(dimensions.width),
      height_cm: String(dimensions.height),
      dimension_unit: dimensions.unit,
    };
  }

  if (['length', 'width', 'height'].includes(target)) {
    const length = parseLength(value);
    if (!length) return null;
    return { [MEASURE_FIELD[target]]: String(length.cm), dimension_unit: length.unit };
  }

  const weight = parseWeight(value);
  if (!weight) return null;
  return { [MEASURE_FIELD[target]]: String(weight.kg), weight_unit: weight.unit };
}

/** The value for a Shipment details box: the text after its caption, if any. */
export function detailValue(text) {
  const classified = classifyChip(text);
  return (classified.captioned ? classified.value : String(text ?? '')).trim();
}
