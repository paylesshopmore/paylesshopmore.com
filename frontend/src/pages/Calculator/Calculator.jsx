// src/pages/Calculator/Calculator.jsx
//
// The shipping calculator: destination, what the goods cost, their size and
// weight, the import category and sea or air - and an indication of what it
// costs to get them there.
//
// The arithmetic is in src/calculator/calculate.js and every price in
// src/calculator/rates.js. This file is only about the screen: it keeps what
// the visitor typed, sends it to calculate() and shows what comes back.
//
// Each line of the result is shown only when its price is known. Import duty
// for Curaçao comes from the customs tariff, so it shows straight away;
// freight and the fixed fees show once rates.js has a freight price, and the
// island's tax once it has that rate. Until then the
// result offers a quote with the details already filled in, rather than a
// price nobody has set.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /calculator
//   Who can open: everybody
//   Links to:     / (Home)
//   Linked from:  the Header and Footer menus, the warehouse Profile page
//   Backend:      api/pricing.js (the handling-cost rules; the other sums are
//                 in src/calculator/), api/quote.js (the QuoteForm under the result)

import { useEffect, useMemo, useRef, useState } from 'react';
import { getHandlingRules } from '../../api/pricing';
import { Link } from 'react-router-dom';
import { calculate, validateInput } from '../../calculator/calculate';
import { DESTINATIONS, IMPORT_CATEGORIES } from '../../calculator/rates';
import QuoteForm from '../../components/QuoteForm/QuoteForm';
import { usePageMeta } from '../../hooks/usePageMeta';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Calculator.module.css';

// The Dutch VAT rates a shop can charge: 0%, 9% (low rate) and 21% (standard).
const VAT_RATES = [0, 9, 21];
const TRANSPORTS = ['air', 'sea'];
// The island names as the quote form sends them (and as the office reads them).
const ISLAND_NAMES = { curacao: 'Curaçao' };

// What the form holds before the visitor types anything. Number boxes hold
// text ('500'), because that is what form inputs give us; handleSubmit turns
// them into numbers.
const EMPTY = {
  destination: 'curacao',
  priceInclVat: '',
  vatPercent: 21,
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  weightGrams: '',
  category: '',
  transport: 'sea',
};

/** A number for the screen, with the decimal the visitor reads. */
function useFormat() {
  const { language } = useLanguage();
  const locale = language === 'en' ? 'en-GB' : 'nl-NL';
  return {
    euro: (value) =>
      value.toLocaleString(locale, { style: 'currency', currency: 'EUR' }),
    number: (value, digits = 2) =>
      value.toLocaleString(locale, { maximumFractionDigits: digits }),
  };
}

/** A labelled number box with a unit after it. */
function NumberField({ label, name, value, unit, error, onChange, step = 'any' }) {
  const { t } = useLanguage();
  const id = `calc-${name}`;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.inputRow}>
        <input
          id={id}
          className={styles.input}
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          name={name}
          value={value}
          onChange={onChange}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      {error && (
        <span className={styles.error} id={`${id}-error`}>
          {t(error)}
        </span>
      )}
    </div>
  );
}

/** A row of radio buttons styled as a segmented choice. */
function Choice({ legend, name, options, value, onChange }) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.label}>{legend}</legend>
      <div className={styles.choices}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`${styles.choice} ${String(value) === String(option.value) ? styles.choiceOn : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={String(value) === String(option.value)}
              onChange={onChange}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Form values are text ('500'); the calculator needs numbers (500). */
function toInput(form) {
  return {
    ...form,
    priceInclVat: Number(form.priceInclVat),
    vatPercent: Number(form.vatPercent),
    lengthCm: Number(form.lengthCm),
    widthCm: Number(form.widthCm),
    heightCm: Number(form.heightCm),
    weightGrams: Number(form.weightGrams),
  };
}

export default function Calculator() {
  const { t } = useLanguage();
  const format = useFormat();
  usePageMeta(t('calculator.title'), t('calculator.summary'), '/calculator');

  // What is in the form right now, e.g. { priceInclVat: '500', ... }.
  const [values, setValues] = useState(EMPTY);
  // Field -> translation key of its error message, e.g. { lengthCm: '...' }.
  const [errors, setErrors] = useState({});
  // What the shown result was worked out from (the typed numbers), or null
  // before the first Calculate. The result itself is worked out from this
  // below, with the latest handling-cost rules.
  const [input, setInput] = useState(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  // The result card, so we can scroll to it after calculating.
  const resultRef = useRef(null);
  // The handling-cost rules, from the server (backend invoicing/
  // calculation.py). null until they arrive, or when they cannot be fetched:
  // then the result has no handling line and no total, rather than a guess.
  const [handlingRules, setHandlingRules] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getHandlingRules()
      .then((answer) => {
        if (!cancelled) setHandlingRules(answer?.rules ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Worked out again only when the numbers or the rules change - so the
  // handling costs follow the price as it is typed, and appear as soon as
  // the rules arrive.
  const result = useMemo(
    () => (input ? { input, output: calculate(input, { handlingRules }) } : null),
    [input, handlingRules],
  );

  // One handler for every field: the input's `name` says which value to set.
  function handleChange(event) {
    const { name, value } = event.target;
    const next = { ...values, [name]: value };
    setValues(next);
    // Once there is a result it follows the form: change the price and the
    // handling costs (and everything else) update at once, without pressing
    // Calculate again. A half-typed form keeps the last good result.
    if (input && Object.keys(validateInput(next)).length === 0) setInput(toInput(next));
    // The visitor is fixing this field, so stop showing its error.
    setErrors((current) => {
      if (!current[name]) return current;
      const remaining = { ...current };
      delete remaining[name];
      return remaining;
    });
  }

  function handleSubmit(event) {
    // Stop the browser from reloading the page, which is what a form does by default.
    event.preventDefault();
    // Check the form first: never calculate with an empty or negative number.
    const found = validateInput(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setInput(null);
      return;
    }

    setInput(toInput(values));
    setQuoteOpen(false);
    // On a phone the result is below the form: bring it into view.
    window.requestAnimationFrame?.(() =>
      resultRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
    );
  }

  /** The calculation, written out for the quote form's message box. */
  function quoteMessage({ input, output }) {
    return [
      t('calculator.quote.intro'),
      `${t('calculator.destination')}: ${ISLAND_NAMES[input.destination]}`,
      `${t('calculator.price')}: ${format.euro(input.priceInclVat)} (${t('calculator.vat')} ${input.vatPercent}%)`,
      `${t('calculator.dimensions')}: ${input.lengthCm} x ${input.widthCm} x ${input.heightCm} cm`,
      `${t('calculator.weight')}: ${format.number(input.weightGrams, 0)} ${t('calculator.grams')}`,
      `${t('calculator.category')}: ${t(`calculator.categories.${input.category}`)}`,
      `${t('calculator.transport')}: ${t(`calculator.transports.${input.transport}`)}`,
      `${fill(t('calculator.result.vat'), { percent: input.vatPercent })}: ${format.euro(output.vatAmount)}`,
      `${t('calculator.result.goodsValue')}: ${format.euro(output.goodsValue)}`,
      `${t('calculator.result.volume')}: ${format.number(output.volumeM3, 3)} m³`,
      `${t('calculator.result.chargeable')}: ${format.number(output.chargeableKg)} kg`,
      output.freight !== null &&
        `${fill(t('calculator.result.freight'), { method: t(`calculator.transports.${input.transport}`) })}: ${format.euro(output.freight)}`,
      ...output.fees.map((fee) => `${t(`calculator.result.fees.${fee.key}`)}: ${format.euro(fee.amount)}`),
      // Only when the island's tariff has a rate for this category.
      output.duty !== null &&
        `${fill(t('calculator.result.duty'), { percent: format.number(output.dutyPercent, 1) })}: ${format.euro(output.duty)}`,
    ]
      .filter(Boolean) // drops the `false` left by a line that does not apply
      .join('\n');
  }

  const output = result?.output;
  const island = result?.input.destination;

  return (
    <main className={styles.page}>
      <header className={styles.banner}>
        <div className={styles.bannerInner}>
          <h1 className={styles.title}>{t('calculator.title')}</h1>
          <hr className={styles.rule} />
          <p className={styles.breadcrumb}>
            <Link to="/" className={styles.crumbLink}>
              {t('nav.home')}
            </Link>{' '}
            &raquo; {t('calculator.title')}
          </p>
        </div>
      </header>

      <div className={styles.body}>
        <p className={styles.intro}>{t('calculator.intro')}</p>

        <div className={styles.layout}>
          {/* The form: the same questions, in the same order, as a webshop's
              own calculator, so it reads familiar. */}
          <form className={styles.card} onSubmit={handleSubmit} noValidate>
            <h2 className={styles.cardTitle}>{t('calculator.formTitle')}</h2>

            {/* With one island there is nothing to choose: just say where it
                goes. With more, the visitor picks one. */}
            {DESTINATIONS.length === 1 ? (
              <p className={styles.label}>
                {t('calculator.destination')}: {ISLAND_NAMES[DESTINATIONS[0]]}
              </p>
            ) : (
              <Choice
                legend={t('calculator.destination')}
                name="destination"
                value={values.destination}
                onChange={handleChange}
                options={DESTINATIONS.map((key) => ({ value: key, label: ISLAND_NAMES[key] }))}
              />
            )}

            <NumberField
              label={t('calculator.price')}
              name="priceInclVat"
              value={values.priceInclVat}
              unit="€"
              error={errors.priceInclVat}
              onChange={handleChange}
            />

            <Choice
              legend={t('calculator.vat')}
              name="vatPercent"
              value={values.vatPercent}
              onChange={handleChange}
              options={VAT_RATES.map((rate) => ({ value: rate, label: `${rate}%` }))}
            />

            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>{t('calculator.dimensions')}</legend>
              <div className={styles.dimensions}>
                {['lengthCm', 'widthCm', 'heightCm'].map((side) => (
                  <NumberField
                    key={side}
                    label={t(`calculator.sides.${side}`)}
                    name={side}
                    value={values[side]}
                    unit="cm"
                    error={errors[side]}
                    onChange={handleChange}
                  />
                ))}
              </div>
            </fieldset>

            <NumberField
              label={t('calculator.weight')}
              name="weightGrams"
              value={values.weightGrams}
              unit={t('calculator.grams')}
              step="1"
              error={errors.weightGrams}
              onChange={handleChange}
            />

            <div className={styles.field}>
              <label className={styles.label} htmlFor="calc-category">
                {t('calculator.category')}
              </label>
              <select
                id="calc-category"
                className={styles.input}
                name="category"
                value={values.category}
                onChange={handleChange}
                aria-invalid={Boolean(errors.category)}
              >
                <option value="">{t('calculator.chooseCategory')}</option>
                {IMPORT_CATEGORIES.map((key) => (
                  <option key={key} value={key}>
                    {t(`calculator.categories.${key}`)}
                  </option>
                ))}
              </select>
              {errors.category && <span className={styles.error}>{t(errors.category)}</span>}
            </div>

            <Choice
              legend={t('calculator.transport')}
              name="transport"
              value={values.transport}
              onChange={handleChange}
              options={TRANSPORTS.map((key) => ({ value: key, label: t(`calculator.transports.${key}`) }))}
            />

            <button type="submit" className={styles.submit}>
              {t('calculator.submit')}
            </button>
          </form>

          {/* The result. Empty until the first calculation. */}
          <section className={styles.card} ref={resultRef} aria-labelledby="calc-result" aria-live="polite">
            <h2 className={styles.cardTitle} id="calc-result">
              {t('calculator.result.title')}
            </h2>

            {!output ? (
              <p className={styles.empty}>{t('calculator.result.empty')}</p>
            ) : (
              <>
                <dl className={styles.lines}>
                  {/* The shop price, split into the Dutch VAT in it and the
                      value without it (what customs on the island looks at). */}
                  <div className={styles.line}>
                    <dt>{t('calculator.result.priceInclVat')}</dt>
                    <dd>{format.euro(result.input.priceInclVat)}</dd>
                  </div>
                  <div className={styles.line}>
                    <dt>{fill(t('calculator.result.vat'), { percent: result.input.vatPercent })}</dt>
                    <dd>{format.euro(output.vatAmount)}</dd>
                  </div>
                  <div className={styles.line}>
                    <dt>{t('calculator.result.goodsValue')}</dt>
                    <dd>{format.euro(output.goodsValue)}</dd>
                  </div>
                  <div className={styles.line}>
                    <dt>{t('calculator.result.volume')}</dt>
                    <dd>{format.number(output.volumeM3, 3)} m³</dd>
                  </div>
                  <div className={styles.line}>
                    <dt>{t('calculator.result.actual')}</dt>
                    <dd>{format.number(output.actualKg)} kg</dd>
                  </div>
                  <div className={styles.line}>
                    <dt>{t('calculator.result.volumetric')}</dt>
                    <dd>{format.number(output.volumetricKg)} kg</dd>
                  </div>
                  {result.input.transport === 'air' && (
                    <div className={styles.line}>
                      <dt>{t('calculator.result.chargeable')}</dt>
                      <dd>{format.number(output.chargeableKg)} kg</dd>
                    </div>
                  )}

                  {/* Prices: only the ones that are known. */}
                  {output.freight !== null && (
                    <div className={styles.line}>
                      <dt>
                        {fill(t('calculator.result.freight'), {
                          method: t(`calculator.transports.${result.input.transport}`),
                        })}
                      </dt>
                      <dd>{format.euro(output.freight)}</dd>
                    </div>
                  )}
                  {/* Administration, documentation and handling: fixed per shipment. */}
                  {output.fees.map((fee) => (
                    <div className={styles.line} key={fee.key}>
                      <dt>{t(`calculator.result.fees.${fee.key}`)}</dt>
                      <dd>{format.euro(fee.amount)}</dd>
                    </div>
                  ))}
                  {/* Duty depends only on the goods value, so it shows even
                      when there is no freight price yet. */}
                  {output.duty !== null && (
                    <div className={styles.line}>
                      <dt>
                        {fill(t('calculator.result.duty'), {
                          // 10.5 -> "10,5" in Dutch, "10.5" in English.
                          percent: format.number(output.dutyPercent, 1),
                        })}
                      </dt>
                      <dd>{format.euro(output.duty)}</dd>
                    </div>
                  )}
                  {output.localTax !== null && (
                    <div className={styles.line}>
                      <dt>
                        {fill(t(`calculator.result.localTax.${island}`), {
                          percent: output.localTaxPercent,
                        })}
                      </dt>
                      <dd>{format.euro(output.localTax)}</dd>
                    </div>
                  )}
                  {output.total !== null && (
                    <div className={`${styles.line} ${styles.total}`}>
                      <dt>{t('calculator.result.total')}</dt>
                      <dd>{format.euro(output.total)}</dd>
                    </div>
                  )}
                </dl>

                {/* No price for this route yet, or not every part of one. */}
                {!output.priced ? (
                  <p className={styles.notice}>{t('calculator.result.notPriced')}</p>
                ) : (
                  output.total === null && <p className={styles.notice}>{t('calculator.result.partial')}</p>
                )}

                {output.duty !== null && <p className={styles.disclaimer}>{t('calculator.result.dutyNote')}</p>}
                <p className={styles.disclaimer}>{t('calculator.result.disclaimer')}</p>

                {!quoteOpen ? (
                  <button type="button" className={styles.quoteButton} onClick={() => setQuoteOpen(true)}>
                    {t('calculator.quote.button')}
                  </button>
                ) : (
                  // Keyed on the calculation, so a new one starts a fresh message.
                  <div className={styles.quote}>
                    <QuoteForm
                      key={JSON.stringify(result.input)}
                      destination={ISLAND_NAMES[island]}
                      initialMessage={quoteMessage(result)}
                    />
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
