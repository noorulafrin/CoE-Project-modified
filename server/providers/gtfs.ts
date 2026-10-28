import fs from 'fs';
import path from 'path';
import readline from 'readline';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import type { BusService, LiveStatus, Location, StopPoint } from '../../src/types.js';
import type { BusProvider, RouteGeometryResult, SearchContext } from '../types.js';
import {
  haversineDistanceKm,
  interpolatePointAlongPolyline,
  projectPointOntoPolylineSegments,
} from '../utils/geo.js';
import {
  DEFAULT_TIMEZONE,
  formatMinutesToTime,
  formatToGtfsDate,
  getDayOfWeekForDate,
  getNowInTimezone,
  parseTimeToMinutes,
} from '../utils/time.js';

/**
 * Robust CSV Line Parser supporting RFC 4180 quotes, escaped quotes (""), and BOM removal
 */
export function parseCsvLine(line: string): string[] {
  let clean = line;
  if (clean.charCodeAt(0) === 0xfeff) {
    clean = clean.slice(1);
  }
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (char === '"') {
      if (inQuotes && clean[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Stream-reads a CSV file line by line
 */
export async function readCsvFile(
  filePath: string,
  onRow: (row: Record<string, string>) => void
): Promise<void> {
  if (!fs.existsSync(filePath)) return;
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let headers: string[] | null = null;

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    if (!headers) {
      headers = parseCsvLine(line).map((h) => h.replace(/^["']|["']$/g, '').trim());
      continue;
    }

    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i] !== undefined ? values[i] : '';
    }
    onRow(row);
  }
}

interface GtfsAgency {
  id: string;
  name: string;
  url?: string;
}

interface GtfsStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface GtfsRoute {
  id: string;
  agencyId: string;
  shortName: string;
  longName: string;
  type: number;
}

interface GtfsTrip {
  id: string;
  routeId: string;
  serviceId: string;
  headsign: string;
  directionId?: number;
}

interface GtfsStopTime {
  tripId: string;
  stopId: string;
  sequence: number;
  arrivalTimeMin: number;
  departureTimeMin: number;
}

interface GtfsCalendar {
  serviceId: string;
  days: boolean[]; // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD
}

interface GtfsCalendarDate {
  serviceId: string;
  date: string; // YYYYMMDD
  exceptionType: number; // 1 = added, 2 = removed
}

interface GtfsRtVehiclePosition {
  tripId?: string;
  vehicleId?: string;
  lat: number;
  lng: number;
  bearing?: number;
  speedMps?: number;
  timestampSeconds: number;
}

export class GtfsBusProvider implements BusProvider {
  readonly name = 'GTFS';

  private gtfsDir: string;
  private stopRadiusKm: number;
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;

  // Cached in-memory GTFS tables
  private agencies = new Map<string, GtfsAgency>();
  private stops = new Map<string, GtfsStop>();
  private routes = new Map<string, GtfsRoute>();
  private trips = new Map<string, GtfsTrip>();
  // tripId -> sorted stop times
  private tripStopTimes = new Map<string, GtfsStopTime[]>();
  private calendars = new Map<string, GtfsCalendar>();
  // key: `${serviceId}:${date}` -> exceptionType
  private calendarExceptions = new Map<string, number>();

  // GTFS-RT cache
  private rtCacheTimestamp = 0;
  private rtPositions: GtfsRtVehiclePosition[] = [];

  constructor(
    gtfsDir = process.env.GTFS_DIR || '',
    stopRadiusKm = parseFloat(process.env.GTFS_STOP_RADIUS_KM || '3')
  ) {
    this.gtfsDir = gtfsDir.trim();
    this.stopRadiusKm = isNaN(stopRadiusKm) ? 3 : stopRadiusKm;
  }

  isConfigured(): boolean {
    return !!this.gtfsDir && fs.existsSync(this.gtfsDir);
  }

  /**
   * Loads and indexes GTFS static files
   */
  async ensureLoaded(): Promise<void> {
    if (this.isLoaded) return;
    if (!this.isConfigured()) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loadGtfsData();
    await this.loadPromise;
    this.isLoaded = true;
  }

  private async loadGtfsData(): Promise<void> {
    const dir = this.gtfsDir;

    // 1. agency.txt
    await readCsvFile(path.join(dir, 'agency.txt'), (row) => {
      const id = row.agency_id || 'default';
      this.agencies.set(id, {
        id,
        name: row.agency_name || 'Transit Agency',
        url: row.agency_url,
      });
    });

    // 2. stops.txt
    await readCsvFile(path.join(dir, 'stops.txt'), (row) => {
      const id = row.stop_id;
      const lat = parseFloat(row.stop_lat);
      const lng = parseFloat(row.stop_lon);
      if (id && !isNaN(lat) && !isNaN(lng)) {
        this.stops.set(id, {
          id,
          name: row.stop_name || id,
          lat,
          lng,
        });
      }
    });

    // 3. routes.txt
    await readCsvFile(path.join(dir, 'routes.txt'), (row) => {
      const id = row.route_id;
      if (id) {
        this.routes.set(id, {
          id,
          agencyId: row.agency_id || 'default',
          shortName: row.route_short_name || '',
          longName: row.route_long_name || '',
          type: parseInt(row.route_type || '3', 10),
        });
      }
    });

    // 4. trips.txt
    await readCsvFile(path.join(dir, 'trips.txt'), (row) => {
      const id = row.trip_id;
      if (id) {
        this.trips.set(id, {
          id,
          routeId: row.route_id || '',
          serviceId: row.service_id || '',
          headsign: row.trip_headsign || '',
          directionId: row.direction_id !== undefined ? parseInt(row.direction_id, 10) : undefined,
        });
      }
    });

    // 5. calendar.txt
    await readCsvFile(path.join(dir, 'calendar.txt'), (row) => {
      const sid = row.service_id;
      if (sid) {
        // days: [Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday]
        const days = [
          row.sunday === '1',
          row.monday === '1',
          row.tuesday === '1',
          row.wednesday === '1',
          row.thursday === '1',
          row.friday === '1',
          row.saturday === '1',
        ];
        this.calendars.set(sid, {
          serviceId: sid,
          days,
          startDate: row.start_date || '',
          endDate: row.end_date || '',
        });
      }
    });

    // 6. calendar_dates.txt
    await readCsvFile(path.join(dir, 'calendar_dates.txt'), (row) => {
      const sid = row.service_id;
      const dt = row.date;
      const ex = parseInt(row.exception_type || '1', 10);
      if (sid && dt) {
        this.calendarExceptions.set(`${sid}:${dt}`, ex);
      }
    });

    // 7. stop_times.txt
    await readCsvFile(path.join(dir, 'stop_times.txt'), (row) => {
      const tripId = row.trip_id;
      const stopId = row.stop_id;
      if (tripId && stopId) {
        const arrMin = parseTimeToMinutes(row.arrival_time);
        const depMin = parseTimeToMinutes(row.departure_time);
        const seq = parseInt(row.stop_sequence || '0', 10);

        let list = this.tripStopTimes.get(tripId);
        if (!list) {
          list = [];
          this.tripStopTimes.set(tripId, list);
        }
        list.push({
          tripId,
          stopId,
          sequence: seq,
          arrivalTimeMin: arrMin,
          departureTimeMin: depMin,
        });
      }
    });

    // Sort stop times by sequence
    for (const list of this.tripStopTimes.values()) {
      list.sort((a, b) => a.sequence - b.sequence);
    }
  }

  /**
   * Validates if a service_id runs on a specific date (YYYY-MM-DD)
   */
  isServiceActive(serviceId: string, dateStr: string): boolean {
    const gtfsDate = formatToGtfsDate(dateStr);
    const exKey = `${serviceId}:${gtfsDate}`;
    const exception = this.calendarExceptions.get(exKey);

    if (exception === 1) return true; // explicitly added
    if (exception === 2) return false; // explicitly removed

    const cal = this.calendars.get(serviceId);
    if (!cal) return false;

    if (gtfsDate < cal.startDate || gtfsDate > cal.endDate) {
      return false;
    }

    const dayOfWeek = getDayOfWeekForDate(dateStr);
    return cal.days[dayOfWeek] === true;
  }

  /**
   * Search trips that visit an origin stop before a destination stop
   */
  async search(ctx: SearchContext, route: RouteGeometryResult): Promise<BusService[]> {
    if (!this.isConfigured()) {
      return [];
    }
    await this.ensureLoaded();

    // 1. Find stops within stopRadiusKm of origin and destination
    const originStops = new Set<string>();
    const destStops = new Set<string>();

    for (const stop of this.stops.values()) {
      if (haversineDistanceKm(stop.lat, stop.lng, ctx.origin.lat, ctx.origin.lng) <= this.stopRadiusKm) {
        originStops.add(stop.id);
      }
      if (haversineDistanceKm(stop.lat, stop.lng, ctx.destination.lat, ctx.destination.lng) <= this.stopRadiusKm) {
        destStops.add(stop.id);
      }
    }

    if (originStops.size === 0 || destStops.size === 0) {
      return [];
    }

    const departAfterMin = parseTimeToMinutes(ctx.departAfterTime);
    const matchedBuses: BusService[] = [];

    for (const [tripId, stopTimes] of this.tripStopTimes.entries()) {
      const trip = this.trips.get(tripId);
      if (!trip) continue;

      // Check calendar activity for search date
      if (!this.isServiceActive(trip.serviceId, ctx.date)) {
        continue;
      }

      // Check origin and destination stops (direction-aware: origin must come BEFORE destination)
      let originIdx = -1;
      let destIdx = -1;

      for (let i = 0; i < stopTimes.length; i++) {
        const st = stopTimes[i];
        if (originIdx === -1 && originStops.has(st.stopId)) {
          originIdx = i;
        } else if (originIdx !== -1 && destStops.has(st.stopId)) {
          destIdx = i;
          break; // Found origin before destination
        }
      }

      if (originIdx === -1 || destIdx === -1 || originIdx >= destIdx) {
        continue;
      }

      const boardStop = stopTimes[originIdx];
      const alightStop = stopTimes[destIdx];

      // Depart after filter
      if (boardStop.departureTimeMin < departAfterMin) {
        continue;
      }

      const durationMinutes = Math.max(1, alightStop.arrivalTimeMin - boardStop.departureTimeMin);
      const gtfsRoute = this.routes.get(trip.routeId);
      const agency = gtfsRoute ? this.agencies.get(gtfsRoute.agencyId) : undefined;

      const operatorName = agency ? agency.name : 'Regional Transit Operator';
      const serviceNumber = gtfsRoute?.shortName || trip.headsign || `TRIP-${trip.id}`;

      // Build intermediate stops between board and alight
      const stops: StopPoint[] = [];
      for (let s = originIdx; s <= destIdx; s++) {
        const st = stopTimes[s];
        const stopMeta = this.stops.get(st.stopId);
        stops.push({
          name: stopMeta?.name || `Stop ${st.stopId}`,
          time: formatMinutesToTime(st.departureTimeMin, false),
          lat: stopMeta?.lat || 0,
          lng: stopMeta?.lng || 0,
        });
      }

      matchedBuses.push({
        id: `gtfs-${trip.id}`,
        serviceNumber,
        operatorName,
        operatorType: 'GOVERNMENT',
        busType: gtfsRoute?.longName || 'Scheduled Transit Bus',
        category: 'SEATER',
        isAc: false,
        isElectric: false,
        departureTime: formatMinutesToTime(boardStop.departureTimeMin, false),
        arrivalTime: formatMinutesToTime(alightStop.arrivalTimeMin, true),
        durationMinutes,
        fareEstimate: 'Fare not published', // Required strictly for real GTFS results
        stopsCount: stops.length,
        stops,
        dataSource: 'GTFS',
        bookable: false, // GTFS trips are not directly bookable via demo
        bookingUrl: agency?.url,
      });
    }

    // Sort by departure time
    matchedBuses.sort(
      (a, b) => parseTimeToMinutes(a.departureTime) - parseTimeToMinutes(b.departureTime)
    );

    return matchedBuses;
  }

  /**
   * Fetches and decodes GTFS-Realtime VehiclePositions with 10s caching
   */
  private async getVehiclePositions(): Promise<GtfsRtVehiclePosition[]> {
    const rtUrl = process.env.GTFS_RT_VEHICLE_POSITIONS_URL;
    if (!rtUrl) return [];

    const now = Date.now();
    if (this.rtPositions.length > 0 && now - this.rtCacheTimestamp < 10000) {
      return this.rtPositions;
    }

    try {
      const headers: Record<string, string> = {};
      if (process.env.GTFS_RT_AUTH_HEADER) {
        headers['Authorization'] = process.env.GTFS_RT_AUTH_HEADER;
      }

      const res = await fetch(rtUrl, { headers });
      if (!res.ok) return this.rtPositions;

      const buffer = await res.arrayBuffer();
      const feed = (GtfsRealtimeBindings as any).transit_realtime.FeedMessage.decode(
        new Uint8Array(buffer)
      );

      const positions: GtfsRtVehiclePosition[] = [];
      if (feed && feed.entity) {
        for (const entity of feed.entity) {
          if (entity.vehicle && entity.vehicle.position) {
            const v = entity.vehicle;
            const p = v.position;
            const timestampSeconds = v.timestamp ? Number(v.timestamp) : Math.floor(now / 1000);
            positions.push({
              tripId: v.trip?.tripId,
              vehicleId: v.vehicle?.id,
              lat: p.latitude,
              lng: p.longitude,
              bearing: p.bearing,
              speedMps: p.speed,
              timestampSeconds,
            });
          }
        }
      }

      this.rtPositions = positions;
      this.rtCacheTimestamp = now;
      return positions;
    } catch {
      return this.rtPositions;
    }
  }

  async getLiveStatus(
    bus: BusService,
    polyline: [number, number][]
  ): Promise<LiveStatus | null> {
    const rawTripId = bus.id.replace(/^gtfs-/, '');
    const rtPositions = await this.getVehiclePositions();
    const nowSeconds = Math.floor(Date.now() / 1000);

    // Try finding live fix by tripId
    const fix = rtPositions.find((p) => p.tripId === rawTripId);

    // Only consider live GPS if fix is under 5 minutes old (300 seconds)
    if (fix && nowSeconds - fix.timestampSeconds <= 300) {
      const proj = projectPointOntoPolylineSegments([fix.lat, fix.lng], polyline);
      return {
        busId: bus.id,
        serviceNumber: bus.serviceNumber,
        currentPosition: {
          lat: proj.point[0],
          lng: proj.point[1],
        },
        heading: fix.bearing || 0,
        speedKmph: fix.speedMps ? Math.round(fix.speedMps * 3.6) : undefined,
        isGpsLive: true,
        statusLabel: 'Live GPS',
        statusDescription: 'Live GPS fix from vehicle feed',
        lastUpdatedIso: new Date(fix.timestampSeconds * 1000).toISOString(),
        progressPercent: Math.round(proj.fraction * 100),
        dataSource: 'GTFS',
      };
    }

    // Fall back to timetable estimate
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

    const rawPos = interpolatePointAlongPolyline(polyline, progress);
    const proj = projectPointOntoPolylineSegments([rawPos.lat, rawPos.lng], polyline);

    return {
      busId: bus.id,
      serviceNumber: bus.serviceNumber,
      currentPosition: {
        lat: proj.point[0],
        lng: proj.point[1],
      },
      heading: 0,
      isGpsLive: false,
      statusLabel: 'Estimated position',
      statusDescription: fix
        ? 'GPS fix older than 5 minutes; estimated from timetable'
        : 'Live GPS unavailable; estimated from timetable',
      lastUpdatedIso: new Date().toISOString(),
      progressPercent: Math.round(progress * 100),
      dataSource: 'GTFS',
    };
  }
}
