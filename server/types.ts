import type {
  BusService,
  CorridorNote,
  DataSource,
  LiveStatus,
  Location,
} from '../src/types.js';

export type { BusService, CorridorNote, DataSource, LiveStatus, Location };

export interface SearchContext {
  origin: Location;
  destination: Location;
  date: string; // YYYY-MM-DD
  departAfterTime: string; // HH:MM
  timezone: string;
}

export interface RouteGeometryResult {
  polyline: [number, number][]; // [lat, lng][]
  distanceKm: number;
  durationMinutes: number;
  waypoints: { name: string; lat: number; lng: number }[];
  isFallback: boolean;
}

export interface BusProvider {
  readonly name: DataSource;
  isConfigured(): boolean | Promise<boolean>;
  search(
    ctx: SearchContext,
    route: RouteGeometryResult
  ): Promise<BusService[]>;
  getLiveStatus(
    bus: BusService,
    polyline: [number, number][]
  ): Promise<LiveStatus | null>;
}

export interface BusRegistryEntry {
  bus: BusService;
  polyline: [number, number][];
  providerName: DataSource;
  expiresAt: number;
}
