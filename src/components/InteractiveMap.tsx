import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Location, StopPoint } from '../types.js';

interface InteractiveMapProps {
  routePolyline?: [number, number][];
  origin?: Location;
  destination?: Location;
  stops?: StopPoint[];
  busPosition?: { lat: number; lng: number };
  busHeading?: number;
  busLabel?: string;
  isGpsLive?: boolean;
  className?: string;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  routePolyline,
  origin,
  destination,
  stops,
  busPosition,
  busHeading = 0,
  busLabel,
  isGpsLive = false,
  className = 'w-full h-80 rounded-xl overflow-hidden',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const initialCenter: [number, number] = origin
      ? [origin.lat, origin.lng]
      : [12.9716, 77.5946];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 8,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = layerGroup;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Update map layers when props change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const bounds = L.latLngBounds([]);

    // 1. Draw Route Polyline
    if (routePolyline && routePolyline.length > 0) {
      const line = L.polyline(routePolyline, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.8,
        lineCap: 'round',
        lineJoin: 'round',
      });
      line.addTo(layerGroup);
      for (const pt of routePolyline) {
        bounds.extend(pt);
      }
    }

    // Custom Icon Creators
    const createOriginIcon = () =>
      L.divIcon({
        className: 'custom-map-icon',
        html: `<div class="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-xs shadow-md border-2 border-white ring-2 ring-emerald-300">A</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

    const createDestIcon = () =>
      L.divIcon({
        className: 'custom-map-icon',
        html: `<div class="w-6 h-6 bg-rose-600 text-white rounded-full flex items-center justify-center font-bold text-xs shadow-md border-2 border-white ring-2 ring-rose-300">B</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

    const createStopIcon = () =>
      L.divIcon({
        className: 'custom-map-icon',
        html: `<div class="w-3.5 h-3.5 bg-slate-600 rounded-full border-2 border-white shadow-sm ring-1 ring-slate-400"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

    const createBusIcon = () => {
      const ringColor = isGpsLive ? 'ring-emerald-400 bg-emerald-700' : 'ring-amber-400 bg-amber-600';
      return L.divIcon({
        className: 'custom-map-bus-icon',
        html: `
          <div class="relative flex items-center justify-center">
            <span class="absolute inline-flex h-8 w-8 rounded-full ${isGpsLive ? 'bg-emerald-400 animate-ping opacity-40' : 'bg-amber-400 opacity-20'}"></span>
            <div class="w-8 h-8 ${ringColor} text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white ring-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 6v6"/>
                <path d="M15 6v6"/>
                <path d="M2 12h19.6"/>
                <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.7 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>
                <circle cx="7" cy="18" r="2"/>
                <circle cx="17" cy="18" r="2"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
    };

    // 2. Add Origin Marker
    if (origin) {
      const marker = L.marker([origin.lat, origin.lng], { icon: createOriginIcon() });
      marker.bindPopup(`<strong>Origin:</strong> ${origin.name}`);
      marker.addTo(layerGroup);
      bounds.extend([origin.lat, origin.lng]);
    }

    // 3. Add Destination Marker
    if (destination) {
      const marker = L.marker([destination.lat, destination.lng], { icon: createDestIcon() });
      marker.bindPopup(`<strong>Destination:</strong> ${destination.name}`);
      marker.addTo(layerGroup);
      bounds.extend([destination.lat, destination.lng]);
    }

    // 4. Add intermediate stops
    if (stops && stops.length > 2) {
      // Exclude first and last which are origin and destination
      for (let i = 1; i < stops.length - 1; i++) {
        const s = stops[i];
        if (s.lat && s.lng) {
          const marker = L.marker([s.lat, s.lng], { icon: createStopIcon() });
          marker.bindPopup(`<strong>Stop:</strong> ${s.name}<br/>Scheduled: ${s.time}`);
          marker.addTo(layerGroup);
        }
      }
    }

    // 5. Add Bus Marker
    if (busPosition && !isNaN(busPosition.lat) && !isNaN(busPosition.lng)) {
      const busMarker = L.marker([busPosition.lat, busPosition.lng], {
        icon: createBusIcon(),
        zIndexOffset: 1000,
      });
      busMarker.bindPopup(
        `<strong>${busLabel || 'Bus Position'}</strong><br/>${isGpsLive ? 'Status: Real-time GPS Fix' : 'Status: Timetable Estimated Position'}`
      );
      busMarker.addTo(layerGroup);
      bounds.extend([busPosition.lat, busPosition.lng]);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [routePolyline, origin, destination, stops, busPosition, busHeading, busLabel, isGpsLive]);

  return (
    <div className={`relative border border-slate-200 bg-slate-100 ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
};
