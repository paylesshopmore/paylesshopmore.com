// src/pages/Dashboard/Intake.jsx
//
// The warehouse intake sheet: the clipboard that gets filled in when goods
// arrive, and the button that hands it to everybody else.
//
// The form below is a wizard: one step at a time (STEPS) - the shipment and
// who it is for, the three checks, the goods, the measurements, then a last
// look and Release. Next saves the draft on the way. A switch at the top
// shows the whole form at once instead, for whoever prefers that. The fields keep the
// Dutch labels of the paper form. That is not decoration. The people filling this in
// have the paper version in their other hand for months yet, and a field that
// has been renamed to something clearer in English is a field they cannot
// find.
//
// Everything here is behind the staff guard on the route, and behind IsStaff
// on the server. A sheet says who packed badly and what arrived damaged; no
// customer ever sees one.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /warehouse/intake  (and /dashboard/intake, which redirects here)
//   Who can open: warehouse workers and office staff (RequireWarehouse)
//   Links to:     nothing; it opens one sheet in place with ?sheet=<id>
//   Linked from:  the warehouse menu, Warehouse home ("New intake sheet"), Scan, Package page, the
//                 dashboard sidebar, Measurements list, Warehouse profile, and the handover e-mail
//                 (?sheet=<id>)
//   Backend:      api/staff.js, api/profile.js

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import HelpDialog from '../../components/HelpDialog/HelpDialog';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import {
  INTAKE_CHECKS,
  INTAKE_FREIGHT,
  INTAKE_PACKAGING,
  INTAKE_STATUSES,
  assignIntakeFreight,
  createIntakeSheet,
  getIntakeRecipients,
  getIntakeSheet,
  listIntakeSheets,
  releaseIntakeSheet,
  reopenIntakeSheet,
  updateIntakeSheet,
} from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import { setWarehouseEmails } from '../../api/profile';
import IntakePhotos from './IntakePhotos';
import { SHIPMENT_DETAILS } from '../../ocr/labelFields';
import LabelMeasurement from './LabelMeasurement';
import LabelReader from './LabelReader';
import Measurements from './Measurements';
import { EMPTY_LINE, isComplete, toLine, toLinePayload, totalsFor } from './measure';
import { useCollection } from './useCollection';
import { formatDate, formatDateTime } from './format';
import {
  Banner,
  Empty,
  FilterSelect,
  Pagination,
  SearchInput,
  StatusBadge,
  Toolbar,
} from './ui';
import styles from './Dashboard.module.css';
import { labelFor, translatedOptions, usePageText } from './usePageText';

const TONES = {
  draft: 'attention',
  released: 'done',
};

// Every field the form writes, with what an empty one looks like. Written out
// rather than derived from the server's answer so that a new sheet and a
// loaded one are the same shape, and a `value={undefined}` never turns a
// controlled input into an uncontrolled one halfway through typing.
const EMPTY = {
  reference: '',
  pickup: false,
  upper_floor: false,
  employees: '',
  pickup_location: '',
  received_on: '',
  packing_required: false,
  pallet_box: false,
  volume_m3: '',
  packed_well: '',
  damage_present: '',
  address_label_present: '',
  check_notes: '',
  supplier: '',
  sender: '',
  destination: '',
  recipient: '',
  notes: '',
  colli_count: '',
  packaging: '',
  packaging_other: '',
  dimensions_weight: '',
  // No `freight`: sea or air is the office's to assign (FreightControl
  // below, its own request), so a save from the floor never sends it.
};

// How many label readings a sheet keeps (the server allows 20).
const MAX_SCANS = 20;

/** A sheet from the API, as the form holds it: nulls become empty strings. */
function toDraft(sheet) {
  const draft = { ...EMPTY };

  for (const field of Object.keys(EMPTY)) {
    const value = sheet[field];
    draft[field] = typeof value === 'boolean' ? value : (value ?? '');
  }

  draft.measurements = (sheet.measurements ?? []).map(toLine);
  // What the scanned labels said: the tapped-in details, and every reading
  // exactly as read.
  draft.shipment_details = { ...(sheet.shipment_details ?? {}) };
  draft.label_scans = sheet.label_scans ?? [];

  return draft;
}

/**
 * The form as the API wants it: the two numeric boxes go back as null when
 * they are empty, because "nobody has measured it" is not zero cubic metres.
 */
function toPayload(draft) {
  return {
    ...draft,
    volume_m3: draft.volume_m3 === '' ? null : draft.volume_m3,
    colli_count: draft.colli_count === '' ? null : draft.colli_count,
    received_on: draft.received_on === '' ? null : draft.received_on,
    measurements: draft.measurements.map(toLinePayload),
  };
}

// The wizard: the sheet is filled in one step at a time, in this order. Each
// step shows only its own part of the form; the last one checks everything
// and sends the sheet.
//
// `required`: what that step must answer before the sheet may be handed
// over. Together a copy of REQUIRED_FOR_RELEASE and REQUIRED_CHECKS in
// backend/warehouse/serializers.py, kept in the same words so the list under
// the button and the list in a refusal read identically. The server still
// decides; this lets the screen answer while somebody is typing.
const STEPS = [
  { key: 'shipment', required: ['destination'] },
  { key: 'checks', required: ['packed_well', 'damage_present', 'address_label_present'] },
  // Not freight: the office assigns it, the floor only sees it.
  { key: 'goods', required: ['colli_count'] },
  { key: 'measure', required: [] },
  { key: 'send', required: [] },
];

/**
 * What one step still needs before the sheet can be released.
 *
 * @param d usePageText('intake'), for the field names
 * @returns {string[]} the labels of everything still blank in that step.
 */
function missingInStep(step, draft, d) {
  const missing = step.required
    .filter(
      (field) =>
        String(draft[field] ?? '').trim() === '' &&
        // Answered by the lines once there are any; the server fills it in
        // from them on the save that Release does first.
        !(field === 'colli_count' && draft.measurements.length > 0),
    )
    .map((field) => d(`field.${field}`));

  if (step.key === 'goods') {
    // Verpakking counts as answered either by a choice or, for "anders", by
    // the words written on the line after it.
    if (!draft.packaging) missing.push(d('field.packaging'));
    else if (draft.packaging === 'other' && !draft.packaging_other.trim()) {
      missing.push(d('field.packaging_other'));
    }
  }

  if (step.key === 'measure' && !draft.measurements.some(isComplete)) {
    missing.push(d('field.measurements'));
  }

  return missing;
}

/**
 * @param d usePageText('intake'), for the field names
 * @returns {string[]} the labels of everything still blank, or an empty list.
 */
function missingFor(draft, d) {
  return STEPS.flatMap((step) => missingInStep(step, draft, d));
}

/**
 * Sea or air, at the top of the sheet.
 *
 * For the office (the server says so in `can_assign_freight`): a dropdown
 * that saves at once - also on a released sheet, because the warehouse hands
 * the goods over and the office decides afterwards how they travel. For the
 * warehouse: the same answer, read-only, with a picture to recognise it by,
 * and "Waiting for office assignment" until there is one. The server refuses
 * a change from a warehouse account whatever this shows.
 */
function FreightControl({ sheet, onSaved }) {
  const d = usePageText('intake');
  const c = usePageText('common');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const freight = sheet.freight || '';
  const icon = freight === 'sea' ? '🚢' : freight === 'air' ? '✈️' : '⏳';
  const name = freight
    ? labelFor(c, 'freight', freight, sheet.freight_display)
    : d('freightNotAssigned');

  if (!sheet.can_assign_freight) {
    return (
      <div className={styles.freightStatus} data-freight={freight || 'none'} role="status">
        <span className={styles.freightIcon} aria-hidden="true">{icon}</span>
        <span>
          <span className={styles.intakeLabel}>{d('freightStatus')}</span>{' '}
          <strong>{name}</strong>
          {!freight && <span className={styles.freightWaiting}>{d('freightWaiting')}</span>}
        </span>
      </div>
    );
  }

  async function change(value) {
    setBusy(true);
    setMessage('');
    try {
      onSaved(await assignIntakeFreight(sheet.id, value));
      setMessage(d('freightSaved'));
    } catch (failure) {
      setMessage(failure?.status === 403 ? d('freightRefused') : d('freightFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.freightStatus} data-freight={freight || 'none'}>
      <span className={styles.freightIcon} aria-hidden="true">{icon}</span>
      <label className={styles.freightPick}>
        <span className={styles.intakeLabel}>{d('field.freight')}</span>
        <select
          className={styles.intakeInput}
          value={freight}
          disabled={busy}
          onChange={(event) => change(event.target.value)}
        >
          <option value="">{d('freightNotAssigned')}</option>
          {translatedOptions(INTAKE_FREIGHT, c, 'freight').map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {message && <span className={styles.intakeHint}>{message}</span>}
    </div>
  );
}

/** A labelled box. `wide` spans the grid, for the ones people write in. */
function Field({ label, wide = false, children }) {
  return (
    <label className={wide ? styles.intakeFieldWide : styles.intakeField}>
      <span className={styles.intakeLabel}>{label}</span>
      {children}
    </label>
  );
}

/**
 * A Ja / Nee pair that starts on neither.
 *
 * Radio buttons rather than a checkbox, which is the whole point: a checkbox
 * has two states and this question has three. "Nobody has looked at it yet"
 * and "we looked, there is no damage" are different answers, and a form that
 * cannot tell them apart is one that quietly reports the first as the second.
 */
function CheckField({ label, name, value, onChange, disabled }) {
  const d = usePageText('intake');
  return (
    <fieldset className={styles.intakeCheck} disabled={disabled}>
      <legend className={styles.intakeLabel}>{label}</legend>
      {INTAKE_CHECKS.map((option) => (
        <label key={option.value || 'blank'} className={styles.intakeRadio}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{d(`check.${option.value || 'blank'}`)}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** A Ja / Nee that really is a yes or no: Ophalen, Verdieping, Inpakken. */
function ToggleField({ label, checked, onChange, disabled }) {
  return (
    <label className={styles.intakeToggle}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

// Which way the sheet is shown: 'wizard' (step by step) or 'form' (the whole
// form at once, as before). Remembered per browser; a convenience only, so
// a browser that will not store it simply starts on the wizard.
const MODE_KEY = 'plsm.intakeMode';

function readMode() {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'form' ? 'form' : 'wizard';
  } catch {
    return 'wizard';
  }
}

function storeMode(mode) {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Not remembered; it still switches for now.
  }
}

/**
 * One sheet, open.
 *
 * Handed the sheet rather than an id, and keyed on that id by the caller, so
 * that opening a different sheet builds a fresh form instead of leaving one
 * sheet's half-typed remarks sitting in another's boxes.
 */
function SheetForm({ sheet, recipients, onSaved, onReleased, onDirtyChange }) {
  const d = usePageText('intake');
  const c = usePageText('common');
  // The label reader's words, for the tracking-number line in Notes.
  const dc = usePageText('intakeCamera');
  const [draft, setDraft] = useState(() => toDraft(sheet));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // Which wizard step is open (an index into STEPS).
  const [step, setStep] = useState(0);
  // Step by step, or the whole form at once (the switch above the form).
  const [mode, setMode] = useState(readMode);

  const locked = sheet.released;
  // The wizard is for filling in. A released sheet is read, not filled in,
  // so it always shows every part at once - as does the "whole form" mode.
  const wizard = mode === 'wizard' && !locked;
  const show = (key) => !wizard || STEPS[step].key === key;
  const last = step === STEPS.length - 1;

  function chooseMode(next) {
    setMode(next);
    storeMode(next);
  }
  // What is still unanswered, judged on what is on screen rather than on what
  // was last saved.
  //
  // The server sends its own `missing` with every sheet, and it is the one
  // that decides - but it describes the stored row. Reading that here meant
  // somebody could fill the last box in and watch the Release button stay
  // grey, because the row it was looking at was still the one from before
  // they typed. Release saves any unsaved boxes first anyway, so what is on
  // screen is what would be handed over, and it is what the button should
  // answer to.
  const missing = missingFor(draft, d);

  const saved = toDraft(sheet);
  const dirty =
    Object.keys(EMPTY).some((field) => String(draft[field]) !== String(saved[field])) ||
    ['measurements', 'shipment_details', 'label_scans'].some(
      (field) => JSON.stringify(draft[field]) !== JSON.stringify(saved[field]),
    );

  // Which package the Measurement box (and the label reader) fills in.
  const [measureIndex, setMeasureIndex] = useState(0);
  // The boxes filled from a label, highlighted until somebody edits them:
  // "supplier", "m0:weight_kg", "d:tracking_number".
  const [fromLabel, setFromLabel] = useState(() => new Set());

  function markFromLabel(keys, on = true) {
    setFromLabel((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  // The warehouse sees the freight the office assigns without reopening
  // the sheet: looked up again every 20 seconds and whenever the window
  // gets focus. Only the freight is taken over - the rest of the sheet is
  // whatever is being typed here.
  const sheetRef = useRef(sheet);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    sheetRef.current = sheet;
    onSavedRef.current = onSaved;
  });
  useEffect(() => {
    if (sheet.can_assign_freight) return undefined;
    let stopped = false;
    async function check() {
      try {
        const fresh = await getIntakeSheet(sheet.id);
        const current = sheetRef.current;
        if (!stopped && fresh && fresh.freight !== current.freight) {
          onSavedRef.current({
            ...current,
            freight: fresh.freight,
            freight_display: fresh.freight_display,
            totals: fresh.totals,
          });
        }
      } catch {
        // Tried again on the next tick.
      }
    }
    const timer = window.setInterval(check, 20_000);
    window.addEventListener('focus', check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [sheet.id, sheet.can_assign_freight]);

  // Once anything is measured, colli and cubic metres are the lines' totals,
  // worked out here as they are typed and again on the server when saved.
  // So the pop-up can ask before closing over unsaved typing.
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const measured = draft.measurements.length > 0;
  const totals = totalsFor(draft.measurements);

  function set(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setNote('');
    // Edited by hand: no longer "from the label".
    markFromLabel([field], false);
  }

  /** Asks before a label replaces something already in a box. */
  function confirmReplace(field, current, next) {
    return window.confirm(d('replaceValue', { field, current, next }));
  }

  // A tapped label line into Leverancier, Bestemming, Afzender, Ontvanger or
  // Opmerkingen. Opmerkingen gets it added (once); any other box is
  // replaced - after asking, when it already says something else.
  function pickFromLabel(field, text) {
    if (field === 'notes') {
      const there = draft.notes.split('\n').some((line) => line.trim() === text.trim());
      if (!there) {
        setDraft((current) => ({
          ...current,
          notes: current.notes.trim() ? `${current.notes}\n${text}` : text,
        }));
      }
    } else {
      const current = String(draft[field] ?? '').trim();
      if (current && current !== text && !confirmReplace(dc(`field.${field}`), current, text)) {
        return false;
      }
      setDraft((now) => ({ ...now, [field]: text }));
    }
    markFromLabel([field]);
    setNote('');
    return true;
  }

  // Numbers from a label into the package picked in the Measurement box
  // ({ weight_kg: '13.4', weight_unit: 'kg' }, or the three sizes).
  // `auto` (filled in by itself after a scan): only into empty boxes.
  // By hand: replaces, after asking when a box already holds another number.
  function measureFromLabel(values, { auto }) {
    const index = draft.measurements.length ? Math.min(measureIndex, draft.measurements.length - 1) : 0;
    const line = draft.measurements[index] ?? EMPTY_LINE;
    const numbers = Object.keys(values).filter((key) => !key.endsWith('_unit'));
    const taken = numbers.filter(
      (key) => String(line[key] ?? '').trim() !== '' && Number(line[key]) !== Number(values[key]),
    );
    if (taken.length) {
      if (auto) return false;
      const current = taken.map((key) => line[key]).join(' × ');
      const next = taken.map((key) => values[key]).join(' × ');
      if (!confirmReplace(d('measureSection'), current, next)) return false;
    }
    setDraft((now) => {
      const lines = now.measurements.length ? [...now.measurements] : [{ ...EMPTY_LINE }];
      lines[index] = { ...lines[index], ...values };
      return { ...now, measurements: lines };
    });
    markFromLabel(numbers.map((key) => `m${index}:${key}`));
    setNote('');
    return true;
  }

  // A courier number or date into Shipment details. Same rules as above.
  function detailFromLabel(key, value, { auto }) {
    const current = String(draft.shipment_details[key] ?? '').trim();
    if (current === value) return true;
    if (current) {
      if (auto) return false;
      if (!confirmReplace(dc(`detail.${key}`), current, value)) return false;
    }
    setDraft((now) => ({ ...now, shipment_details: { ...now.shipment_details, [key]: value } }));
    markFromLabel([`d:${key}`]);
    setNote('');
    return true;
  }

  // "Remove" under the chips: the box it filled is emptied - only when it
  // still holds what the label put there, so nothing typed since is lost.
  function unassignFromLabel(assignment) {
    if (assignment.kind === 'field') {
      const { field, text } = assignment;
      setDraft((now) => {
        if (field === 'notes') {
          const notes = now.notes.split('\n').filter((line) => line.trim() !== text.trim()).join('\n');
          return { ...now, notes };
        }
        return now[field] === text ? { ...now, [field]: '' } : now;
      });
      markFromLabel([field], false);
    } else if (assignment.kind === 'measure') {
      const numbers = Object.keys(assignment.values).filter((key) => !key.endsWith('_unit'));
      setDraft((now) => {
        const at = now.measurements.findIndex((line) =>
          numbers.every((key) => Number(line[key]) === Number(assignment.values[key])),
        );
        if (at === -1) return now;
        const lines = [...now.measurements];
        lines[at] = { ...lines[at], ...Object.fromEntries(numbers.map((key) => [key, ''])) };
        return { ...now, measurements: lines };
      });
    } else if (assignment.kind === 'detail') {
      setDraft((now) => {
        if (now.shipment_details[assignment.key] !== assignment.value) return now;
        const details = { ...now.shipment_details };
        delete details[assignment.key];
        return { ...now, shipment_details: details };
      });
      markFromLabel([`d:${assignment.key}`], false);
    }
    setNote('');
  }

  // Every label read is kept with the sheet exactly as read.
  function keepScan({ lines, source }) {
    const scan = {
      lines: lines.slice(0, 120).map((line) => line.slice(0, 300)),
      source,
      read_at: new Date().toISOString(),
    };
    setDraft((now) => ({ ...now, label_scans: [...now.label_scans, scan].slice(-MAX_SCANS) }));
  }

  function setDetail(key, value) {
    setDraft((now) => {
      const details = { ...now.shipment_details, [key]: value };
      if (!value.trim()) delete details[key];
      return { ...now, shipment_details: details };
    });
    setNote('');
    markFromLabel([`d:${key}`], false);
  }

  // The weight_kg / length_cm ... of the package shown in the Measurement
  // box that came from a label.
  const assignedMeasure = new Set(
    [...fromLabel]
      .filter((key) => key.startsWith(`m${measureIndex}:`))
      .map((key) => key.slice(key.indexOf(':') + 1)),
  );
  const assignedClass = (key) => (fromLabel.has(key) ? ` ${styles.intakeInputAssigned}` : '');

  async function save() {
    setBusy('save');
    setError('');
    setNote('');

    try {
      onSaved(await updateIntakeSheet(sheet.id, toPayload(draft)));
      setNote(d('saved'));
    } catch (failure) {
      setError(
        failure?.status === 409
          ? d('alreadyReleased')
          : d('saveFailed'),
      );
    } finally {
      setBusy('');
    }
  }

  /**
   * Go to another step. Unsaved typing is saved first, so nothing is lost
   * between steps; when that fails the worker stays where they are.
   */
  async function goTo(index) {
    if (index === step) return;
    if (dirty) {
      setBusy('save');
      setError('');
      try {
        onSaved(await updateIntakeSheet(sheet.id, toPayload(draft)));
      } catch (failure) {
        setError(failure?.status === 409 ? d('alreadyReleased') : d('saveFailed'));
        return;
      } finally {
        setBusy('');
      }
    }
    setNote('');
    setStep(index);
  }

  async function release() {
    setBusy('release');
    setError('');
    setNote('');

    try {
      // Saved first, always. Release reads the stored row, so releasing with
      // unsaved boxes on screen would hand over the version on the server -
      // which is the one thing somebody pressing this button is certain they
      // are not doing.
      if (dirty) onSaved(await updateIntakeSheet(sheet.id, toPayload(draft)));

      onReleased(await releaseIntakeSheet(sheet.id));
    } catch (failure) {
      const stillMissing = failure?.fields?.missing;

      if (Array.isArray(stillMissing) && stillMissing.length > 0) {
        setError(d('stillToFill', { fields: stillMissing.join(', ') }));
      } else if (failure?.status === 409) {
        setError(d('releasedByOther'));
      } else {
        setError(d('sendFailed'));
      }
    } finally {
      setBusy('');
    }
  }

  async function reopen() {
    setBusy('reopen');
    setError('');
    setNote('');

    try {
      onSaved(await reopenIntakeSheet(sheet.id));
      setNote(d('reopened'));
    } catch (failure) {
      setError(
        failure?.status === 409
          ? d('reopenedByOther')
          : d('reopenFailed'),
      );
    } finally {
      setBusy('');
    }
  }

  // "Scan label" read by AI (LabelReader, backend warehouse/label_ai.py):
  // the boxes the AI could fill, but only the ones still empty - nothing the
  // worker typed is replaced. The tracking number goes in Notes, because the
  // sheet's own reference is given by the server. Returns which boxes were
  // filled, for the "Filled in by AI: ..." line.
  function fillFromLabel({ fields = {}, tracking_number: trackingNumber }) {
    const filled = [];
    const next = { ...draft };
    for (const field of ['supplier', 'sender', 'recipient', 'destination']) {
      const value = (fields[field] ?? '').trim();
      if (value && !String(draft[field] ?? '').trim()) {
        next[field] = value;
        filled.push(field);
      }
    }
    if (trackingNumber && !draft.notes.includes(trackingNumber)) {
      const line = dc('aiTracking', { number: trackingNumber });
      next.notes = draft.notes.trim() ? `${draft.notes}\n${line}` : line;
      filled.push('notes');
    }
    if (filled.length) {
      setDraft(next);
      setNote('');
    }
    return filled;
  }

  return (
    <div>
      {/* The pop-up around it (Intake, below) carries the title and Close. */}
      <div className={styles.intakeHead}>
        <StatusBadge tone={TONES[sheet.status]}>
          {labelFor(c, 'intakeStatus', sheet.status, sheet.status_display)}
        </StatusBadge>
        {/* Only from the second version on. "Version 1" on every other sheet
            would be noise on the ninety-nine that were right first time. */}
        {sheet.revision > 1 && (
          <StatusBadge tone="attention">{d('version', { number: sheet.revision })}</StatusBadge>
        )}
        {/* Sea or air: chosen by the office, shown to the warehouse. */}
        <FreightControl sheet={sheet} onSaved={onSaved} />
        {/* Step by step or the whole form: the worker's choice. */}
        {!locked && (
          <div className={styles.modeSwitch} role="group" aria-label={d('modeLabel')}>
            {['wizard', 'form'].map((option) => (
              <button
                key={option}
                type="button"
                className={styles.modeOption}
                aria-pressed={mode === option}
                onClick={() => chooseMode(option)}
              >
                {d(`mode.${option}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {locked && (
        <>
          <Banner tone="info">
            {d('releasedBy', {
              when: formatDateTime(sheet.released_at),
              name: sheet.released_by_name || d('somebody'),
            })}
            {sheet.emailed_at
              ? d('emailedAt', { when: formatDateTime(sheet.emailed_at) })
              : d('notEmailed')}{' '}
            {d('lockedNote')}
          </Banner>

          {/* The way back for a sheet with a mistake on it. Deliberately not
              a plain Edit button: reopening is a decision, because the people
              who were already e-mailed are working from the version this is
              about to replace. */}
          <div className={styles.intakeActions}>
            <button
              type="button"
              className={styles.rowButton}
              disabled={busy !== ''}
              onClick={reopen}
            >
              {busy === 'reopen' ? d('reopening') : d('reopen')}
            </button>
            <p className={styles.intakeHint}>{d('reopenHint')}</p>
          </div>
        </>
      )}

      <Banner tone="error">{error}</Banner>
      <Banner tone="success">{note}</Banner>

      {/* The steps, each with a tick once everything it asks is answered.
          Any step can be opened by tapping it. */}
      {wizard && (
        <ol className={styles.wizardSteps} aria-label={d('wizardSteps')}>
          {STEPS.map((item, index) => {
            const complete = item.key !== 'send' && missingInStep(item, draft, d).length === 0;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  className={styles.wizardStep}
                  aria-current={index === step ? 'step' : undefined}
                  disabled={busy !== ''}
                  onClick={() => goTo(index)}
                >
                  <span className={styles.wizardDot} data-complete={complete || undefined}>
                    {complete && index !== step ? '✓' : index + 1}
                  </span>
                  <span>{d(`step.${item.key}`)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <fieldset className={styles.intakeForm} disabled={locked}>
        <legend className={styles.srOnly}>{d('intakeSheet')}</legend>

        {show('shipment') && (
        <div className={styles.intakeSection}>
          <p className={styles.intakeSectionHead}>{d('shipment')}</p>
          <div className={styles.intakeGrid}>
            {/* Shown, not asked for: the number is given automatically and
                fixed for everybody (the server refuses any change). */}
            <Field label={d('reference')}>
              <p className={styles.intakeSignature} title={d('referenceFixed')}>
                {draft.reference || '—'}
              </p>
            </Field>
            {/* Naam werknemer, shown rather than asked for. The sheet is
                signed by the account that started it and that name is fixed
                on the server, so an input here would be a box that quietly
                discards whatever is typed into it. */}
            <Field label={d('employeeName')}>
              <p className={styles.intakeSignature}>
                {sheet.employee_name || sheet.created_by_name || '—'}
              </p>
            </Field>
          </div>
        </div>
        )}

        {/* There used to be an "Ophalen" section here (collection, floor,
            werknemers, place of collection, date the goods were taken in).
            Removed on request: the date is now filled in by the server - the
            day the sheet is started - and the old values stay on sheets
            that already have them. */}
        {show('goods') && (
        <div className={styles.intakeSection}>
          <p className={styles.intakeSectionHead}>{d('packingSection')}</p>
          <div className={styles.intakeToggles}>
            <ToggleField
              label={d('packingRequired')}
              checked={draft.packing_required}
              onChange={(value) => set('packing_required', value)}
            />
            <ToggleField
              label={d('palletBox')}
              checked={draft.pallet_box}
              onChange={(value) => set('pallet_box', value)}
            />
          </div>

          <div className={styles.intakeGrid}>
            <Field label={measured ? d('volumeMeasured') : d('volume')}>
              <input
                type="number"
                step="0.001"
                min="0"
                className={styles.intakeInput}
                value={
                  measured
                    ? totals.volume === null
                      ? ''
                      : totals.volume.toFixed(3)
                    : draft.volume_m3
                }
                readOnly={measured}
                onChange={(event) => set('volume_m3', event.target.value)}
              />
            </Field>
          </div>
        </div>
        )}

        {show('checks') && (
        <div className={styles.intakeSection}>
          <p className={styles.intakeSectionHead}>{d('checkSection')}</p>
          <div className={styles.intakeGrid}>
            <CheckField
              label={d('field.packed_well')}
              name={`packed_well-${sheet.id}`}
              value={draft.packed_well}
              onChange={(value) => set('packed_well', value)}
              disabled={locked}
            />
            <CheckField
              label={d('field.damage_present')}
              name={`damage_present-${sheet.id}`}
              value={draft.damage_present}
              onChange={(value) => set('damage_present', value)}
              disabled={locked}
            />
            <CheckField
              label={d('field.address_label_present')}
              name={`address_label_present-${sheet.id}`}
              value={draft.address_label_present}
              onChange={(value) => set('address_label_present', value)}
              disabled={locked}
            />
            {/* Damage reported: photograph it. Uploaded straight away, so it
                does not wait for Save draft. */}
            <IntakePhotos
              sheetId={sheet.id}
              show={draft.damage_present === 'yes'}
              locked={locked}
            />
            <Field label={d('remarks')} wide>
              <textarea
                className={styles.intakeTextarea}
                rows={2}
                value={draft.check_notes}
                onChange={(event) => set('check_notes', event.target.value)}
              />
            </Field>
          </div>
        </div>
        )}

        {show('shipment') && (
        <div className={styles.intakeSection}>
          <p className={styles.intakeSectionHead}>{d('consignment')}</p>
          {/* Photograph the label and tap its lines into the boxes below. A
              line for Opmerkingen is added to what is there; any other box
              is replaced. */}
          <LabelReader
            disabled={locked}
            onAiFill={fillFromLabel}
            onPick={pickFromLabel}
            onMeasure={measureFromLabel}
            onDetail={detailFromLabel}
            onUnassign={unassignFromLabel}
            onScanned={keepScan}
          />
          <div className={styles.intakeGrid}>
            <Field label={d('supplier')}>
              <input
                className={styles.intakeInput + assignedClass('supplier')}
                value={draft.supplier}
                onChange={(event) => set('supplier', event.target.value)}
              />
            </Field>
            <Field label={d('field.destination')}>
              <input
                className={styles.intakeInput + assignedClass('destination')}
                value={draft.destination}
                onChange={(event) => set('destination', event.target.value)}
              />
            </Field>
            <Field label={d('sender')}>
              <input
                className={styles.intakeInput + assignedClass('sender')}
                value={draft.sender}
                onChange={(event) => set('sender', event.target.value)}
              />
            </Field>
            <Field label={d('recipient')}>
              <input
                className={styles.intakeInput + assignedClass('recipient')}
                value={draft.recipient}
                onChange={(event) => set('recipient', event.target.value)}
              />
            </Field>
            <Field label={d('remarks')} wide>
              <textarea
                className={styles.intakeTextarea}
                rows={2}
                value={draft.notes}
                onChange={(event) => set('notes', event.target.value)}
              />
            </Field>
          </div>

          {/* The weights and sizes a label (or a tape measure) gives. The
              same lines as the Measurements step, one package at a time. */}
          <p className={styles.intakeSubHead}>{d('measureSection')}</p>
          <LabelMeasurement
            lines={draft.measurements}
            index={Math.min(measureIndex, Math.max(draft.measurements.length - 1, 0))}
            onIndexChange={setMeasureIndex}
            onChange={(lines) => {
              setDraft((current) => ({ ...current, measurements: lines }));
              setNote('');
              setFromLabel(
                (current) => new Set([...current].filter((key) => !key.startsWith(`m${measureIndex}:`))),
              );
            }}
            freight={sheet.freight}
            assigned={assignedMeasure}
            disabled={locked}
          />

          {/* The courier's numbers and dates. */}
          <p className={styles.intakeSubHead}>{d('detailsSection')}</p>
          <div className={styles.intakeGrid}>
            {SHIPMENT_DETAILS.map((key) => (
              <Field key={key} label={dc(`detail.${key}`)}>
                <input
                  className={styles.intakeInput + assignedClass(`d:${key}`)}
                  value={draft.shipment_details[key] ?? ''}
                  onChange={(event) => setDetail(key, event.target.value)}
                />
              </Field>
            ))}
          </div>

          {/* Every label read for this sheet, exactly as read - nothing on
              a label is lost, tapped in or not. */}
          {draft.label_scans.length > 0 && (
            <details className={styles.labelScans}>
              <summary>{d('labelScans', { count: draft.label_scans.length })}</summary>
              {draft.label_scans.map((scan, index) => (
                <div key={`${scan.read_at}-${index}`} className={styles.labelScan}>
                  <p className={styles.intakeHint}>
                    {scan.read_at ? formatDateTime(scan.read_at) : ''} · {scan.source === 'ai' ? 'AI' : '📱'}
                  </p>
                  <pre className={styles.labelScanText}>{scan.lines.join('\n')}</pre>
                </div>
              ))}
            </details>
          )}
        </div>
        )}

        {show('goods') && (
        <div className={styles.intakeSection}>
          <p className={styles.intakeSectionHead}>{d('goods')}</p>
          <div className={styles.intakeGrid}>
            <Field label={measured ? d('colliMeasured') : d('field.colli_count')}>
              <input
                type="number"
                min="0"
                className={styles.intakeInput}
                value={measured ? totals.colli : draft.colli_count}
                readOnly={measured}
                onChange={(event) => set('colli_count', event.target.value)}
              />
            </Field>
            <Field label={d('field.packaging')}>
              <select
                className={styles.intakeInput}
                value={draft.packaging}
                onChange={(event) => set('packaging', event.target.value)}
              >
                <option value="">—</option>
                {INTAKE_PACKAGING.map((option) => (
                  <option key={option.value} value={option.value}>
                    {labelFor(d, 'packaging', option.value, option.label)}
                  </option>
                ))}
              </select>
            </Field>
            {/* The blank line the paper form leaves after "kist /". Shown
                only when it has been chosen, because an input nobody should
                fill in is an input somebody will. */}
            {draft.packaging === 'other' && (
              <Field label={d('field.packaging_other')}>
                <input
                  className={styles.intakeInput}
                  value={draft.packaging_other}
                  onChange={(event) => set('packaging_other', event.target.value)}
                />
              </Field>
            )}
            {/* Transportwijze is not chosen here: the office assigns it
                (FreightControl, at the top of the sheet). */}
            {/* The old free-text box, kept for what does not fit a line -
                and for the sheets written before there were lines. */}
            <Field label={d('extraNotes')} wide>
              <textarea
                className={styles.intakeTextarea}
                rows={2}
                value={draft.dimensions_weight}
                onChange={(event) => set('dimensions_weight', event.target.value)}
                placeholder={d('extraPlaceholder')}
              />
            </Field>
          </div>
        </div>
        )}

        {show('measure') && (
        <div className={styles.intakeSection}>
          <p className={styles.intakeSectionHead}>{d('field.measurements')}</p>
          <Measurements
            lines={draft.measurements}
            onChange={(lines) => {
              setDraft((current) => ({ ...current, measurements: lines }));
              setNote('');
            }}
            freight={sheet.freight}
            declaredWeight={sheet.declared_weight_kg}
            disabled={locked}
          />
        </div>
        )}

        {/* The last step: every step at a glance, with what it still needs.
            Tapping one goes back to it. */}
        {wizard && show('send') && (
          <div className={styles.intakeSection}>
            <p className={styles.intakeSectionHead}>{d('step.send')}</p>
            <ul className={styles.wizardSummary}>
              {STEPS.filter((item) => item.key !== 'send').map((item) => {
                const open = missingInStep(item, draft, d);
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => goTo(STEPS.indexOf(item))}
                    >
                      {open.length === 0 ? '✓' : '•'} {d(`step.${item.key}`)}
                    </button>
                    {open.length > 0 && (
                      <span className={styles.intakeHint}> {d('stillToFill', { fields: open.join(', ') })}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </fieldset>

      {!locked && (
        <div className={styles.intakeActions}>
          {wizard && step > 0 && (
            <button
              type="button"
              className={styles.rowButton}
              disabled={busy !== ''}
              onClick={() => goTo(step - 1)}
            >
              {d('back')}
            </button>
          )}

          <button
            type="button"
            className={styles.rowButton}
            disabled={!dirty || busy !== ''}
            onClick={save}
          >
            {busy === 'save' ? d('saving') : d('saveDraft')}
          </button>

          {/* Next saves and goes on; only the last step sends the sheet.
              The whole form has Release straight away, as it always had. */}
          {wizard && !last ? (
            <button
              type="button"
              className={styles.intakeRelease}
              disabled={busy !== ''}
              onClick={() => goTo(step + 1)}
            >
              {d('next')}
            </button>
          ) : (
            <button
              type="button"
              className={styles.intakeRelease}
              disabled={busy !== '' || missing.length > 0}
              onClick={release}
            >
              {busy === 'release' ? d('sending') : d('release')}
            </button>
          )}

          {(!wizard || last) && (
          <p className={styles.intakeHint}>
            {missing.length > 0
              ? d('stillToFill', { fields: missing.join(', ') })
              : recipients?.count === 0
                ? d('nobody')
                : sheet.revision > 1
                  ? d('correctionTo', {
                      number: sheet.revision,
                      who: recipients === null ? d('restOfStaff') : colleagues(recipients.count, d),
                    })
                  : recipients === null
                    ? d('readyToSend')
                    : d('goesTo', {
                        who: colleagues(recipients.count, d),
                        addresses: recipients.addresses.join(', '),
                      })}
          </p>
          )}
        </div>
      )}
    </div>
  );
}

/** "1 colleague" / "3 colleagues", in the dashboard language. */
function colleagues(count, d) {
  return count === 1 ? d('oneColleague') : d('colleagues', { count });
}

export default function Intake() {
  const [params, setParams] = useSearchParams();
  const d = usePageText('intake');
  const c = usePageText('common');

  const list = useCollection(
    listIntakeSheets,
    {
      status: params.get('status') ?? '',
      freight: params.get('freight') ?? '',
    },
    params.get('search') ?? '',
  );

  // Which sheet is open, in the URL. That is what makes the link at the
  // bottom of the handover e-mail work: /warehouse/intake?sheet=41 opens the
  // sheet somebody was just told about.
  const openId = Number(params.get('sheet')) || null;

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [recipients, setRecipients] = useState(null);

  // Whether this person is themselves on the list when somebody else releases
  // a sheet. Their own preference, so it is read from the session rather than
  // from the recipients call - which deliberately leaves them out of its
  // count, since a release never mails the person who pressed the button.
  const { user, refreshUser } = useAuth();
  const [optOutBusy, setOptOutBusy] = useState(false);
  const mailsMe = user?.notifications?.warehouse ?? true;

  async function setMailsMe(enabled) {
    setOptOutBusy(true);

    try {
      await setWarehouseEmails(enabled);
      // Republished to everything holding the session, so the checkbox and
      // the header cannot disagree about what was just saved.
      await refreshUser();
    } catch {
      setError(d('preferenceFailed'));
    } finally {
      setOptOutBusy(false);
    }
  }

  // Asked for once. The answer changes when somebody joins or leaves, which
  // is not something worth a request per sheet.
  useEffect(() => {
    let cancelled = false;

    getIntakeRecipients()
      .then((answer) => {
        if (!cancelled) setRecipients(answer);
      })
      // Left null, which the form reads as "not known" and says nothing
      // about. A failure to count colleagues must not look like having none.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const open = useCallback(
    (id) => {
      const next = new URLSearchParams(params);

      if (id === null) next.delete('sheet');
      else next.set('sheet', String(id));

      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  async function startSheet() {
    setCreating(true);
    setError('');

    try {
      const sheet = await createIntakeSheet();
      list.reload();
      open(sheet.id);
    } catch {
      setError(d('startFailed'));
    } finally {
      setCreating(false);
    }
  }

  const sheet = list.rows.find((row) => row.id === openId) ?? null;

  // Whether the open sheet has typing nobody saved yet (SheetForm says).
  const dirtyRef = useRef(false);
  const setSheetDirty = useCallback((dirty) => {
    dirtyRef.current = dirty;
  }, []);
  function closeSheet() {
    if (dirtyRef.current && !window.confirm(d('discardChanges'))) return;
    dirtyRef.current = false;
    open(null);
  }

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>{d('title')}</h1>
        <p className={styles.subtitle}>{d('subtitle')}</p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label={d('searchLabel')}
          placeholder={d('searchPlaceholder')}
        />
        <FilterSelect
          label={c('status')}
          value={list.filters.status}
          onChange={(value) => list.setFilter('status', value)}
          options={translatedOptions(INTAKE_STATUSES, c, 'intakeStatus')}
          allLabel={c('anyStatus')}
        />
        <FilterSelect
          label={d('field.freight')}
          value={list.filters.freight}
          onChange={(value) => list.setFilter('freight', value)}
          options={translatedOptions(INTAKE_FREIGHT, c, 'freight')}
          allLabel={d('seaAndAir')}
        />
        <button
          type="button"
          className={styles.newButton}
          onClick={startSheet}
          disabled={creating}
        >
          {creating ? d('starting') : d('newSheet')}
        </button>
      </Toolbar>

      <Banner tone="error">{error}</Banner>

      {/* Sits above the list rather than inside a sheet: it is a standing
          preference about every future handover, not a choice about this one.
          The dashboard has no settings page of its own, and this is the only
          screen on which the setting means anything. */}
      <label className={styles.intakeOptOut}>
        <input
          type="checkbox"
          checked={mailsMe}
          disabled={optOutBusy}
          onChange={(event) => setMailsMe(event.target.checked)}
        />
        <span>{d('mailMe')}</span>
      </label>

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>{d('noMatch')}</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{d('colSheet')}</th>
                  <th scope="col">{d('colReceived')}</th>
                  <th scope="col">{d('colFrom')}</th>
                  <th scope="col">{d('colTo')}</th>
                  <th scope="col">{d('goods')}</th>
                  <th scope="col">{c('status')}</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr
                    key={row.id}
                    className={row.status === 'draft' ? styles.rowUnhandled : undefined}
                  >
                    <td>
                      <div className={styles.primaryCell}>{row.label}</div>
                      <div className={styles.mutedCell}>
                        {row.created_by_name || d('unknown')}
                      </div>
                      <button
                        type="button"
                        className={styles.linkButton}
                        aria-haspopup="dialog"
                        onClick={() => open(row.id)}
                      >
                        {d('openSheet')}
                      </button>
                    </td>

                    <td className={styles.dateCell}>{formatDate(row.received_on)}</td>

                    <td>
                      <div>{row.supplier || row.sender || '—'}</div>
                      {row.pickup && (
                        <div className={styles.mutedCell}>
                          {d('pickedUp')}
                          {row.pickup_location ? ` · ${row.pickup_location}` : ''}
                        </div>
                      )}
                    </td>

                    <td>
                      <div>{row.destination || '—'}</div>
                      <div className={styles.mutedCell}>{row.recipient}</div>
                    </td>

                    <td className={styles.numberCell}>
                      <div>
                        {row.colli_count ?? '—'} {labelFor(d, 'packaging', row.packaging, row.packaging_display)}
                      </div>
                      <div className={row.freight ? styles.mutedCell : styles.freightWaiting}>
                        {row.freight
                          ? labelFor(c, 'freight', row.freight, row.freight_display)
                          : d('freightWaiting')}
                      </div>
                      {/* The one thing on a sheet that changes what the
                          office does before they have opened it. */}
                      {row.damage_present === 'yes' && (
                        <div className={styles.intakeDamage}>{d('damage')}</div>
                      )}
                    </td>

                    <td>
                      <StatusBadge tone={TONES[row.status]}>
                        {labelFor(c, 'intakeStatus', row.status, row.status_display)}
                      </StatusBadge>
                      {row.status === 'draft' && row.missing?.length > 0 && (
                        <div className={styles.mutedCell}>
                          {d('stillToFillCount', { count: row.missing.length })}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* Below the table rather than inside it: this is the whole paper sheet,
          and a form that size crammed into a table cell is unusable. Keyed on
          the sheet id so switching sheets builds a fresh form. */}
      {/* The opened sheet, in a pop-up over the list - also when opened from
          a link (?sheet=). Closed by x, Close, Escape or a click beside it;
          with unsaved typing it asks first. */}
      {sheet && (
        <HelpDialog
          key={sheet.id}
          open
          extraWide
          onClose={closeSheet}
          title={d('sheetTitle', { label: sheet.label })}
          closeLabel={c('close')}
          doneLabel={c('close')}
        >
          <SheetForm
            sheet={sheet}
            recipients={recipients}
            onSaved={list.replaceRow}
            onReleased={list.replaceRow}
            onDirtyChange={setSheetDirty}
          />
        </HelpDialog>
      )}

      <Pagination
        page={list.page}
        count={list.count}
        hasNext={list.hasNext}
        hasPrevious={list.hasPrevious}
        onChange={list.setPage}
      />
    </>
  );
}
