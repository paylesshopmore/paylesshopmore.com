// src/pages/Dashboard/LoginActivityMap.jsx
//
// The world map on Dashboard -> Login activity.
//
// WHAT IT DRAWS
//   markers   one circle per sign-in attempt, grouped into numbered clusters
//             when they are close together (zoom in to split them up):
//               green   a successful sign-in
//               red     a failed attempt
//               orange  suspicious (crossed a security threshold, or came from
//                       a blocked address) - wins over green and red
//               gray    the place is unknown (a private address, or the lookup
//                       failed). There is no spot on the map for these, so ONE
//                       gray marker sits in the middle of the Atlantic and says
//                       how many there are.
//   heatmap   where most attempts come from (warmer = more attempts)
//
// WHERE THE PLACE COMES FROM
//   Only from the IP address (backend loginactivity/geo.py): approximate, city
//   level. Nothing here asks the browser for GPS or a precise position.
//
// HOW IT IS BUILT
//   Leaflet, with two plug-ins (marker clusters and the heat layer) and the
//   OpenStreetMap tiles. Leaflet is plain JavaScript that draws into a <div>,
//   not a React library, so this component:
//     1. creates the map once, in an effect, when it appears;
//     2. redraws the markers and the heat layer whenever `data` changes;
//     3. removes the map when it disappears.
//   Leaflet and its plug-ins are loaded only when this page opens (dynamic
//   import), so the rest of the dashboard does not carry their weight.
//
// POPUPS ARE BUILT WITH TEXT NODES, NOT HTML STRINGS
//   The "username" of a failed attempt is whatever a stranger typed into the
//   sign-in form. Put into HTML it could run a script in an administrator's
//   browser. textContent can never do that, so every popup line is set with it.

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import styles from './Dashboard.module.css';
import { colorFor, MARKER_COLORS } from './loginMapColors';
import { popupFor, unknownPopup } from './loginMapPopup';

// Where the single "unknown location" marker sits: the Atlantic Ocean off
// West Africa, where there is no land to mislead anybody.
const UNKNOWN_SPOT = [0, -25];

/**
 * @param {object} props
 * @param {object|null} props.data     the answer of getLoginMap(), or null
 * @param {boolean} props.showMarkers  draw the markers
 * @param {boolean} props.showHeat     draw the heatmap
 * @param {object} props.text          labels for the popups (see popupFor)
 * @param {(message: string) => void} [props.onError]
 */
export default function LoginActivityMap({ data, showMarkers, showHeat, text, onError }) {
  const boxRef = useRef(null);
  // Everything Leaflet: the library, the map and our two layers.
  const mapRef = useRef({ L: null, map: null, markers: null, heat: null, unknown: null, fitted: false });
  // Becomes true once the map exists, so the drawing effect below knows it
  // can start. (A state, not just the ref, because it must cause a redraw.)
  const [ready, setReady] = useState(false);

  // 1. Create the map once, and take it down again when we leave.
  useEffect(() => {
    let cancelled = false;
    const state = mapRef.current;

    (async () => {
      try {
        const L = (await import('leaflet')).default;
        // The plug-ins add themselves to a global called L, so it must exist
        // before they are loaded. It is left in place afterwards on purpose:
        // the marker-cluster plug-in looks it up again from its own timers,
        // even while a map is being taken down, so removing it would make
        // those throw.
        window.L = L;
        await import('leaflet.markercluster');
        await import('leaflet.heat');
        if (cancelled || !boxRef.current) return;

        const map = L.map(boxRef.current, { worldCopyJump: true, minZoom: 2, zoomControl: true }).setView(
          [20, 0],
          2,
        );
        // OpenStreetMap's own tile server. The attribution is required by
        // their licence and must stay visible.
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        state.L = L;
        state.map = map;
        setReady(true);
      } catch {
        if (!cancelled) onError?.('map');
      }
    })();

    return () => {
      cancelled = true;
      if (state.map) state.map.remove();
      Object.assign(state, { L: null, map: null, markers: null, heat: null, unknown: null, fitted: false });
    };
    // Created once: the props it needs later are read in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Draw what the server sent. Runs again whenever the data, the toggles
  //    or the words change.
  useEffect(() => {
    const state = mapRef.current;
    const { L, map } = state;
    if (!ready || !L || !map || !data) return;

    // Clear the previous drawing.
    for (const key of ['markers', 'heat', 'unknown']) {
      if (state[key]) map.removeLayer(state[key]);
      state[key] = null;
    }

    // Markers, grouped into clusters.
    if (showMarkers) {
      const group = L.markerClusterGroup({
        maxClusterRadius: 45,
        chunkedLoading: true,
        // Neutral blue clusters: green / red / orange already mean something.
        iconCreateFunction: (cluster) =>
          L.divIcon({
            html: `<div><span>${cluster.getChildCount()}</span></div>`,
            className: 'marker-cluster loginMapCluster',
            iconSize: L.point(40, 40),
          }),
      });
      for (const row of data.points) {
        const color = colorFor(row);
        const marker = L.circleMarker([row.latitude, row.longitude], {
          radius: 8,
          weight: 2,
          color: '#ffffff',
          fillColor: color,
          fillOpacity: 0.95,
        });
        marker.bindPopup(() => popupFor(row, text), { maxWidth: 300 });
        group.addLayer(marker);
      }
      group.addTo(map);
      state.markers = group;

      // Attempts with no place: one gray marker, with the count.
      if (data.unknown?.count > 0) {
        const gray = L.circleMarker(UNKNOWN_SPOT, {
          radius: 11,
          weight: 2,
          color: '#ffffff',
          fillColor: MARKER_COLORS.unknown,
          fillOpacity: 0.95,
        });
        gray.bindPopup(() => unknownPopup(data.unknown, text), { maxWidth: 320 });
        gray.bindTooltip(text.unknownTitle(data.unknown.count));
        gray.addTo(map);
        state.unknown = gray;
      }
    }

    // Heatmap: each spot counts as many times as it has attempts.
    if (showHeat && data.heat.length > 0) {
      const busiest = Math.max(...data.heat.map((spot) => spot.count));
      state.heat = L.heatLayer(
        data.heat.map((spot) => [spot.lat, spot.lng, spot.count / busiest]),
        { radius: 28, blur: 20, maxZoom: 8, minOpacity: 0.35 },
      ).addTo(map);
    }

    // Frame the data once, the first time there is some. Not on every
    // refresh: that would pull the map away from where somebody is looking.
    if (!state.fitted && data.points.length > 0) {
      map.fitBounds(L.latLngBounds(data.points.map((row) => [row.latitude, row.longitude])), {
        padding: [40, 40],
        maxZoom: 6,
      });
      state.fitted = true;
    }
  }, [ready, data, showMarkers, showHeat, text]);

  return (
    <div
      ref={boxRef}
      className={styles.loginMap}
      role="region"
      aria-label={text.mapLabel}
      data-testid="login-map"
    />
  );
}
