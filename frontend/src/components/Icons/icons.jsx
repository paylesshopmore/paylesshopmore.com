// src/components/Icons/icons.jsx
//
// Line icons for the public website: the robot's Help panel and the
// onboarding tour. Drawn inline (no icon font, no image files) so they stay
// sharp at any size and take the text colour around them.
//
// All one family, the same as the staff dashboard's icons
// (src/pages/Dashboard/icons.jsx): 24×24 box, no fill, 1.8 stroke, round
// caps and joins. Keep new icons to that style - mixing styles, or mixing in
// emoji, is what makes an interface look thrown together.
//
// Size: 1em by default, so an icon matches the font size it sits next to.
// Pass `size` (e.g. size={20}) for a fixed size in pixels.
//
// Every icon is decorative (aria-hidden): it always sits next to a text label
// that says the same thing.

function Icon({ size = '1em', className, children }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Start again: a circular arrow. */
export function RestartIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 3.5V8H8" />
    </Icon>
  );
}

/** Sea freight: a ship on the water. */
export function ShipIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 15.5 5.5 19h13l1.5-3.5Z" />
      <path d="M6 15.5V10h12v5.5" />
      <path d="M10 10V6.5h4V10" />
      <path d="M2.5 21.5c1.5 0 1.5-.8 3-.8s1.5.8 3 .8 1.5-.8 3-.8 1.5.8 3 .8 1.5-.8 3-.8 1.5.8 3 .8" />
    </Icon>
  );
}

/** Air freight: a plane. */
export function PlaneIcon(props) {
  return (
    <Icon {...props}>
      <path d="M10.5 13.5 3 11l1.5-1.5 8 .5 4.5-4.5a2 2 0 0 1 3 3L15.5 13l.5 8-1.5 1.5-2.5-7.5" />
      <path d="m7 17-2.5.5L4 20l2.5-.5L7 17Z" />
    </Icon>
  );
}

/** How to order: an open book. */
export function BookIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5" />
      <path d="M12 6.5c2-1.5 5-2 8.5-1.5v13c-3.5-.5-6.5 0-8.5 1.5Z" />
    </Icon>
  );
}

/** Tracking: a location pin. */
export function PinIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </Icon>
  );
}

/** Contact: an envelope. */
export function MailIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </Icon>
  );
}

/** Time: a clock. */
export function ClockIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

/** Copy: two overlapping sheets. */
export function CopyIcon(props) {
  return (
    <Icon {...props}>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </Icon>
  );
}

/** Done / copied: a tick. */
export function CheckIcon(props) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

/** Done, in a circle: the "You're all set" mark. */
export function CheckCircleIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8 12.3 2.8 2.7L16 9.5" />
    </Icon>
  );
}

/** Online store: a shopping cart. */
export function CartIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2.5 4h2.6l2.3 10.5h10.3L20 7.5H6.2" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="16.5" cy="19" r="1.5" />
    </Icon>
  );
}

/** Warehouse: a building with a wide door. */
export function WarehouseIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 20V9l9-5 9 5v11" />
      <path d="M7 20v-7h10v7" />
      <path d="M7 16.5h10" />
    </Icon>
  );
}

/** Destination: a house. */
export function HomeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5h4v5" />
    </Icon>
  );
}

/** Read aloud: a speaker with sound waves. */
export function SpeakerIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </Icon>
  );
}

/** Stop reading: a square. */
export function StopIcon(props) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
    </Icon>
  );
}

/** "Go there": a small arrow pointing right. */
export function ChevronRightIcon(props) {
  return (
    <Icon {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </Icon>
  );
}

/** An invoice: a sheet of paper with a folded corner and lines of text. */
export function InvoiceIcon(props) {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </Icon>
  );
}

/** Download: an arrow down into a tray. */
export function DownloadIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4.5 16.5v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </Icon>
  );
}

/** A back arrow: "return to where you were". */
export function ArrowLeftIcon(props) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m10.5 6.5-5.5 5.5 5.5 5.5" />
    </Icon>
  );
}

/** A downward arrow, between the steps of a flow. */
export function ArrowDownIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="m6.5 13.5 5.5 5.5 5.5-5.5" />
    </Icon>
  );
}

/** Chat: a speech bubble. */
export function ChatIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5v-3.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
      <path d="M8 10h8M8 13h5" />
    </Icon>
  );
}

/** Send a message: a paper plane. */
export function SendIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20.5 3.5 10 14" />
      <path d="M20.5 3.5 14 20.5l-4-6.5-6.5-4Z" />
    </Icon>
  );
}

/** Close: an ×. */
export function CloseIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

/** Start a tour: a play button in a circle. */
export function PlayIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10.2 8.8v6.4l5-3.2Z" />
    </Icon>
  );
}

/** A notification: a bell. */
export function BellIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </Icon>
  );
}
