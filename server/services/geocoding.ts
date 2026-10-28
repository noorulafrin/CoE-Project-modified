import type { Location } from '../types.js';

interface CachedGeocode {
  results: Location[];
  timestamp: number;
}

const geocodeCache = new Map<string, CachedGeocode>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const APP_CONTACT = process.env.APP_CONTACT || 'contact@smartbustracker.local';

/**
 * Curated list of popular bus terminals and cities across Indian states.
 * ID typos fixed (e.g. 'tn-ambur'). IDs are deterministic slugs.
 */
export const POPULAR_LOCATIONS: Location[] = [
  { id: 'tn-chennai', name: 'Chennai (Koyambedu CMBT)', state: 'Tamil Nadu', lat: 13.0694, lng: 80.2057 },
  { id: 'tn-vellore', name: 'Vellore (New Bus Stand)', state: 'Tamil Nadu', lat: 12.9296, lng: 79.1362 },
  { id: 'tn-ambur', name: 'Ambur (Bus Stand)', state: 'Tamil Nadu', lat: 12.7904, lng: 78.7166 },
  { id: 'tn-coimbatore', name: 'Coimbatore (Gandhipuram)', state: 'Tamil Nadu', lat: 11.0183, lng: 76.9644 },
  { id: 'tn-madurai', name: 'Madurai (Mattuthavani MIBT)', state: 'Tamil Nadu', lat: 9.9463, lng: 78.1568 },
  { id: 'tn-salem', name: 'Salem (New Bus Stand)', state: 'Tamil Nadu', lat: 11.6643, lng: 78.1460 },
  { id: 'tn-trichy', name: 'Tiruchirappalli (Central Bus Stand)', state: 'Tamil Nadu', lat: 10.7905, lng: 78.6884 },
  { id: 'ka-bengaluru', name: 'Bengaluru (Majestic KBS)', state: 'Karnataka', lat: 12.9774, lng: 77.5729 },
  { id: 'ka-mysuru', name: 'Mysuru (Suburban Bus Stand)', state: 'Karnataka', lat: 12.3106, lng: 76.6578 },
  { id: 'ka-hubballi', name: 'Hubballi (CBT)', state: 'Karnataka', lat: 15.3647, lng: 75.1240 },
  { id: 'ap-tirupati', name: 'Tirupati (Central Bus Stand)', state: 'Andhra Pradesh', lat: 13.6288, lng: 79.4192 },
  { id: 'ap-vijayawada', name: 'Vijayawada (PNBS)', state: 'Andhra Pradesh', lat: 16.5131, lng: 80.6175 },
  { id: 'ap-visakhapatnam', name: 'Visakhapatnam (Dwaraka RTC Complex)', state: 'Andhra Pradesh', lat: 17.7294, lng: 83.3082 },
  { id: 'tg-hyderabad', name: 'Hyderabad (MGBS)', state: 'Telangana', lat: 17.3789, lng: 78.4807 },
  { id: 'mh-mumbai', name: 'Mumbai (Dadar Asiad)', state: 'Maharashtra', lat: 19.0178, lng: 72.8478 },
  { id: 'mh-pune', name: 'Pune (Shivaji Nagar Bus Stand)', state: 'Maharashtra', lat: 18.5314, lng: 73.8446 },
  { id: 'gj-ahmedabad', name: 'Ahmedabad (Geeta Mandir)', state: 'Gujarat', lat: 23.0125, lng: 72.5894 },
  { id: 'rj-jaipur', name: 'Jaipur (Sindhi Camp)', state: 'Rajasthan', lat: 26.9239, lng: 75.8000 },
  { id: 'dl-delhi', name: 'Delhi (Kashmere Gate ISBT)', state: 'Delhi', lat: 28.6675, lng: 77.2285 },
  { id: 'up-lucknow', name: 'Lucknow (Alambagh Bus Terminal)', state: 'Uttar Pradesh', lat: 26.8155, lng: 80.9015 },
  { id: 'kl-thiruvananthapuram', name: 'Thiruvananthapuram (Thampanoor)', state: 'Kerala', lat: 8.4882, lng: 76.9536 },
  { id: 'kl-kochi', name: 'Kochi (Vyttila Mobility Hub)', state: 'Kerala', lat: 9.9678, lng: 76.3204 },
];

/**
 * Creates a deterministic location ID from name and state (no Math.random()).
 */
export function generateDeterministicLocationId(name: string, state?: string): string {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const cleanState = (state || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return cleanState ? `loc-${cleanState}-${cleanName}` : `loc-${cleanName}`;
}

// Nominatim 1 request per second queue
let lastNominatimRequestTime = 0;

async function waitForNominatimSlot(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastNominatimRequestTime;
  if (timeSinceLast < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - timeSinceLast));
  }
  lastNominatimRequestTime = Date.now();
}

/**
 * Search locations using curated database first, with Nominatim fallback.
 */
export async function searchLocations(query: string): Promise<Location[]> {
  const q = query.trim().toLowerCase();
  if (!q) return POPULAR_LOCATIONS.slice(0, 8);

  const cached = geocodeCache.get(q);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.results;
  }

  // 1. Curated match
  const localMatches = POPULAR_LOCATIONS.filter(
    (loc) =>
      loc.name.toLowerCase().includes(q) ||
      (loc.state && loc.state.toLowerCase().includes(q)) ||
      loc.id.toLowerCase().includes(q)
  );

  if (localMatches.length >= 3) {
    geocodeCache.set(q, { results: localMatches, timestamp: Date.now() });
    return localMatches;
  }

  // 2. Query Nominatim with throttle
  const results: Location[] = [...localMatches];
  try {
    await waitForNominatimSlot();
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&countrycodes=in&limit=5&addressdetails=1`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': `SmartBusTracker/2.0 (contact: ${APP_CONTACT})`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as Array<{
        display_name: string;
        lat: string;
        lon: string;
        address?: {
          state?: string;
          city?: string;
          town?: string;
          village?: string;
          suburb?: string;
        };
      }>;

      for (const item of data) {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        const state = item.address?.state || '';
        const shortName =
          item.address?.city ||
          item.address?.town ||
          item.address?.suburb ||
          item.address?.village ||
          item.display_name.split(',')[0].trim();

        // Avoid close duplicates
        const isDuplicate = results.some(
          (r) => Math.hypot(r.lat - lat, r.lng - lng) < 0.05
        );

        if (!isDuplicate) {
          results.push({
            id: generateDeterministicLocationId(shortName, state),
            name: `${shortName}${state ? ` (${state})` : ''}`,
            state,
            lat,
            lng,
          });
        }
      }
    }
  } catch {
    // If Nominatim fails, continue with local matches
  }

  geocodeCache.set(q, { results, timestamp: Date.now() });
  return results;
}
