// src/pages/Warehouse/ManagerActivity.jsx
//
// The warehouse's activity log, for managers: every sign-in, sign-out, wrong
// PIN and PIN change, every account switched off or on, and every action on a
// package - in one list, newest first.
//
// FILTERS: worker, action, tracking number, and a date range. They live in
// the address (?worker=7&action=wrong_pin...), so a filtered view can be
// bookmarked or sent to a colleague, and the browser's back button undoes a
// filter.
//
// Each row says who did what, when, to which package (a link to it), and -
// for anything that changed - what it was before and after. When a manager
// acted on a worker (reset their PIN, switched them off) the row says
// "for <worker>".
//
// The records behind this cannot be changed or deleted, by anybody, here or
// in the Django admin. Read-only page.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /warehouse/manager/activity
//   Who can open: admins and warehouse managers (ManagerLayout)
//   Links to:     /warehouse/packages/:id
//   Backend:      api/warehouse.js getManagerActivity

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getManagerActivity } from '../../api/warehouse';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import { formatDateTime } from '../Dashboard/format';
import { Empty, Pagination } from '../Dashboard/ui';
import { usePageText } from '../Dashboard/usePageText';
import styles from '../Dashboard/Dashboard.module.css';
import own from './Manager.module.css';

// The filters, as the query-string keys the server also reads.
const FILTERS = ['worker', 'action', 'tracking', 'date_from', 'date_to'];

/** A label for one action: ours if we have one, else the server's English. */
function useActionLabel() {
  const m = usePageText('warehouseManager');
  return (value, fallback) => {
    const label = m(`actions.${value}`);
    return label.endsWith(`actions.${value}`) ? fallback : label;
  };
}

/**
 * "field: before → after" lines for whatever changed, from the row's
 * `changes` (pairs like from_stage/to_stage, from_location/to_location, and
 * from_weight_kg/to_weight_kg that the server adds for a changed
 * measurement). Values that stayed the same are left out.
 */
function changeLines(changes) {
  if (!changes || typeof changes !== 'object') return [];
  const lines = [];
  for (const [key, before] of Object.entries(changes)) {
    const match = key.match(/^from_(.+)$/);
    if (!match || !(`to_${match[1]}` in changes)) continue;
    const after = changes[`to_${match[1]}`];
    if (String(before ?? '') === String(after ?? '')) continue;
    lines.push({ field: match[1], from: before, to: after });
  }
  return lines;
}

export default function ManagerActivity() {
  const m = usePageText('warehouseManager');
  const actionLabel = useActionLabel();
  // A changed field's name in the page's language ("weight_kg" -> "Weight (kg)").
  const fieldLabel = (field) => {
    const label = m(`fields.${field}`);
    return label.endsWith(`fields.${field}`) ? field.replace(/_/g, ' ') : label;
  };
  const [params, setParams] = useSearchParams();

  const filters = Object.fromEntries(FILTERS.map((key) => [key, params.get(key) ?? '']));
  const page = Number(params.get('page')) || 1;
  // The tracking box is typed into; it filters on Enter or on leaving it,
  // not on every key (each would be a request).
  const [trackingDraft, setTrackingDraft] = useState(filters.tracking);

  const [options, setOptions] = useState(null);
  const [attempt, setAttempt] = useState(0);

  // The query string and the retry count, as one value: the effect below
  // re-runs when (and only when) a filter, the page or a retry changes it.
  const queryKey = params.toString();
  const requestKey = `${queryKey}#${attempt}`;

  // The latest answer, labelled with the request it answers. While it is
  // for an older request, the page shows "loading" - worked out below
  // rather than set, so nothing has to be reset when a filter changes.
  const [answer, setAnswer] = useState({ key: null, data: null, failed: false });
  const state = answer.key !== requestKey ? 'loading' : answer.failed ? 'error' : 'ready';
  const data = answer.data;

  useEffect(() => {
    let live = true;
    getManagerActivity({ ...filters, page, options: options === null })
      .then((result) => {
        if (!live) return;
        if (result.options) setOptions(result.options);
        setAnswer({ key: requestKey, data: result, failed: false });
      })
      .catch(() => live && setAnswer({ key: requestKey, data: null, failed: true }));
    return () => {
      live = false;
    };
    // filters and page are read from queryKey; options only matters once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page'); // a new filter starts at the first page
    setParams(next);
  }

  function setPage(number) {
    const next = new URLSearchParams(params);
    if (number > 1) next.set('page', String(number));
    else next.delete('page');
    setParams(next);
  }

  function clearFilters() {
    setTrackingDraft('');
    setParams(new URLSearchParams());
  }

  const anyFilter = FILTERS.some((key) => filters[key]);
  const floorActions = options?.actions.filter((action) => action.group === 'floor') ?? [];
  const packageActions = options?.actions.filter((action) => action.group === 'package') ?? [];
  const customerActions = options?.actions.filter((action) => action.group === 'customer') ?? [];

  return (
    <section aria-labelledby="manager-activity">
      <h2 id="manager-activity" className={own.boxTitle}>
        {m('activityTitle')}
      </h2>
      <p className={own.muted}>{m('activityIntro')}</p>

      <form
        className={own.filters}
        onSubmit={(event) => {
          event.preventDefault();
          setFilter('tracking', trackingDraft.trim());
        }}
      >
        <label className={own.field}>
          <span className={own.fieldLabel}>{m('filterWorker')}</span>
          <select
            className={own.input}
            value={filters.worker}
            onChange={(event) => setFilter('worker', event.target.value)}
          >
            <option value="">{m('allWorkers')}</option>
            {options?.workers.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} {person.is_active ? '' : m('switchedOff')}
              </option>
            ))}
          </select>
        </label>

        <label className={own.field}>
          <span className={own.fieldLabel}>{m('filterAction')}</span>
          <select
            className={own.input}
            value={filters.action}
            onChange={(event) => setFilter('action', event.target.value)}
          >
            <option value="">{m('allActions')}</option>
            <optgroup label={m('groupFloor')}>
              {floorActions.map((action) => (
                <option key={action.value} value={action.value}>
                  {actionLabel(action.value, action.label)}
                </option>
              ))}
            </optgroup>
            <optgroup label={m('groupPackage')}>
              {packageActions.map((action) => (
                <option key={action.value} value={action.value}>
                  {actionLabel(action.value, action.label)}
                </option>
              ))}
            </optgroup>
            <optgroup label={m('groupCustomer')}>
              {customerActions.map((action) => (
                <option key={action.value} value={action.value}>
                  {actionLabel(action.value, action.label)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        <label className={own.field}>
          <span className={own.fieldLabel}>{m('filterTracking')}</span>
          <input
            className={own.input}
            type="search"
            value={trackingDraft}
            maxLength={50}
            onChange={(event) => setTrackingDraft(event.target.value)}
            // Enter filters. Handled here: a form with several boxes and no
            // submit button does not submit itself on Enter.
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                setFilter('tracking', trackingDraft.trim());
              }
            }}
            onBlur={() => {
              if (trackingDraft.trim() !== filters.tracking) setFilter('tracking', trackingDraft.trim());
            }}
          />
        </label>

        <label className={own.field}>
          <span className={own.fieldLabel}>{m('filterFrom')}</span>
          <input
            className={own.input}
            type="date"
            value={filters.date_from}
            onChange={(event) => setFilter('date_from', event.target.value)}
          />
        </label>

        <label className={own.field}>
          <span className={own.fieldLabel}>{m('filterTo')}</span>
          <input
            className={own.input}
            type="date"
            value={filters.date_to}
            min={filters.date_from || undefined}
            onChange={(event) => setFilter('date_to', event.target.value)}
          />
        </label>

        <button type="button" className={own.button} onClick={clearFilters} disabled={!anyFilter}>
          {m('clearFilters')}
        </button>
      </form>

      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={() => setAttempt((n) => n + 1)} />}

      {state === 'ready' &&
        (data.results.length === 0 ? (
          <Empty>{m('noActivity')}</Empty>
        ) : (
          <>
            <p className={own.muted}>{m('resultCount', { count: data.count })}</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{m('colWhen')}</th>
                    <th scope="col">{m('colWho')}</th>
                    <th scope="col">{m('colAction')}</th>
                    <th scope="col">{m('colPackage')}</th>
                    <th scope="col">{m('colDetails')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((row) => (
                    <tr key={row.id}>
                      <td className={own.when}>{formatDateTime(row.at)}</td>
                      <td>
                        {row.worker?.name ?? '—'}
                        {row.subject && (
                          <div className={own.muted}>{m('onWorker', { name: row.subject.name })}</div>
                        )}
                      </td>
                      <td>{actionLabel(row.action, row.action_display)}</td>
                      <td>
                        {row.package && (
                          <Link to={`/warehouse/packages/${row.package.id}`} className={styles.link}>
                            {row.package.tracking_number}
                          </Link>
                        )}
                        {/* Goods put under a customer: their intake sheet. */}
                        {row.sheet && (
                          <div>
                            <Link to={`/warehouse/intake?sheet=${row.sheet.id}`} className={styles.link}>
                              {row.sheet.reference || `#${row.sheet.id}`}
                            </Link>
                          </div>
                        )}
                        {!row.package && !row.sheet && '—'}
                      </td>
                      <td>
                        {row.description}
                        {row.device && <div className={own.muted}>{m('onDevice', { device: row.device })}</div>}
                        {changeLines(row.changes).length > 0 && (
                          <ul className={own.changes}>
                            {changeLines(row.changes).map((line) => (
                              <li key={`${line.field}-${line.from}-${line.to}`}>
                                {m('changeLine', {
                                  field: fieldLabel(line.field),
                                  from: line.from ?? '—',
                                  to: line.to ?? '—',
                                })}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              count={data.count}
              hasNext={data.has_next}
              hasPrevious={page > 1}
              onChange={setPage}
            />
          </>
        ))}
    </section>
  );
}
