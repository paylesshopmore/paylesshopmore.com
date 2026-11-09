// src/pages/Dashboard/Feedback.jsx
//
// Dashboard -> Feedback: everything sent with the "Feedback" button on the
// website, and every delivery review, newest first. Filter by kind, stars
// and handled; search the comments. "Mark handled" stamps who and when
// (backend feedback/views.py, StaffFeedbackViewSet). Nothing is deleted.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /dashboard/feedback
//   Who can open: office staff and admins
//   Backend:      api/feedback.js listStaffFeedback, updateStaffFeedback

import { useState } from 'react';
import { listStaffFeedback, updateStaffFeedback } from '../../api/feedback';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import StarRating from '../../components/Feedback/StarRating';
import Loading from '../../components/Loading/Loading';
import { formatDateTime } from './format';
import { Banner, Empty, FilterSelect, Pagination, SearchInput, StatusBadge, Toolbar } from './ui';
import styles from './Dashboard.module.css';
import { useCollection } from './useCollection';
import { usePageText } from './usePageText';

export default function Feedback() {
  const f = usePageText('feedbackStaff');
  const list = useCollection(listStaffFeedback, { kind: '', rating: '', handled: 'false' });
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  async function setHandled(row, handled) {
    setSavingId(row.id);
    setError('');
    try {
      list.replaceRow(await updateStaffFeedback(row.id, { handled }));
    } catch {
      setError(f('failed'));
    } finally {
      setSavingId(null);
    }
  }

  // The average of what is on screen: a quick feel for the mood.
  const average =
    list.rows.length > 0
      ? (list.rows.reduce((sum, row) => sum + row.rating, 0) / list.rows.length).toFixed(1)
      : null;

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>{f('title')}</h1>
        <p className={styles.subtitle}>{f('subtitle')}</p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label={f('searchLabel')}
          placeholder={f('searchPlaceholder')}
        />
        <FilterSelect
          label={f('kind')}
          value={list.filters.kind}
          onChange={(value) => list.setFilter('kind', value)}
          options={['site', 'delivery'].map((value) => ({ value, label: f(`kinds.${value}`) }))}
          allLabel={f('allKinds')}
        />
        <FilterSelect
          label={f('rating')}
          value={list.filters.rating}
          onChange={(value) => list.setFilter('rating', value)}
          options={[5, 4, 3, 2, 1].map((count) => ({ value: String(count), label: f('stars', { count }) }))}
          allLabel={f('allRatings')}
        />
        <FilterSelect
          label={f('handled')}
          value={list.filters.handled}
          onChange={(value) => list.setFilter('handled', value)}
          options={[
            { value: 'false', label: f('notHandled') },
            { value: 'true', label: f('isHandled') },
          ]}
          allLabel={f('allStatuses')}
        />
      </Toolbar>

      <Banner tone="error">{error}</Banner>

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>{f('noMatch')}</Empty>
        ) : (
          <>
            {average && <p className={styles.mutedCell}>{f('average', { average })}</p>}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{f('colFrom')}</th>
                    <th scope="col">{f('colRating')}</th>
                    <th scope="col">{f('colComment')}</th>
                    <th scope="col">{f('colReceived')}</th>
                    <th scope="col">
                      <span className={styles.srOnly}>{f('handled')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((row) => (
                    <tr key={row.id} className={row.handled_at ? undefined : styles.rowUnhandled}>
                      <td>
                        <div className={styles.primaryCell}>
                          {row.customer ? row.customer.name : f('anonymous')}
                        </div>
                        {(row.customer?.email || row.email) && (
                          <div className={styles.mutedCell}>
                            <a className={styles.link} href={`mailto:${row.customer?.email || row.email}`}>
                              {row.customer?.email || row.email}
                            </a>
                          </div>
                        )}
                        <StatusBadge tone="neutral">{f(`kinds.${row.kind}`)}</StatusBadge>
                      </td>
                      <td>
                        <StarRating value={row.rating} readOnly />
                      </td>
                      <td>
                        {/* Plain text - a stranger may have written it. */}
                        <div className={styles.excerpt}>{row.comment || f('noComment')}</div>
                        {row.kind === 'delivery' && row.package_tracking && (
                          <div className={styles.mutedCell}>{f('shipment', { tracking: row.package_tracking })}</div>
                        )}
                        {row.kind === 'site' && row.page && (
                          <div className={styles.mutedCell}>{f('onPage', { page: row.page })}</div>
                        )}
                      </td>
                      <td className={styles.dateCell}>{formatDateTime(row.created_at)}</td>
                      <td>
                        <button
                          type="button"
                          className={row.handled_at ? `${styles.rowButton} ${styles.rowButtonDone}` : styles.rowButton}
                          disabled={savingId === row.id}
                          onClick={() => setHandled(row, !row.handled_at)}
                        >
                          {row.handled_at ? f('isHandled') : f('markHandled')}
                        </button>
                        {row.handled_by_name && (
                          <div className={styles.mutedCell}>{f('handledBy', { name: row.handled_by_name })}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ))}

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
