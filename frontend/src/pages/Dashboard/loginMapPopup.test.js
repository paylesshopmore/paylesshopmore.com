// What a marker's popup shows, and - above all - that a username typed by a
// stranger can never run as HTML in an administrator's browser.

import { describe, expect, it } from 'vitest';
import { colorFor, MARKER_COLORS } from './loginMapColors';
import { popupFor, unknownPopup } from './loginMapPopup';

const text = {
  username: 'Username',
  country: 'Country',
  city: 'City',
  ip: 'IP address',
  device: 'Device',
  browser: 'Browser',
  time: 'Login time',
  status: 'Status',
  security: 'Security status',
  statusName: { success: 'Successful', failed: 'Failed' },
  securityName: { normal: 'Normal', suspicious: 'Suspicious' },
  flagName: { many_failures_ip: 'Many failed attempts from this IP address' },
  unknownTitle: (count) => `${count} attempts with an unknown location`,
  when: () => '12 November 2026, 14:30',
};

const row = {
  identifier: 'john@example.com',
  country: 'Netherlands',
  city: 'Rotterdam',
  region: '',
  ip_address: '203.0.113.10',
  device: 'Windows 10/11',
  browser: 'Chrome',
  created_at: '2026-11-12T13:30:00Z',
  status: 'success',
  security_status: 'normal',
  flags: [],
};

describe('the marker popup', () => {
  it('shows every field the office asked for', () => {
    const popup = popupFor(row, text);
    for (const expected of [
      'Username: john@example.com',
      'Country: Netherlands',
      'City: Rotterdam',
      'IP address: 203.0.113.10',
      'Device: Windows 10/11',
      'Browser: Chrome',
      'Login time: 12 November 2026, 14:30',
      'Status: Successful',
      'Security status: Normal',
    ]) {
      expect(popup.textContent).toContain(expected);
    }
  });

  it('says why an attempt was flagged', () => {
    const popup = popupFor({ ...row, security_status: 'suspicious', flags: ['many_failures_ip'] }, text);
    expect(popup.textContent).toContain('Suspicious');
    expect(popup.textContent).toContain('Many failed attempts from this IP address');
  });

  it('shows a dash for anything unknown', () => {
    const popup = popupFor({ ...row, country: '', city: '', ip_address: null }, text);
    expect(popup.textContent).toContain('Country: —');
    expect(popup.textContent).toContain('IP address: —');
  });

  it('never turns a typed username into HTML', () => {
    const evil = '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>';
    const popup = popupFor({ ...row, identifier: evil }, text);
    // The characters are shown as they were typed ...
    expect(popup.textContent).toContain(evil);
    // ... and no element was ever created from them.
    expect(popup.querySelector('img')).toBeNull();
    expect(popup.querySelector('script')).toBeNull();
  });

  it('does the same in the "unknown location" popup', () => {
    const popup = unknownPopup(
      { count: 1, latest: [{ identifier: '<b onclick="x()">hi</b>', ip_address: '10.0.0.1', created_at: '2026-11-12T13:30:00Z' }] },
      text,
    );
    expect(popup.textContent).toContain('1 attempts with an unknown location');
    expect(popup.querySelector('b')).toBeNull();
  });
});

describe('the marker colours', () => {
  it('is green for a successful sign-in and red for a failed one', () => {
    expect(colorFor({ status: 'success', security_status: 'normal' })).toBe(MARKER_COLORS.success);
    expect(colorFor({ status: 'failed', security_status: 'normal' })).toBe(MARKER_COLORS.failed);
  });

  it('is orange for anything suspicious or blocked, whatever happened', () => {
    for (const status of ['success', 'failed']) {
      for (const security_status of ['suspicious', 'blocked']) {
        expect(colorFor({ status, security_status })).toBe(MARKER_COLORS.suspicious);
      }
    }
  });

  it('keeps a mere notice in its normal colour: a new country is not suspicious', () => {
    expect(colorFor({ status: 'success', security_status: 'notice' })).toBe(MARKER_COLORS.success);
  });

  it('has the four colours that were asked for', () => {
    expect(MARKER_COLORS).toEqual({
      success: '#16a34a',
      failed: '#dc2626',
      suspicious: '#f97316',
      unknown: '#6b7280',
    });
  });
});
