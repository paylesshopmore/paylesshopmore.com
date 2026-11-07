// src/pages/Warehouse/ManagerReview.jsx
//
// "Package review": the warehouse manager's quality control. Every intake
// sheet the floor releases lands here (the office already has it - nothing
// waits for this). For each one the manager sees what the checks found and
// either:
//   - Approves it, or
//   - Sends it back, with a note saying what to fix. The sheet reopens for
//     the floor as a new version; the worker reads the note on it; when they
//     release it again it is back in this list.
//
// The checks (no size, no weight, no supplier, a duplicate number, a customer
// that does not match the shipment...) inform; the manager decides. A soft
// one - a different name on the goods than the customer's - is shown in a
// lighter colour: often a family member, worth a look, not wrong by itself.
//
// Filters live in the address (?status=...&issue=...), like the activity log.
// Only admins and warehouse managers can open this (ManagerLayout) or make a
// decision (the server checks: warehouse/review.py).
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /warehouse/manager/packages
//   Who can open: admins and warehouse managers
//   Links to:     /warehouse/intake?sheet=:id
//   Backend:      api/warehouse.js getReviewQueue, api/staff.js reviewIntakeSheet

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { reviewIntakeSheet } from '../../api/staff';
import { getReviewQueue } from '../../api/warehouse';
import Loading from '../../components/Loading/Loading';
import { formatDateTime } from '../Dashboard/format';
import { Banner, Empty, Pagination, StatusBadge } from '../Dashboard/ui';
import { usePageText } from '../Dashboard/usePageText';
import own from './Manager.module.css';

// The statuses a manager filters by, in the order of the day's work.
const STATUSES = ['awaiting_review', 'needs_correction', 'approved', 'completed', 'all'];
const ISSUES = [
  'missing_dimensions',
  'missing_weight',
  'missing_supplier',
  'missing_destination',
  'no_customer',
  'customer_mismatch',
  'name_differs',
  'duplicate',
  'incomplete',
];
const STATUS_TONES = {
  awaiting_review: 'attention',
  needs_correction: 'progress',
  approved: 'done',
  completed: 'neutral',
};

/** One sheet, with its checks and the two decisions. */
function ReviewRow({ row, onDecided }) {
  const r = usePageText('warehouseReview');
  // Open while the manager is writing the note for "Send back".
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canApprove = row.quality_status === 'awaiting_review';
  const canSendBack = ['awaiting_review', 'approved'].includes(row.quality_status);

  async function decide(decision) {
    setBusy(true);
    setError('');
    try {
      await reviewIntakeSheet(row.id, decision, decision === 'correction' ? note.trim() : '');
      onDecided(row, decision);
    } catch (caught) {
      setError(caught?.status === 409 ? r('conflict') : r('failed'));
      setBusy(false);
    }
  }

  return (
    <li className={own.reviewRow}>
      <div className={own.reviewHead}>
        <span className={own.itemMain}>
          <span className={own.itemTitle}>
            {row.label}
            {row.revision > 1 && <span className={own.muted}> · {r('version', { number: row.revision })}</span>}
          </span>
          <span className={own.itemNote}>
            {[row.customer ? `${row.customer.name} (${row.customer.customer_code})` : r('noCustomer'), row.supplier, row.destination]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {row.released_by && (
            <span className={own.itemNote}>
              {r('releasedBy', { name: row.released_by, when: formatDateTime(row.released_at) })}
            </span>
          )}
          {row.reviewed_by && (
            <span className={own.itemNote}>
              {r('reviewedBy', { name: row.reviewed_by, when: formatDateTime(row.reviewed_at) })}
              {row.review_note ? ` - "${row.review_note}"` : ''}
            </span>
          )}
        </span>
        <StatusBadge tone={STATUS_TONES[row.quality_status] ?? 'neutral'}>
          {r(`status.${row.quality_status}`)}
        </StatusBadge>
      </div>

      {/* The checks: a problem in the stronger colour, "worth a look" lighter. */}
      <div className={own.badges}>
        {row.issues.length === 0 ? (
          <StatusBadge tone="done">{r('noIssues')}</StatusBadge>
        ) : (
          row.issues.map((code) => (
            <StatusBadge key={code} tone={row.problems.includes(code) ? 'off' : 'progress'}>
              {r(`issue.${code}`)}
            </StatusBadge>
          ))
        )}
      </div>

      {error && (
        <p className={own.muted} role="alert">
          {error}
        </p>
      )}

      {writing ? (
        <div className={own.noteBox}>
          <label className={own.field}>
            <span className={own.fieldLabel}>{r('noteLabel')}</span>
            <textarea
              className={own.input}
              rows={2}
              maxLength={500}
              value={note}
              placeholder={r('notePlaceholder')}
              onChange={(event) => setNote(event.target.value)}
              autoFocus
            />
          </label>
          <p className={own.actions}>
            <button
              type="button"
              className={own.primaryButton}
              disabled={busy || note.trim().length === 0}
              onClick={() => decide('correction')}
            >
              {r('sendBackConfirm')}
            </button>
            <button type="button" className={own.button} onClick={() => setWriting(false)} disabled={busy}>
              {r('cancel')}
            </button>
          </p>
        </div>
      ) : (
        <p className={own.actions}>
          <Link to={`/warehouse/intake?sheet=${row.id}`} className={own.button}>
            {r('openSheet')}
          </Link>
          {canApprove && (
            <button type="button" className={own.primaryButton} disabled={busy} onClick={() => decide('approve')}>
              {r('approve')}
            </button>
          )}
          {canSendBack && (
            <button type="button" className={own.button} disabled={busy} onClick={() => setWriting(true)}>
              {r('sendBack')}
            </button>
          )}
        </p>
      )}
    </li>
  );
}

export default function ManagerReview() {
  const r = usePageText('warehouseReview');
  const [params, setParams] = useSearchParams();
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : 'awaiting_review';
  const issue = ISSUES.includes(params.get('issue')) ? params.get('issue') : '';
  const page = Number(params.get('page')) || 1;

  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState('');
  const requestKey = `${status}|${issue}|${page}#${attempt}`;
  // The answer, labelled with the request it answers (see ManagerActivity).
  const [answer, setAnswer] = useState({ key: null, data: null, failed: false });
  const state = answer.key !== requestKey ? 'loading' : answer.failed ? 'error' : 'ready';

  useEffect(() => {
    let live = true;
    getReviewQueue({ status, issue, page })
      .then((data) => live && setAnswer({ key: requestKey, data, failed: false }))
      .catch(() => live && setAnswer({ key: requestKey, data: null, failed: true }));
    return () => {
      live = false;
    };
  }, [status, issue, page, requestKey]);

  function set(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
    setDone('');
  }

  function setPage(number) {
    const next = new URLSearchParams(params);
    if (number > 1) next.set('page', String(number));
    else next.delete('page');
    setParams(next);
  }

  // A decision moves the sheet to another status: take it off this list,
  // say so, and fetch again so the counts and next page are right.
  function decided(row, decision) {
    setDone(r(decision === 'approve' ? 'approved' : 'sentBack', { label: row.label }));
    setAttempt((n) => n + 1);
  }

  const rows = answer.data?.results ?? [];

  return (
    <section aria-labelledby="manager-review">
      <h2 id="manager-review" className={own.boxTitle}>
        {r('title')}
      </h2>
      <p className={own.muted}>{r('intro')}</p>

      <div className={own.reviewFilters}>
        {/* Status as big buttons: the manager switches between these all day. */}
        <div className={own.chips} role="group" aria-label={r('statusLabel')}>
          {STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              className={value === status ? `${own.chip} ${own.chipActive}` : own.chip}
              aria-pressed={value === status}
              onClick={() => set('status', value === 'awaiting_review' ? '' : value)}
            >
              {r(`status.${value}`)}
            </button>
          ))}
        </div>
        <label className={own.field}>
          <span className={own.fieldLabel}>{r('issueLabel')}</span>
          <select className={own.input} value={issue} onChange={(event) => set('issue', event.target.value)}>
            <option value="">{r('anyIssue')}</option>
            {ISSUES.map((code) => (
              <option key={code} value={code}>
                {r(`issue.${code}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Banner tone="success">{done}</Banner>

      {state === 'loading' && <Loading inline />}
      {state === 'error' && (
        <p className={own.muted} role="alert">
          {r('loadFailed')}{' '}
          <button type="button" className={own.button} onClick={() => setAttempt((n) => n + 1)}>
            {r('retry')}
          </button>
        </p>
      )}
      {state === 'ready' &&
        (rows.length === 0 ? (
          <Empty>{status === 'awaiting_review' && !issue ? r('emptyAwaiting') : r('empty')}</Empty>
        ) : (
          <>
            <p className={own.muted}>{r('count', { count: answer.data.count })}</p>
            <ul className={own.list}>
              {rows.map((row) => (
                <ReviewRow key={`${row.id}-${row.revision}-${row.quality_status}`} row={row} onDecided={decided} />
              ))}
            </ul>
            <Pagination
              page={page}
              count={answer.data.count}
              hasNext={answer.data.has_next}
              hasPrevious={page > 1}
              onChange={setPage}
            />
          </>
        ))}
    </section>
  );
}
