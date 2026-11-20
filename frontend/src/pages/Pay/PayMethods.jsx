// src/pages/Pay/PayMethods.jsx
//
// The payment methods Stripe offers, as a row of small logo badges.
//
// The marks are simple SVG drawings in each brand's colours - NOT the
// companies' official artwork, which comes with usage rules of its own. To use
// the real logos, download them from each brand's official brand page, put the
// files in src/images and replace the matching drawing below with an <img>.
//
// Which methods a customer is actually offered is decided in the Stripe
// dashboard (Settings > Payment methods), not here.

import styles from './Pay.module.css';

// Every drawing is 64 x 40, so the badges all come out the same size.
const METHODS = [
  {
    name: 'iDEAL',
    mark: (
      <>
        <rect x="8" y="6" width="48" height="28" rx="5" fill="#cc0066" />
        <text x="32" y="25" textAnchor="middle" fontSize="15" fontWeight="800" fill="#ffffff">
          iDEAL
        </text>
      </>
    ),
  },
  {
    name: 'Visa',
    mark: (
      <text
        x="32"
        y="27"
        textAnchor="middle"
        fontSize="20"
        fontWeight="900"
        fontStyle="italic"
        fill="#1a1f71"
      >
        VISA
      </text>
    ),
  },
  {
    name: 'Mastercard',
    mark: (
      <>
        <circle cx="25" cy="20" r="11" fill="#eb001b" />
        <circle cx="39" cy="20" r="11" fill="#f79e1b" fillOpacity="0.9" />
      </>
    ),
  },
  {
    name: 'PayPal',
    mark: (
      <text x="32" y="26" textAnchor="middle" fontSize="14" fontWeight="800" fontStyle="italic">
        <tspan fill="#003087">Pay</tspan>
        <tspan fill="#009cde">Pal</tspan>
      </text>
    ),
  },
  {
    name: 'Apple Pay',
    mark: (
      <text x="32" y="26" textAnchor="middle" fontSize="15" fontWeight="700" fill="#000000">
        Pay
      </text>
    ),
  },
];

export default function PayMethods({ label }) {
  return (
    <ul className={styles.methodList} aria-label={label}>
      {METHODS.map((method) => (
        <li key={method.name} className={styles.method}>
          {/* The drawing is decoration; the name is what a screen reader says. */}
          <svg viewBox="0 0 64 40" className={styles.methodMark} aria-hidden="true" focusable="false">
            {method.mark}
          </svg>
          <span className={styles.srOnly}>{method.name}</span>
        </li>
      ))}
    </ul>
  );
}
