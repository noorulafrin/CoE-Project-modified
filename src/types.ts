/**
 * Types for Smart Bus Tracking & Timings
 */

export type DataSource = 'GTFS' | 'SIMULATED';

export interface Location {
  id: string;
  name: string;
  state?: string;
  lat: number;
  lng: number;
}

export interface StopPoint {
  name: string;
  time: string;
  km?: number;
  lat: number;
  lng: number;
}

export interface BusService {
  id: string;
  serviceNumber: string;
  operatorName: string;
  operatorType: 'GOVERNMENT' | 'PRIVATE';
  busType: string;
  category: 'SEATER' | 'SLEEPER' | 'SEATER_SLEEPER';
  isAc: boolean;
  isElectric: boolean;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  fareEstimate: string; // e.g. "~₹182" or "Fare not published"
  stopsCount: number;
  stops: StopPoint[];
  dataSource: DataSource;
  bookable: boolean;
  bookingUrl?: string;
  totalSeats?: number;
  availableSeats?: number;
}

export interface LiveStatus {
  busId: string;
  serviceNumber: string;
  currentPosition: {
    lat: number;
    lng: number;
  };
  heading?: number;
  speedKmph?: number;
  isGpsLive: boolean;
  statusLabel: string; // "Live GPS" or "Estimated position"
  statusDescription: string; // "Live GPS fix from vehicle feed" or "Estimated from timetable, not live GPS"
  lastUpdatedIso: string;
  nextStop?: string;
  etaNextStop?: string;
  progressPercent: number;
  dataSource: DataSource;
}

export interface CorridorNote {
  title: string;
  summary: string;
  highlights: string[];
  sources?: string[];
}

export interface SearchResponse {
  origin: Location;
  destination: Location;
  date: string;
  departAfterTime: string;
  distanceKm: number;
  routePolyline: [number, number][]; // Thinned to <= 800 points
  dataSource: DataSource;
  buses: BusService[];
  corridorNote?: CorridorNote | null;
}

export interface DemoBookingRequest {
  busId: string;
  serviceNumber: string;
  seatNumbers: string[];
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string;
  boardingPoint: string;
}

export interface DemoBookingResponse {
  bookingId: string; // DEMO-XXXXXX
  status: 'CONFIRMED';
  busId: string;
  serviceNumber: string;
  seatNumbers: string[];
  passengerName: string;
  message: string;
}
