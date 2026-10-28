import type { RouteGeometryResult } from '../types.js';
import { haversineDistanceKm } from '../utils/geo.js';

interface CachedRoute {
  data: RouteGeometryResult;
  timestamp: number;
}

const ROUTE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const routeCache = new Map<string, CachedRoute>();

const DEFAULT_OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';
const APP_CONTACT = process.env.APP_CONTACT || 'contact@smartbustracker.local';

/**
 * Fetches highway driving route from OSRM or builds straight-line fallback.
 * Strictly adheres to rule: do NOT cache the straight-line fallback.
 */
export async function getRouteGeometry(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<RouteGeometryResult> {
  const cacheKey = `${originLat.toFixed(4)},${originLng.toFixed(4)}->${destLat.toFixed(4)},${destLng.toFixed(4)}`;
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ROUTE_CACHE_TTL_MS) {
    return cached.data;
  }

  const osrmBase = (process.env.OSRM_URL || DEFAULT_OSRM_URL).replace(/\/$/, '');
  const url = `${osrmBase}/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      headers: {
        'User-Agent': `SmartBusTracker/2.0 (contact: ${APP_CONTACT})`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates: [number, number][] = (route.geometry.coordinates as [number, number][]).map(
          ([lng, lat]) => [lat, lng]
        );
        const distanceKm = Math.max(1, Math.round((route.distance || 0) / 1000));
        const durationMinutes = Math.max(5, Math.round((route.duration || 0) / 60));

        // Extract road names from route steps
        const waypoints: { name: string; lat: number; lng: number }[] = [];
        const seenNames = new Set<string>();

        if (route.legs && route.legs[0] && Array.isArray(route.legs[0].steps)) {
          for (const step of route.legs[0].steps) {
            const rawName = (step.name || step.ref || '').trim();
            // Filter out empty names or generic phrases
            if (rawName && rawName.length > 2 && !seenNames.has(rawName.toLowerCase())) {
              seenNames.add(rawName.toLowerCase());
              const stepLoc = step.maneuver?.location;
              if (Array.isArray(stepLoc) && stepLoc.length >= 2) {
                waypoints.push({
                  name: rawName,
                  lat: stepLoc[1],
                  lng: stepLoc[0],
                });
              }
            }
          }
        }

        const result: RouteGeometryResult = {
          polyline: coordinates,
          distanceKm,
          durationMinutes,
          waypoints,
          isFallback: false,
        };

        // Cache real route
        routeCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
    }
  } catch {
    // Ignore network error and proceed to fallback
  }

  // Straight line fallback with intermediate points (DO NOT CACHE)
  return createStraightLineRoute(originLat, originLng, destLat, destLng);
}

function createStraightLineRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): RouteGeometryResult {
  const distanceKm = Math.max(
    1,
    Math.round(haversineDistanceKm(originLat, originLng, destLat, destLng))
  );
  // Assume ~50 km/h average speed
  const durationMinutes = Math.max(15, Math.round((distanceKm / 50) * 60));

  const pointsCount = Math.max(10, Math.min(50, Math.round(distanceKm / 10)));
  const polyline: [number, number][] = [];

  for (let i = 0; i <= pointsCount; i++) {
    const frac = i / pointsCount;
    // Slight curvature to look realistic
    const lat = originLat + (destLat - originLat) * frac;
    const lng = originLng + (destLng - originLng) * frac;
    polyline.push([lat, lng]);
  }

  return {
    polyline,
    distanceKm,
    durationMinutes,
    waypoints: [],
    isFallback: true, // Note: not cached
  };
}
