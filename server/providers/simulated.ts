import type {
  BusService,
  LiveStatus,
  Location,
  StopPoint,
} from '../../src/types.js';
import type { BusProvider, RouteGeometryResult, SearchContext } from '../types.js';
import {
  haversineDistanceKm,
  interpolatePointAlongPolyline,
  projectPointOntoPolylineSegments,
} from '../utils/geo.js';
import {
  DEFAULT_TIMEZONE,
  formatMinutesToTime,
  getNowInTimezone,
  parseTimeToMinutes,
} from '../utils/time.js';

/**
 * State map to determine official Government operator name
 */
export const STATE_OPERATOR_MAP: Record<string, string[]> = {
  'tamil nadu': ['TNSTC', 'SETC'],
  karnataka: ['KSRTC', 'NWKRTC', 'KKRTC'],
  'andhra pradesh': ['APSRTC'],
  telangana: ['TGSRTC'],
  maharashtra: ['MSRTC'],
  gujarat: ['GSRTC'],
  kerala: ['Kerala RTC'],
  rajasthan: ['RSRTC'],
  'uttar pradesh': ['UPSRTC'],
  delhi: ['DTC'],
  haryana: ['Haryana Roadways'],
  punjab: ['Punjab Roadways'],
  'madhya pradesh': ['MPRTC'],
  goa: ['Kadamba'],
};

/**
 * Generic private operator descriptions (NO fake brand names like IntrCity, Zingbus, SRS, NueGo)
 */
const PRIVATE_OPERATOR_TEMPLATES = [
  'Private AC Sleeper Service',
  'Private Non-AC Seater',
  'Private Luxury Multi-Axle',
  'Private Executive Seater',
  'Private Premium Sleeper',
  'Private Intercity Express',
];

interface SlotTemplate {
  baseSlotMinutes: number; // minutes from midnight
  isGovernment: boolean;
  busType: string;
  category: 'SEATER' | 'SLEEPER' | 'SEATER_SLEEPER';
  isAc: boolean;
  isElectric: boolean;
  ratePerKm: number;
}

// Fixed daily departure grid spanning 24 hours
const DAILY_SLOTS: SlotTemplate[] = [
  { baseSlotMinutes: 5 * 60 + 30, isGovernment: true, busType: 'Ultra Deluxe Non-AC', category: 'SEATER', isAc: false, isElectric: false, ratePerKm: 1.15 },
  { baseSlotMinutes: 6 * 60 + 45, isGovernment: false, busType: 'Private Executive Seater', category: 'SEATER', isAc: true, isElectric: false, ratePerKm: 1.65 },
  { baseSlotMinutes: 8 * 60 + 0, isGovernment: true, busType: 'Classic Super Fast', category: 'SEATER', isAc: false, isElectric: false, ratePerKm: 1.05 },
  { baseSlotMinutes: 9 * 60 + 30, isGovernment: true, busType: 'Airavat AC Semi-Sleeper', category: 'SEATER_SLEEPER', isAc: true, isElectric: false, ratePerKm: 1.85 },
  { baseSlotMinutes: 11 * 60 + 0, isGovernment: false, busType: 'Private AC Seater Coach', category: 'SEATER', isAc: true, isElectric: true, ratePerKm: 1.70 },
  { baseSlotMinutes: 12 * 60 + 45, isGovernment: true, busType: 'Express Service', category: 'SEATER', isAc: false, isElectric: false, ratePerKm: 1.05 },
  { baseSlotMinutes: 14 * 60 + 15, isGovernment: false, busType: 'Private Non-AC Seater', category: 'SEATER', isAc: false, isElectric: false, ratePerKm: 1.25 },
  { baseSlotMinutes: 15 * 60 + 45, isGovernment: true, busType: 'Deluxe Point-to-Point', category: 'SEATER', isAc: false, isElectric: false, ratePerKm: 1.20 },
  { baseSlotMinutes: 17 * 60 + 15, isGovernment: false, busType: 'Private Luxury Multi-Axle', category: 'SEATER_SLEEPER', isAc: true, isElectric: false, ratePerKm: 1.95 },
  { baseSlotMinutes: 18 * 60 + 30, isGovernment: true, busType: 'Rajdhani AC Seater', category: 'SEATER', isAc: true, isElectric: false, ratePerKm: 1.75 },
  { baseSlotMinutes: 20 * 60 + 0, isGovernment: false, busType: 'Private Premium Sleeper', category: 'SLEEPER', isAc: true, isElectric: false, ratePerKm: 2.30 },
  { baseSlotMinutes: 21 * 60 + 15, isGovernment: true, busType: 'SETC Non-AC Sleeper', category: 'SLEEPER', isAc: false, isElectric: false, ratePerKm: 1.55 },
  { baseSlotMinutes: 22 * 60 + 0, isGovernment: false, busType: 'Private AC Sleeper Service', category: 'SLEEPER', isAc: true, isElectric: false, ratePerKm: 2.45 },
  { baseSlotMinutes: 22 * 60 + 45, isGovernment: true, busType: 'Night Express Service', category: 'SEATER', isAc: false, isElectric: false, ratePerKm: 1.10 },
  { baseSlotMinutes: 23 * 60 + 30, isGovernment: false, busType: 'Private Late-Night Sleeper', category: 'SLEEPER', isAc: true, isElectric: false, ratePerKm: 2.20 },
];

/**
 * Deterministic integer hash of string
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Get state-specific government operator name
 */
export function getGovernmentOperatorName(originState?: string, slotIdx = 0): string {
  const st = (originState || '').trim().toLowerCase();
  for (const [key, names] of Object.entries(STATE_OPERATOR_MAP)) {
    if (st.includes(key) || key.includes(st)) {
      return names[slotIdx % names.length];
    }
  }
  return 'State Road Transport';
}

/**
 * Builds realistic intermediate stops using real OSRM road waypoints when available,
 * else "En route (km X)". Never reuses a hard-coded stop list.
 */
export function buildIntermediateStops(
  origin: Location,
  destination: Location,
  route: RouteGeometryResult,
  departureMinutes: number,
  durationMinutes: number
): StopPoint[] {
  const stops: StopPoint[] = [];

  // Origin stop
  stops.push({
    name: origin.name,
    time: formatMinutesToTime(departureMinutes, false),
    km: 0,
    lat: origin.lat,
    lng: origin.lng,
  });

  const distKm = route.distanceKm;
  // Desired number of intermediate stops based on route length
  const stopCount = Math.max(1, Math.min(5, Math.floor(distKm / 60)));

  // Filter out any waypoint that has same coordinates or empty name
  const validWaypoints = route.waypoints.filter(
    (wp) =>
      haversineDistanceKm(wp.lat, wp.lng, origin.lat, origin.lng) > 5 &&
      haversineDistanceKm(wp.lat, wp.lng, destination.lat, destination.lng) > 5
  );

  for (let s = 1; s <= stopCount; s++) {
    const fraction = s / (stopCount + 1);
    const stopKm = Math.round(distKm * fraction);
    const stopTimeMin = departureMinutes + Math.round(durationMinutes * fraction);

    let stopName = '';
    let stopLat = 0;
    let stopLng = 0;

    if (validWaypoints.length >= s) {
      const wp = validWaypoints[s - 1];
      stopName = `${wp.name} (Toll / Highway)`;
      stopLat = wp.lat;
      stopLng = wp.lng;
    } else {
      // Use interpolated coordinate along route
      const interp = interpolatePointAlongPolyline(route.polyline, fraction);
      stopName = `En route (km ${stopKm})`;
      stopLat = interp.lat;
      stopLng = interp.lng;
    }

    stops.push({
      name: stopName,
      time: formatMinutesToTime(stopTimeMin, false),
      km: stopKm,
      lat: stopLat,
      lng: stopLng,
    });
  }

  // Destination stop
  stops.push({
    name: destination.name,
    time: formatMinutesToTime(departureMinutes + durationMinutes, true),
    km: distKm,
    lat: destination.lat,
    lng: destination.lng,
  });

  return stops;
}

export class SimulatedBusProvider implements BusProvider {
  readonly name = 'SIMULATED';

  isConfigured(): boolean {
    return true; // Always available
  }

  async search(ctx: SearchContext, route: RouteGeometryResult): Promise<BusService[]> {
    const routeKey = `${ctx.origin.name.toLowerCase()}->${ctx.destination.name.toLowerCase()}`;
    const routeHash = hashString(routeKey);

    const departAfterMin = parseTimeToMinutes(ctx.departAfterTime);
    const buses: BusService[] = [];

    const distKm = Math.max(15, route.distanceKm);
    const durationMinutes = Math.max(
      30,
      route.durationMinutes || Math.round((distKm / 48) * 60)
    );

    for (let i = 0; i < DAILY_SLOTS.length; i++) {
      const slot = DAILY_SLOTS[i];
      // Deterministic jitter for this specific route and slot (-12 to +12 minutes)
      const jitter = ((routeHash + i * 31) % 25) - 12;
      const departureMinutes = slot.baseSlotMinutes + jitter;

      // Filter: must be at or after the requested departure time for the date
      if (departureMinutes < departAfterMin) {
        continue;
      }

      const arrivalMinutes = departureMinutes + durationMinutes;

      // Operator Name
      let operatorName = '';
      if (slot.isGovernment) {
        operatorName = getGovernmentOperatorName(ctx.origin.state, i);
      } else {
        const privIdx = (routeHash + i) % PRIVATE_OPERATOR_TEMPLATES.length;
        operatorName = PRIVATE_OPERATOR_TEMPLATES[privIdx];
      }

      // Estimated Fare
      const baseFare = Math.max(45, Math.round(distKm * slot.ratePerKm));
      // Round to nearest 5 or 10 rupees for realistic Indian bus pricing
      const roundedFare = Math.round(baseFare / 5) * 5;
      const fareEstimate = `~₹${roundedFare}`;

      // Deterministic Service Number
      const prefix = slot.isGovernment ? operatorName.split(' ')[0] : 'PVT';
      const numCode = 1000 + ((routeHash + i * 19) % 9000);
      const serviceNumber = `${prefix}-${numCode}`;

      // Intermediate stops
      const stops = buildIntermediateStops(
        ctx.origin,
        ctx.destination,
        route,
        departureMinutes,
        durationMinutes
      );

      const busId = `sim-${ctx.origin.id}-${ctx.destination.id}-${i}-${departureMinutes}`;

      const totalSeats = slot.category === 'SLEEPER' ? 36 : 48;
      // Deterministic available seats
      const availableSeats = 4 + ((routeHash + i * 7) % (totalSeats - 6));

      buses.push({
        id: busId,
        serviceNumber,
        operatorName,
        operatorType: slot.isGovernment ? 'GOVERNMENT' : 'PRIVATE',
        busType: slot.busType,
        category: slot.category,
        isAc: slot.isAc,
        isElectric: slot.isElectric,
        departureTime: formatMinutesToTime(departureMinutes, false),
        arrivalTime: formatMinutesToTime(arrivalMinutes, true),
        durationMinutes,
        fareEstimate,
        stopsCount: stops.length,
        stops,
        dataSource: 'SIMULATED',
        bookable: true, // Allows demo booking
        totalSeats,
        availableSeats,
      });
    }

    return buses;
  }

  async getLiveStatus(
    bus: BusService,
    polyline: [number, number][]
  ): Promise<LiveStatus | null> {
    const now = getNowInTimezone(DEFAULT_TIMEZONE);
    const depMin = parseTimeToMinutes(bus.departureTime);
    const arrMin = depMin + bus.durationMinutes;

    let progress = 0;
    if (now.minutesFromMidnight >= arrMin) {
      progress = 1.0;
    } else if (now.minutesFromMidnight <= depMin) {
      progress = 0.0;
    } else {
      progress = (now.minutesFromMidnight - depMin) / (arrMin - depMin);
    }
    progress = Math.max(0, Math.min(1, progress));

    // Interpolate raw position along polyline
    const rawPos = interpolatePointAlongPolyline(polyline, progress);
    // Project onto polyline segments to ensure exact placement
    const proj = projectPointOntoPolylineSegments([rawPos.lat, rawPos.lng], polyline);

    // Find next stop
    let nextStop = bus.stops[bus.stops.length - 1]?.name || 'Destination';
    let etaNextStop = bus.arrivalTime;

    for (const stop of bus.stops) {
      const stopMin = parseTimeToMinutes(stop.time);
      if (stopMin > now.minutesFromMidnight) {
        nextStop = stop.name;
        etaNextStop = stop.time;
        break;
      }
    }

    return {
      busId: bus.id,
      serviceNumber: bus.serviceNumber,
      currentPosition: {
        lat: proj.point[0],
        lng: proj.point[1],
      },
      heading: 0,
      speedKmph: progress > 0 && progress < 1 ? 55 : 0,
      isGpsLive: false, // Simulated estimate is NEVER presented as live GPS!
      statusLabel: 'Estimated position',
      statusDescription: 'Estimated from timetable, not live GPS',
      lastUpdatedIso: new Date().toISOString(),
      nextStop,
      etaNextStop,
      progressPercent: Math.round(progress * 100),
      dataSource: 'SIMULATED',
    };
  }
}
