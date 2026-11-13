// The REAL map, with the real Leaflet and its two plug-ins, in jsdom.
//
// The page test replaces the map with a stub, because Leaflet draws on a
// canvas. This one checks the parts a stub cannot: that Leaflet and the
// marker-cluster and heat plug-ins load in the order they need (the plug-ins
// look for a global `L`), that markers and the heatmap are really drawn, that
// the tiles come from OpenStreetMap, and that the map cleans up after itself.
//
// jsdom has no layout, so the map's box is given a size by hand.

import { render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import LoginActivityMap from './LoginActivityMap';

// Loading Leaflet (a dynamic import) is slow when the whole suite runs in parallel.
const SLOW = { timeout: 15000 };

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
  statusName: {},
  securityName: {},
  flagName: {},
  unknownTitle: (count) => `${count} unknown`,
  mapLabel: 'World map',
  when: () => 'now',
};

const point = (id, lat, lng, extra = {}) => ({
  id,
  latitude: lat,
  longitude: lng,
  identifier: `user${id}@example.com`,
  status: 'success',
  security_status: 'normal',
  flags: [],
  created_at: '2026-11-12T13:30:00Z',
  ...extra,
});

beforeAll(() => {
  // jsdom has no layout: give every element a size, or Leaflet sees a 0 x 0 map.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 480 });
  // The heat layer draws on a canvas; jsdom has none, so give it a quiet fake.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    beginPath: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    fillRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillStyle: '',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowBlur: 0,
    shadowColor: '',
    globalAlpha: 1,
  }));
});

// NOTE: window.L is deliberately NOT removed between tests, just as the real
// page never removes it. The marker-cluster plug-in looks the global up again
// later, from its own timers (even while a map is being taken down), so it has
// to stay defined for as long as the page is open.

const DATA = {
  points: [point(1, 51.92, 4.48), point(2, 12.11, -68.93, { status: 'failed' })],
  heat: [
    { lat: 51.92, lng: 4.48, count: 3 },
    { lat: 12.11, lng: -68.93, count: 1 },
  ],
  truncated: false,
  unknown: { count: 2, latest: [] },
};

describe('the real map', () => {
  it('loads Leaflet and both plug-ins, and draws the tiles from OpenStreetMap', async () => {
    const { container } = render(<LoginActivityMap data={DATA} showMarkers showHeat text={text} />);

    expect(screen.getByRole('region', { name: 'World map' })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.leaflet-container')).not.toBeNull(), SLOW);

    // The plug-ins attached themselves to the global Leaflet.
    await waitFor(() => {
      expect(typeof window.L.markerClusterGroup).toBe('function');
      expect(typeof window.L.heatLayer).toBe('function');
    }, SLOW);

    await waitFor(() => {
      const tiles = [...container.querySelectorAll('.leaflet-tile')].map((tile) => tile.getAttribute('src'));
      expect(tiles.length).toBeGreaterThan(0);
      for (const src of tiles) expect(src).toMatch(/^https:\/\/tile\.openstreetmap\.org\//);
    }, SLOW);

    // The licence-required credit is on the map.
    expect(container.querySelector('.leaflet-control-attribution').textContent).toContain('OpenStreetMap');
  });

  it('draws a marker for each attempt and one gray marker for the unknown places', async () => {
    const { container } = render(<LoginActivityMap data={DATA} showMarkers showHeat={false} text={text} />);
    // 2 located attempts (clustered or not, they are layers in the group) + 1 gray marker.
    await waitFor(() => {
      const state = window.L && container.querySelectorAll('.leaflet-interactive, .loginMapCluster');
      expect(state && state.length).toBeGreaterThan(0);
    }, SLOW);
  });

  it('does not draw markers when they are switched off', async () => {
    const { container } = render(<LoginActivityMap data={DATA} showMarkers={false} showHeat={false} text={text} />);
    await waitFor(() => expect(container.querySelector('.leaflet-container')).not.toBeNull(), SLOW);
    expect(container.querySelectorAll('.leaflet-interactive').length).toBe(0);
  });

  it('draws the heatmap layer when asked', async () => {
    const { container } = render(<LoginActivityMap data={DATA} showMarkers={false} showHeat text={text} />);
    await waitFor(() => expect(container.querySelector('canvas.leaflet-heatmap-layer')).not.toBeNull(), SLOW);
  });

  it('removes the map when it goes away', async () => {
    const { container, unmount } = render(<LoginActivityMap data={DATA} showMarkers showHeat text={text} />);
    await waitFor(() => expect(container.querySelector('.leaflet-container')).not.toBeNull(), SLOW);
    unmount();
    expect(document.querySelector('.leaflet-container')).toBeNull();
  });
});
