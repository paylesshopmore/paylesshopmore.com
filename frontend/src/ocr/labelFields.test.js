// Reading a shipping label's chips: what is a weight, what is a size, what is
// the tracking number - and the unit conversions behind them.

import { describe, expect, it } from 'vitest';
import {
  classifyChip,
  detailValue,
  isConfident,
  measureValues,
  parseDimensions,
  parseLength,
  parseWeight,
  splitChips,
  toCm,
  toKg,
  volumeM3,
} from './labelFields';

describe('units', () => {
  it('converts to kg and cm', () => {
    expect(toKg(1000, 'g')).toBe(1);
    expect(toCm(100, 'cm')).toBe(100);
    expect(toCm(1, 'm')).toBe(100);
    expect(toCm(1000, 'mm')).toBe(100);
  });

  it('works out the volume in m³', () => {
    expect(volumeM3(60, 40, 20)).toBeCloseTo(0.048);
    expect(volumeM3(60, null, 20)).toBeNull();
  });

  it('reads weights in kg and g, with a comma or a point', () => {
    expect(parseWeight('13.40 KG')).toEqual({ kg: 13.4, unit: 'kg' });
    expect(parseWeight('13,4 kg')).toEqual({ kg: 13.4, unit: 'kg' });
    expect(parseWeight('13400 G')).toEqual({ kg: 13.4, unit: 'g' });
    expect(parseWeight('13.4')).toEqual({ kg: 13.4, unit: 'kg' });
    expect(parseWeight('13.4', { defaultUnit: null })).toBeNull();
  });

  it('reads one size in cm, mm or m', () => {
    expect(parseLength('600 mm')).toEqual({ cm: 60, unit: 'mm' });
    expect(parseLength('0.6 M')).toEqual({ cm: 60, unit: 'm' });
    expect(parseLength('60')).toEqual({ cm: 60, unit: 'cm' });
  });

  it('splits dimensions printed in the usual ways', () => {
    const cm = { length: 60, width: 40, height: 20 };
    expect(parseDimensions('60x40x20 CM')).toEqual({ ...cm, unit: 'cm' });
    expect(parseDimensions('60 X 40 X 20cm')).toEqual({ ...cm, unit: 'cm' });
    expect(parseDimensions('600*400*200 MM')).toEqual({ ...cm, unit: 'mm' });
    expect(parseDimensions('0,6×0,4×0,2 m')).toEqual({ ...cm, unit: 'm' });
    expect(parseDimensions('L60 W40 H20')).toEqual({ ...cm, unit: 'cm' });
    expect(parseDimensions('LOT 21')).toBeNull();
  });
});

describe('chips', () => {
  it('cuts a line with several captions into one chip each, losing nothing', () => {
    expect(splitChips(['SHIP DATE: 03NOV26 ACTWGT: 13.40 KG CAD: 260433577/FAPI208', 'C MELODIE'])).toEqual([
      'SHIP DATE: 03NOV26',
      'ACTWGT: 13.40 KG',
      'CAD: 260433577/FAPI208',
      'C MELODIE',
    ]);
  });

  it('recognises the captions on a FedEx label', () => {
    expect(classifyChip('ACTWGT: 13.40 KG')).toMatchObject({ kind: 'actualWeight', weight: { kg: 13.4 } });
    expect(classifyChip('DIMS: 60x40x20 CM')).toMatchObject({
      kind: 'dimensions',
      dimensions: { length: 60, width: 40, height: 20 },
    });
    expect(classifyChip('SHIP DATE: 03NOV26')).toMatchObject({ kind: 'ship_date', value: '03NOV26' });
    expect(classifyChip('CAD: 260433577/FAPI208')).toMatchObject({ kind: 'shipment_reference' });
    expect(classifyChip('REF: EASYEXPRESS_FEDEX_1')).toMatchObject({ kind: 'reference' });
    expect(classifyChip('ORIGIN ID:XPJA')).toMatchObject({ kind: 'origin_id', value: 'XPJA' });
    expect(classifyChip('TRK# 8796 3229 7750')).toMatchObject({ kind: 'tracking_number', value: '8796 3229 7750' });
    expect(classifyChip('FedEx')).toMatchObject({ kind: 'carrier' });
  });

  it('never takes a volume weight for the actual weight', () => {
    expect(classifyChip('VOL WGT: 9.6 KG').kind).toBe('volumetricWeight');
    expect(classifyChip('DIM WEIGHT: 9.6 KG').kind).toBe('volumetricWeight');
    expect(classifyChip('CHG WGT: 13.4 KG').kind).toBe('chargeableWeight');
    // A weight without a caption: the worker says which one it is.
    expect(classifyChip('13.40 KG').kind).toBe('weight');
  });

  it('reads captions in other languages', () => {
    expect(classifyChip('POIDS: 3,5 kg')).toMatchObject({ kind: 'actualWeight', weight: { kg: 3.5 } });
    expect(classifyChip('Gewicht: 2 kg').kind).toBe('actualWeight');
    expect(classifyChip('Afmetingen: 30x20x10').kind).toBe('dimensions');
  });

  it('leaves names, addresses and empty captions for a tap', () => {
    for (const chip of ['C MELODIE', '8-10 RUE DE LA HAIE COQ CIFA', 'LOT 21', 'PO BOX 12', 'SIZE: M']) {
      expect(isConfident(classifyChip(chip))).toBe(false);
    }
    // "PO:" with nothing after it is recognised, but there is nothing to fill in.
    expect(classifyChip('PO:')).toMatchObject({ kind: 'purchase_order', value: '' });
    expect(isConfident(classifyChip('PO:'))).toBe(false);
    expect(isConfident(classifyChip('ACTWGT: 13.40 KG'))).toBe(true);
  });
});

describe('what a box gets', () => {
  it('sends the weight to the chosen weight box, in kg', () => {
    expect(measureValues('actualWeight', 'ACTWGT: 13.40 KG')).toEqual({ weight_kg: '13.4', weight_unit: 'kg' });
    expect(measureValues('volumetricWeight', '13400 G')).toEqual({
      volumetric_weight_kg: '13.4',
      weight_unit: 'g',
    });
  });

  it('splits dimensions into length, width and height', () => {
    expect(measureValues('dimensions', 'DIMS: 60x40x20 CM')).toEqual({
      length_cm: '60',
      width_cm: '40',
      height_cm: '20',
      dimension_unit: 'cm',
    });
    expect(measureValues('height', '1000 MM')).toEqual({ height_cm: '100', dimension_unit: 'mm' });
  });

  it('does not make a weight out of a tracking number', () => {
    expect(measureValues('actualWeight', 'TRK# 8796')).toBeNull();
  });

  it('takes the value after a caption for Shipment details', () => {
    expect(detailValue('TRK# 8796 3229 7750')).toBe('8796 3229 7750');
    expect(detailValue('8796 3229 7750')).toBe('8796 3229 7750');
  });
});
