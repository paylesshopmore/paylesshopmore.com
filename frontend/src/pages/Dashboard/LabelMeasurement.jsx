// src/pages/Dashboard/LabelMeasurement.jsx
//
// The Measurement box next to the label reader on the intake sheet: one
// package's weights and sizes, in big boxes a thumb can hit on an iPad.
//
//   Weight      actual / volumetric / chargeable (kg)
//   Dimensions  length / width / height (cm)
//   Volume      L × W × H / 1,000,000 m³, worked out, never typed
//
// These are not a second set of numbers. They ARE the sheet's measured
// lines (draft.measurements, saved as warehouse.Measurement rows) - this box
// edits one line at a time, the one picked with the "Package 1 / 2 / +"
// buttons, and the Measurements step shows the same lines in full. So a
// label tapped in here and a tape measure typed in there end up in the same
// place.
//
// Units: everything is stored in kg and cm. A box also takes "13400 g" or
// "600 mm"; when the worker leaves the box it is converted (13.4, 60) and
// the unit it came in is kept with the line (weight_unit / dimension_unit).
//
// Volumetric and chargeable weight may be left blank: then they are worked
// out (from the sizes and the freight, and as the higher of actual and
// volumetric) and shown under the box. Typed or read from a label, the
// carrier's own figure wins. Actual weight is what the goods weigh and is
// never filled in from the volume weight.

import { parseLength, parseWeight, toNumber, volumeM3 } from '../../ocr/labelFields';
import { transportTypeForFreight, TRANSPORT_TYPES } from '../../utils/volumeWeight';
import { EMPTY_LINE } from './measure';
import styles from './Dashboard.module.css';
import { usePageText } from './usePageText';

const WEIGHTS = [
  ['weight_kg', 'actualWeight'],
  ['volumetric_weight_kg', 'volumetricWeight'],
  ['chargeable_weight_kg', 'chargeableWeight'],
];

const SIZES = [
  ['length_cm', 'lengthCm'],
  ['width_cm', 'widthCm'],
  ['height_cm', 'heightCm'],
];

/** A box's text as a number, or null ("13,4" counts; "13.4 kg" does not yet). */
function numberIn(value) {
  return toNumber(String(value ?? '').trim());
}

/** Rounded for showing: at most `decimals`, without trailing zeros. */
function shown(value, decimals) {
  return String(Number(value.toFixed(decimals)));
}

/**
 * @param {{ lines: object[], index: number, onIndexChange: (index: number) => void,
 *           onChange: (lines: object[]) => void, freight: string,
 *           assigned?: Set<string>, disabled?: boolean }} props
 *   lines          the sheet's measured lines (draft.measurements)
 *   index          which line this box shows; the label reader fills the same one
 *   onIndexChange  another package was picked (or added)
 *   onChange       the new list of lines
 *   freight        'sea' / 'air' / '' - for the worked-out volume weight
 *   assigned       "weight_kg", "length_cm" ... the boxes filled from a label,
 *                  shown highlighted until they are edited
 */
export default function LabelMeasurement({
  lines,
  index,
  onIndexChange,
  onChange,
  freight,
  assigned = new Set(),
  disabled = false,
}) {
  const d = usePageText('intake');
  const line = lines[index] ?? EMPTY_LINE;

  // Changes one box of the shown line; with no lines yet, the first is made.
  function update(changes) {
    if (lines.length === 0) {
      onChange([{ ...EMPTY_LINE, ...changes }]);
      onIndexChange(0);
      return;
    }
    onChange(lines.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  }

  // On leaving a box: "13400 g" becomes 13.4 (and weight_unit g). A bare
  // number is left as typed; something that is not a number is left too,
  // and said so under the box.
  function convert(field, kind) {
    const text = String(line[field] ?? '').trim();
    if (!text || numberIn(text) !== null) return;
    if (kind === 'weight') {
      const weight = parseWeight(text, { defaultUnit: null });
      if (weight) update({ [field]: String(weight.kg), weight_unit: weight.unit });
    } else {
      const length = parseLength(text, { defaultUnit: null });
      if (length) update({ [field]: String(length.cm), dimension_unit: length.unit });
    }
  }

  function addPackage() {
    onChange([...lines, { ...EMPTY_LINE }]);
    onIndexChange(lines.length);
  }

  const length = numberIn(line.length_cm);
  const width = numberIn(line.width_cm);
  const height = numberIn(line.height_cm);
  const each = volumeM3(length, width, height);
  const quantity = Number(line.quantity) || 1;

  // What the blank weight boxes work out to, shown under them.
  const transportType = transportTypeForFreight(freight);
  const worked = {};
  if (each !== null && transportType) {
    worked.volumetric_weight_kg = (length * width * height) / TRANSPORT_TYPES[transportType].cm3PerKg;
  }
  const actual = numberIn(line.weight_kg);
  const volumetric = numberIn(line.volumetric_weight_kg) ?? worked.volumetric_weight_kg ?? null;
  if (actual !== null && volumetric !== null) worked.chargeable_weight_kg = Math.max(actual, volumetric);

  function box(field, labelKey, kind) {
    const value = line[field] ?? '';
    const bad = String(value).trim() !== '' && numberIn(value) === null;
    const hint = bad
      ? d('notANumber', { text: value })
      : String(value).trim() === '' && worked[field] !== undefined
        ? d('worksOut', { value: `${shown(worked[field], 2)} kg` })
        : '';
    return (
      <label key={field} className={styles.intakeField}>
        <span className={styles.intakeLabel}>{d(labelKey)}</span>
        <input
          className={[styles.measureBig, assigned.has(field) ? styles.intakeInputAssigned : ''].join(' ')}
          // Text rather than number, so "13400 g" can be typed and converted.
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={bad || undefined}
          disabled={disabled}
          onChange={(event) => update({ [field]: event.target.value })}
          onBlur={() => convert(field, kind)}
        />
        {hint && <span className={styles.measureBoxHint}>{hint}</span>}
      </label>
    );
  }

  return (
    <div className={styles.labelMeasure}>
      <p className={styles.intakeHint}>{d('measureHint')}</p>

      {/* Which package the boxes (and the label reader) are filling in. */}
      <div className={styles.labelMeasurePackages} role="group" aria-label={d('measureSection')}>
        {lines.map((_, i) => (
          <button
            // Position as the key, as in Measurements.jsx: lines have no id until saved.
            key={i}
            type="button"
            className={styles.modeOption}
            aria-pressed={i === index}
            disabled={disabled}
            onClick={() => onIndexChange(i)}
          >
            {d('measurePackage', { number: i + 1 })}
          </button>
        ))}
        <button type="button" className={styles.rowButton} disabled={disabled} onClick={addPackage}>
          {d('measureAddPackage')}
        </button>
      </div>

      <p className={styles.labelMeasureHead}>{d('measureWeight')}</p>
      <div className={styles.labelMeasureGrid}>
        {WEIGHTS.map(([field, labelKey]) => box(field, labelKey, 'weight'))}
      </div>

      <p className={styles.labelMeasureHead}>{d('measureDimensions')}</p>
      <div className={styles.labelMeasureGrid}>
        {SIZES.map(([field, labelKey]) => box(field, labelKey, 'size'))}
        <div className={styles.intakeField}>
          <span className={styles.intakeLabel}>{d('volumeM3')}</span>
          {/* Worked out, never typed: L × W × H / 1,000,000. */}
          <output className={styles.labelMeasureVolume}>
            {each === null ? '—' : shown(each, 3)}
          </output>
          {each !== null && quantity > 1 && (
            <span className={styles.measureBoxHint}>
              {d('volumeTotal', { each: shown(each, 3), quantity, total: shown(each * quantity, 3) })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
