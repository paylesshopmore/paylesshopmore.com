// src/pages/Dashboard/LabelReader.jsx
//
// "Label scannen" on the intake sheet: photograph the shipping label, and the
// text on it is read (src/ocr/readLabel.js) and shown as a list of chips. Tap
// the chip(s) you need - a name, or a name and its address - then tap where
// they go: Leverancier, Bestemming, Afzender, Ontvanger, Meting, Zending-
// gegevens or Opmerkingen.
//
// TWO WAYS OF READING, tried in this order:
//
//   1. With AI (backend warehouse/label_ai.py), when `onAiFill` is given and
//      the AI is set up: the photo goes to our server, which says which part
//      of the label is the supplier, sender, recipient and destination, and
//      looks up whose parcel it is (our shipment, a pre-alert, or the
//      customer number). The page fills in the EMPTY boxes - nothing typed is
//      overwritten - and the worker checks them before releasing the sheet.
//      The photo is read, not stored.
//   2. On the device (src/ocr/readLabel.js), when the AI is off, offline or
//      fails: the text is read in the browser and nothing leaves the device.
//      No names are filled in by guessing then - the person holding the box
//      knows which name is the sender.
//
// Either way the label's lines are shown afterwards, as chips, so a line can
// still be tapped into a box by hand: tap the line(s), then the box.
//
// THE CHIPS (src/ocr/labelFields.js): a line holding several captions is
// split into one chip per caption, and each chip is tagged with what it
// probably is - a weight, the sizes, the tracking number. Chips with a
// printed caption and a usable value ("ACTWGT: 13.40 KG", "DIMS: 60x40x20
// CM", "TRK# 8796 3229 7750") are filled in by themselves, into EMPTY boxes
// only. Everything else waits in "not assigned yet" for a tap - nothing on
// the label is thrown away, and every reading is kept with the sheet exactly
// as it was read (onScanned).
//
// "Measurement" turns a chip into numbers (60x40x20 CM -> length 60, width
// 40, height 20; 13400 G -> 13.4 kg); "Shipment details" takes the value
// after its caption. When the chip does not say which box it is for, a
// second row of buttons asks.
//
// Every assignment is listed under the chips with a Remove button, which
// empties the box again. A chip already used asks before it is used again.
//
// "Label scannen" opens the camera on the page (webcam on a computer, back
// camera on a phone); "Foto van label kiezen" reads a photo already on the
// device.

import { useEffect, useRef, useState } from 'react';
import { readLabelWithAi } from '../../api/staff';
import { captureJpeg } from '../../measurement/cameraService';
import { readLabel } from '../../ocr/readLabel';
import {
  MEASURE_TARGETS,
  SHIPMENT_DETAILS,
  classifyChip,
  detailValue,
  isConfident,
  measureValues,
  splitChips,
} from '../../ocr/labelFields';
import { useCamera } from '../Warehouse/camera/useCamera';
import { cameraProblem } from './cameraProblems';
import { Banner } from './ui';
import styles from './Dashboard.module.css';
import { usePageText } from './usePageText';

// Where a line can go, in the order of the buttons. 'measure' and 'details'
// are groups: they open a second row when the chip does not say which box.
const TARGETS = ['supplier', 'destination', 'sender', 'recipient', 'measure', 'details', 'notes'];

// The chip kinds that are a Measurement box of their own.
const MEASURE_KINDS = ['actualWeight', 'volumetricWeight', 'chargeableWeight', 'dimensions'];

/** The small tag on a recognised chip ("Actual weight", "Tracking number"), or ''. */
function tagFor(kind, d) {
  if (!kind) return '';
  if (kind === 'weight') return d('tag.weight');
  if (MEASURE_KINDS.includes(kind)) return d(`measure.${kind}`);
  return d(`detail.${kind}`);
}

/** The name of where an assignment went, for the list under the chips. */
function targetName(assignment, d) {
  if (assignment.kind === 'measure') return d(`measure.${assignment.target}`);
  if (assignment.kind === 'detail') return d(`detail.${assignment.key}`);
  return d(`field.${assignment.field}`);
}

/** The match the server found, as one line for the floor. */
function matchLine(match, d) {
  if (!match) return '';
  const customer = match.customer || '—';
  if (match.kind === 'shipment') return d('matchShipment', { number: match.tracking_number, customer });
  if (match.kind === 'customer') return d('matchCustomer', { code: match.customer_code, customer });
  // A courier number a customer pre-alerted: the shop and what was bought help
  // put the box with the right order.
  return [d('matchCourier', { customer }), match.shop_name, match.order_description].filter(Boolean).join(' · ');
}

/**
 * @param {{ onPick: (field: string, text: string) => boolean|void,
 *           onMeasure?: (values: object, options: { auto: boolean }) => boolean,
 *           onDetail?: (key: string, value: string, options: { auto: boolean }) => boolean,
 *           onUnassign?: (assignment: object) => void,
 *           onScanned?: (scan: { lines: string[], source: 'ai'|'device' }) => void,
 *           onAiFill?: (result: object) => string[],
 *           disabled?: boolean }} props
 *   onPick      called with the form field and the chosen text; returns
 *               false when nothing was filled in (the worker said no to
 *               replacing what was there)
 *   onMeasure   called with the measured line's columns to set
 *               ({ weight_kg: '13.4', weight_unit: 'kg' }); `auto` means
 *               "only into empty boxes, without asking". Returns whether it
 *               filled anything in. Without it there is no Measurement button.
 *   onDetail    the same for a Shipment details box. Without it there is no
 *               Shipment details button.
 *   onUnassign  called with an assignment the worker removed: empty that box
 *   onScanned   called with every label read, exactly as read, to keep
 *   onAiFill    called with the AI's reading ({ fields, tracking_number });
 *               returns the names of the fields it filled in. Without it the
 *               label is only ever read on the device.
 *   disabled    the sheet is released: nothing can be filled in
 */
export default function LabelReader({
  onPick,
  onMeasure,
  onDetail,
  onUnassign,
  onScanned,
  onAiFill,
  disabled = false,
}) {
  const d = usePageText('intakeCamera');
  const fileInput = useRef(null);
  // The label's chips, once read. null = nothing read yet.
  const [lines, setLines] = useState(null);
  // Indexes of the chips tapped, in the order they were tapped.
  const [selected, setSelected] = useState([]);
  // What was put where: [{ id, indexes, text, kind: 'field'|'measure'|'detail', ... }].
  // The chips in it are shown ticked and dimmed, still tappable.
  const [assignments, setAssignments] = useState([]);
  // 'measure' or 'details' while the second row of buttons is open.
  const [group, setGroup] = useState(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // Whose parcel it is, when the AI's reading found it in our records.
  const [match, setMatch] = useState(null);
  const [readingWithAi, setReadingWithAi] = useState(false);

  const {
    videoRef,
    status: cameraStatus,
    error: cameraError,
    start: startCamera,
    stop: stopCamera,
  } = useCamera();
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraShown = cameraOpen && !disabled;

  // Camera on while the panel shows, off when it goes (see IntakePhotos.jsx).
  useEffect(() => {
    if (cameraShown) startCamera();
    else stopCamera();
  }, [cameraShown, startCamera, stopCamera]);

  if (disabled) return null;

  /**
   * The chips sure enough to go in by themselves - a caption and a value -
   * each into its box when that box is still empty. One chip per box: a
   * second ACTWGT on the same label waits for a tap.
   */
  function autoAssign(chips) {
    const made = [];
    const taken = new Set();
    chips.forEach((chip, index) => {
      const classified = classifyChip(chip);
      if (!isConfident(classified) || taken.has(classified.kind)) return;
      let assignment = null;
      if (MEASURE_KINDS.includes(classified.kind)) {
        const values = measureValues(classified.kind, chip);
        if (onMeasure && values && onMeasure(values, { auto: true })) {
          assignment = { kind: 'measure', target: classified.kind, values };
        }
      } else if (onDetail && onDetail(classified.kind, classified.value, { auto: true })) {
        assignment = { kind: 'detail', key: classified.kind, value: classified.value };
      }
      if (assignment) {
        taken.add(classified.kind);
        made.push({ ...assignment, id: `auto-${index}`, indexes: [index], text: chip });
      }
    });
    return made;
  }

  /**
   * A label has been read: keep it as read, show it as chips, and fill in
   * what has a printed caption. Returns the assignments made by themselves.
   */
  function show(read, source) {
    const original = read.map((line) => String(line));
    if (original.length) onScanned?.({ lines: original, source });
    const chips = splitChips(original);
    setLines(chips.length ? chips : null);
    setSelected([]);
    setGroup(null);
    const auto = autoAssign(chips);
    setAssignments(auto);
    return auto;
  }

  /** Read with AI. True when it worked; false means: read on the device instead. */
  async function readWithAi(image) {
    setReadingWithAi(true);
    try {
      const result = await readLabelWithAi(image);
      const filled = onAiFill(result);
      const auto = show(result.lines ?? [], 'ai');
      setMatch(result.match ?? null);
      setCameraOpen(false);
      const names = [
        ...filled.map((field) => d(`field.${field}`)),
        ...auto.map((assignment) => targetName(assignment, d)),
      ];
      setNote(names.length ? d('aiFilled', { fields: names.join(', ') }) : d('aiNothing'));
      return true;
    } catch {
      return false;
    } finally {
      setReadingWithAi(false);
    }
  }

  async function read(image) {
    setReading(true);
    setError('');
    setNote('');
    setMatch(null);
    try {
      if (onAiFill && (await readWithAi(image))) return;
      const found = await readLabel(image);
      if (found.length === 0) {
        setError(d('noText'));
        return;
      }
      const auto = show(found, 'device');
      setCameraOpen(false);
      // Said only when the AI was tried and could not help.
      if (onAiFill) setNote(d('onDevice'));
      else if (auto.length) {
        setNote(d('autoFilled', { fields: auto.map((assignment) => targetName(assignment, d)).join(', ') }));
      }
    } catch {
      setError(d('readFailed'));
    } finally {
      setReading(false);
    }
  }

  // "Lees label": the picture on screen right now.
  async function readFromCamera() {
    const picture = await captureJpeg(videoRef.current);
    if (!picture) {
      setError(d('starting'));
      return;
    }
    await read(picture);
  }

  // Tap a chip: select it, or tap again to unselect.
  function toggle(index) {
    setSelected((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
    setNote('');
    setGroup(null);
  }

  const used = new Set(assignments.flatMap((assignment) => assignment.indexes));

  /**
   * A chip already put somewhere asks before it goes somewhere else too -
   * the commonest slip is tapping the same name into Sender and Recipient.
   */
  function confirmReuse() {
    const again = assignments.filter((assignment) =>
      assignment.indexes.some((index) => selected.includes(index)),
    );
    if (again.length === 0) return true;
    const where = [...new Set(again.map((assignment) => targetName(assignment, d)))].join(', ');
    return window.confirm(d('alreadyUsed', { fields: where }));
  }

  /** Records an assignment of the selected chips and clears the selection. */
  function record(assignment, text) {
    setAssignments((current) => [
      ...current,
      { ...assignment, id: `${Date.now()}-${current.length}`, indexes: [...selected], text },
    ]);
    setSelected([]);
    setGroup(null);
    setNote(d('filledIn', { field: targetName(assignment, d) }));
  }

  // Tap a field: the selected chips go into it, joined with commas
  // ("J. Jansen, Kaya Grandi 12, Willemstad").
  function put(field) {
    const text = selected.map((index) => lines[index]).join(', ');
    if (!confirmReuse()) return;
    if (onPick(field, text) === false) return;
    record({ kind: 'field', field }, text);
  }

  // The selected chips as one piece of text for a number or a code:
  // "TRK#" + "8796 3229 7750" -> "TRK# 8796 3229 7750".
  const joined = () => selected.map((index) => lines[index]).join(' ');

  // "Measurement": straight into its box when the chip says which
  // (ACTWGT, DIMS ...), otherwise the row of Measurement boxes opens.
  function putMeasure() {
    const kind = classifyChip(joined()).kind;
    if (MEASURE_KINDS.includes(kind) && measureValues(kind, joined())) putMeasureIn(kind);
    else setGroup('measure');
  }

  function putMeasureIn(target) {
    const text = joined();
    const values = measureValues(target, text);
    if (!values) {
      setNote(d('noNumber', { text, field: d(`measure.${target}`) }));
      return;
    }
    if (!confirmReuse()) return;
    if (onMeasure(values, { auto: false }) === false) return;
    record({ kind: 'measure', target, values }, text);
  }

  // "Shipment details": the same, with the caption telling which box.
  function putDetails() {
    const classified = classifyChip(joined());
    if (SHIPMENT_DETAILS.includes(classified.kind) && classified.value) putDetailIn(classified.kind);
    else setGroup('details');
  }

  function putDetailIn(key) {
    const text = joined();
    const value = detailValue(text);
    if (!value) {
      setNote(d('noValue', { field: d(`detail.${key}`) }));
      return;
    }
    if (!confirmReuse()) return;
    if (onDetail(key, value, { auto: false }) === false) return;
    record({ kind: 'detail', key, value }, text);
  }

  function choose(target) {
    if (target === 'measure') putMeasure();
    else if (target === 'details') putDetails();
    else put(target);
  }

  // Remove: the box it filled is emptied again (by the form), and the chip
  // goes back to "not assigned yet".
  function unassign(assignment) {
    onUnassign?.(assignment);
    setAssignments((current) => current.filter((item) => item.id !== assignment.id));
    setNote(d('removed', { field: targetName(assignment, d) }));
  }

  const targets = TARGETS.filter(
    (target) => (target !== 'measure' || onMeasure) && (target !== 'details' || onDetail),
  );
  const busy = reading;

  return (
    <div className={styles.labelReader}>
      <Banner tone="error">{error}</Banner>

      {/* The live camera, while it is open. */}
      {cameraShown && (
        <div className={styles.intakeCamera}>
          {cameraError ? (
            <p className={styles.intakeHint}>{cameraProblem(cameraError, d)}</p>
          ) : (
            <>
              <video ref={videoRef} className={styles.intakeCameraVideo} muted playsInline />
              <p className={styles.intakeHint}>{d('holdLabel')}</p>
            </>
          )}
          <div className={styles.intakeCameraButtons}>
            {!cameraError && (
              <button
                type="button"
                className={styles.intakeRelease}
                disabled={busy || cameraStatus !== 'live'}
                onClick={readFromCamera}
              >
                {cameraStatus !== 'live'
                  ? d('cameraStarting')
                  : readingWithAi
                    ? d('aiReading')
                    : busy
                      ? d('readingLabel')
                      : d('readLabel')}
              </button>
            )}
            <button type="button" className={styles.rowButton} onClick={() => setCameraOpen(false)}>
              {d('close')}
            </button>
          </div>
        </div>
      )}

      {/* Hidden: "Foto van label kiezen" opens it. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className={styles.srOnly}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const [file] = event.target.files;
          if (file) read(file);
          // Cleared, so choosing the same photo again still counts as a change.
          event.target.value = '';
        }}
      />

      {!cameraShown && (
        <div className={styles.intakeCameraButtons}>
          <button
            type="button"
            className={styles.rowButton}
            disabled={busy}
            onClick={() => setCameraOpen(true)}
          >
            {lines ? d('scanAnother') : d('scanLabel')}
          </button>
          <button
            type="button"
            className={styles.rowButton}
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {d('pickLabelPhoto')}
          </button>
        </div>
      )}

      {/* Reading takes a few seconds; the very first time longer, while the
          reader itself downloads. */}
      {reading && !cameraShown && (
        <p className={styles.intakeHint}>{readingWithAi ? d('aiReading') : d('reading')}</p>
      )}

      {/* Whose parcel it is - from our own records, not from the AI. */}
      {match && <Banner tone="info">{matchLine(match, d)}</Banner>}
      {note && !lines && <p className={styles.intakeHint}>{note}</p>}

      {lines && (
        <>
          <p className={styles.intakeHint}>{d('tapLines')}</p>
          {/* How much of the label still waits for a tap. */}
          <p className={styles.labelCount}>
            {lines.length - used.size === 0
              ? d('allAssigned')
              : d('unassigned', { count: lines.length - used.size, total: lines.length })}
          </p>
          <div className={styles.labelLines}>
            {lines.map((line, index) => {
              const order = selected.indexOf(index);
              const tag = tagFor(classifyChip(line).kind, d);
              return (
                <button
                  // Chips can repeat on a label, so the index is part of the key.
                  key={`${index}-${line}`}
                  type="button"
                  aria-pressed={order !== -1}
                  className={[
                    styles.labelLine,
                    order !== -1 ? styles.labelLineOn : '',
                    used.has(index) ? styles.labelLineUsed : '',
                  ].join(' ')}
                  onClick={() => toggle(index)}
                >
                  {used.has(index) && order === -1 && (
                    <span className={styles.labelLineTick} aria-hidden="true">✓</span>
                  )}
                  {/* With more than one chip selected, the number says in
                      which order they will be joined. */}
                  {order !== -1 && selected.length > 1 && (
                    <span className={styles.labelLineOrder}>{order + 1}</span>
                  )}
                  {line}
                  {/* What it was recognised as. Hidden from a screen reader
                      so the chip's name stays its own text. */}
                  {tag && (
                    <span className={styles.labelLineTag} aria-hidden="true">
                      {tag}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {selected.length > 0 && (
            <div className={styles.labelTargets}>
              <span className={styles.intakeLabel}>{d('putIn')}</span>
              {targets.map((target) => (
                <button
                  key={target}
                  type="button"
                  className={styles.intakeRelease}
                  aria-expanded={target === 'measure' || target === 'details' ? group === target : undefined}
                  onClick={() => choose(target)}
                >
                  {d(`field.${target}`)}
                </button>
              ))}
            </div>
          )}

          {/* Which Measurement or Shipment details box, when the chip did
              not say. */}
          {selected.length > 0 && group && (
            <div className={styles.labelSubTargets} role="group" aria-label={d(`field.${group}`)}>
              {(group === 'measure' ? MEASURE_TARGETS : SHIPMENT_DETAILS).map((target) => (
                <button
                  key={target}
                  type="button"
                  className={styles.labelSubTarget}
                  onClick={() => (group === 'measure' ? putMeasureIn(target) : putDetailIn(target))}
                >
                  {group === 'measure' ? d(`measure.${target}`) : d(`detail.${target}`)}
                </button>
              ))}
            </div>
          )}

          {note && <p className={styles.intakeHint}>{note}</p>}

          {/* What went where, each with a way back. */}
          {assignments.length > 0 && (
            <div className={styles.labelAssigned}>
              <p className={styles.intakeLabel}>{d('assigned')}</p>
              <ul className={styles.labelAssignedList}>
                {assignments.map((assignment) => (
                  <li key={assignment.id} className={styles.labelAssignedRow}>
                    <span className={styles.labelAssignedText}>{assignment.text}</span>
                    <span aria-hidden="true">→</span>
                    <strong>{targetName(assignment, d)}</strong>
                    <button
                      type="button"
                      className={styles.labelAssignedRemove}
                      aria-label={d('removeAssignment', {
                        text: assignment.text,
                        field: targetName(assignment, d),
                      })}
                      onClick={() => unassign(assignment)}
                    >
                      {d('remove')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
