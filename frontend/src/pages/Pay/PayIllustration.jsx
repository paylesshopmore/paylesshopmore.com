// src/pages/Pay/PayIllustration.jsx
//
// A small drawing for the payment card: an invoice on the left, a phone on
// the right, and a green check that pops in on the phone. Drawn here as SVG
// (so it is sharp at any size, weighs almost nothing and uses the site's own
// colours) rather than loaded as a picture. The movement is in Pay.module.css
// and switches itself off for visitors who asked their device for less motion.
//
// It is decoration: aria-hidden, and the words next to it say everything.

import styles from './Pay.module.css';

export default function PayIllustration() {
  return (
    <svg
      className={styles.illustration}
      viewBox="0 0 320 180"
      aria-hidden="true"
      focusable="false"
    >
      {/* soft background blob */}
      <ellipse cx="160" cy="98" rx="140" ry="70" fill="#fef9c3" />

      {/* the invoice: floats gently */}
      <g className={styles.invoice}>
        <rect x="58" y="32" width="96" height="124" rx="8" fill="#ffffff" stroke="#0b2545" strokeWidth="3" />
        <rect x="72" y="46" width="44" height="9" rx="3" fill="#0b2545" />
        <rect x="72" y="66" width="68" height="6" rx="3" fill="#cbd5e1" />
        <rect x="72" y="80" width="58" height="6" rx="3" fill="#cbd5e1" />
        <rect x="72" y="94" width="64" height="6" rx="3" fill="#cbd5e1" />
        <rect x="72" y="118" width="68" height="22" rx="5" fill="#fde047" />
        <text x="106" y="134" textAnchor="middle" fontSize="11" fontWeight="800" fill="#0b2545">
          PLSM-
        </text>
      </g>

      {/* an arrow from invoice to phone */}
      <path
        className={styles.arrow}
        d="M160 96 H186 M178 88 L188 96 L178 104"
        fill="none"
        stroke="#0b2545"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* the phone */}
      <g>
        <rect x="196" y="24" width="68" height="132" rx="12" fill="#0b2545" />
        <rect x="203" y="38" width="54" height="104" rx="5" fill="#ffffff" />
        <rect x="222" y="29" width="16" height="4" rx="2" fill="#475569" />
        <rect x="211" y="112" width="38" height="16" rx="8" fill="#fde047" />
        <rect x="216" y="48" width="28" height="5" rx="2.5" fill="#cbd5e1" />
        {/* the check: pops in, then rests */}
        <g className={styles.check}>
          <circle cx="230" cy="82" r="18" fill="#16a34a" />
          <path
            d="M221 82 L228 89 L240 75"
            fill="none"
            stroke="#ffffff"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  );
}
