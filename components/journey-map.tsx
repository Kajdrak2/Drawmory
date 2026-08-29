'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useLanguage } from './language-provider';

type LocatedDrawing = {
  id: string;
  stepIndex: number;
  countryCode: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  locationPrecision: 'NONE' | 'COUNTRY' | 'PRECISE';
};

function labelForDrawing(drawing: LocatedDrawing, fallback: string) {
  const parts = [drawing.city, drawing.countryCode === 'UNKNOWN' ? null : drawing.countryCode].filter(Boolean);
  return parts.join(', ') || fallback;
}

export function JourneyMap({ drawings }: { drawings: LocatedDrawing[] }) {
  const { t } = useLanguage();
  const mapElementRef = useRef<HTMLDivElement>(null);
  const located = useMemo(
    () => drawings.filter((drawing) => drawing.latitude != null && drawing.longitude != null),
    [drawings],
  );

  useEffect(() => {
    const element = mapElementRef.current;
    if (!element || located.length === 0) return;
    let cancelled = false;
    let cleanup: () => void = () => undefined;

    void import('leaflet').then((module) => {
      if (cancelled || !mapElementRef.current) return;
      const L = module.default;
      const map = L.map(mapElementRef.current, {
        scrollWheelZoom: false,
        worldCopyJump: true,
        zoomControl: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const points = located.map((drawing) => [drawing.latitude!, drawing.longitude!] as [number, number]);
      if (points.length > 1) {
        L.polyline(points, { color: '#7656d6', weight: 4, opacity: 0.82, dashArray: '7 8' }).addTo(map);
        map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 6 });
      } else {
        map.setView(points[0], 3);
      }

      located.forEach((drawing, index) => {
        const marker = L.circleMarker(points[index], {
          radius: index === 0 ? 9 : 7,
          color: '#1d1830',
          weight: 2,
          fillColor: index === 0 ? '#ff6b55' : '#ffd54a',
          fillOpacity: 1,
        }).addTo(map);
        const label = document.createElement('span');
        label.textContent = `${drawing.stepIndex + 1}. ${labelForDrawing(drawing, t('notSpecified'))}`;
        marker.bindTooltip(label, { direction: 'top' });
      });
      cleanup = () => map.remove();
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [located, t]);

  const routeList = (
    <ol className="route-list">
        {drawings.map((drawing, index) => {
          const previous = drawings[index - 1];
          const sameAsPrevious = Boolean(
            previous &&
              drawing.latitude === previous.latitude &&
              drawing.longitude === previous.longitude &&
              drawing.countryCode === previous.countryCode &&
              drawing.city === previous.city,
          );
          return (
            <li key={drawing.id} data-testid="journey-map-point">
              <span>{String(drawing.stepIndex + 1).padStart(2, '0')}</span>
              <div>
                <strong>{labelForDrawing(drawing, t('notSpecified'))}</strong>
                {sameAsPrevious ? <small>{t('sameLocation')}</small> : null}
                {!sameAsPrevious && drawing.locationPrecision === 'COUNTRY' ? (
                  <small>{t('approximateLocation')}</small>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
  );

  if (located.length === 0) {
    const hasNamedLocation = drawings.some(
      (drawing) => drawing.city || drawing.countryCode !== 'UNKNOWN',
    );
    return (
      <div className="journey-map-layout journey-map-without-canvas">
        <p className="map-empty">{t('noLocationJourney')}</p>
        {hasNamedLocation ? routeList : null}
      </div>
    );
  }

  return (
    <div className="journey-map-layout">
      <div className="journey-map-canvas" ref={mapElementRef} aria-label={t('journeyMap')} />
      {routeList}
    </div>
  );
}
