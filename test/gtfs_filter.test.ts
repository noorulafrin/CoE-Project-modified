import test from 'node:test';
import assert from 'node:assert/strict';
import { GtfsBusProvider } from '../server/providers/gtfs.js';
import type { RouteGeometryResult, SearchContext } from '../server/types.js';

test('GtfsBusProvider search enforces direction: origin stop must be visited before destination stop', async () => {
  const provider = new GtfsBusProvider('/dummy');
  const priv = provider as any;

  // Mock isConfigured and isLoaded
  provider.isConfigured = () => true;
  priv.isLoaded = true;

  // Stops: A (lat: 13.0, lng: 80.0), B (lat: 12.9, lng: 79.1), C (lat: 12.0, lng: 78.0)
  priv.stops.set('STOP_A', { id: 'STOP_A', name: 'Stop A', lat: 13.0, lng: 80.0 });
  priv.stops.set('STOP_B', { id: 'STOP_B', name: 'Stop B', lat: 12.9, lng: 79.1 });
  priv.stops.set('STOP_C', { id: 'STOP_C', name: 'Stop C', lat: 12.0, lng: 78.0 });

  // Trip Forward: A -> B -> C
  priv.trips.set('TRIP_FWD', { id: 'TRIP_FWD', routeId: 'R1', serviceId: 'SRV1', headsign: 'Southbound' });
  priv.tripStopTimes.set('TRIP_FWD', [
    { tripId: 'TRIP_FWD', stopId: 'STOP_A', sequence: 1, arrivalTimeMin: 480, departureTimeMin: 480 }, // 08:00
    { tripId: 'TRIP_FWD', stopId: 'STOP_B', sequence: 2, arrivalTimeMin: 540, departureTimeMin: 545 }, // 09:05
    { tripId: 'TRIP_FWD', stopId: 'STOP_C', sequence: 3, arrivalTimeMin: 620, departureTimeMin: 620 }, // 10:20
  ]);

  // Trip Reverse: C -> B -> A
  priv.trips.set('TRIP_REV', { id: 'TRIP_REV', routeId: 'R1', serviceId: 'SRV1', headsign: 'Northbound' });
  priv.tripStopTimes.set('TRIP_REV', [
    { tripId: 'TRIP_REV', stopId: 'STOP_C', sequence: 1, arrivalTimeMin: 500, departureTimeMin: 500 },
    { tripId: 'TRIP_REV', stopId: 'STOP_B', sequence: 2, arrivalTimeMin: 580, departureTimeMin: 585 },
    { tripId: 'TRIP_REV', stopId: 'STOP_A', sequence: 3, arrivalTimeMin: 660, departureTimeMin: 660 },
  ]);

  // Calendar active
  priv.calendars.set('SRV1', {
    serviceId: 'SRV1',
    days: [true, true, true, true, true, true, true],
    startDate: '20260101',
    endDate: '20261231',
  });

  const dummyRoute: RouteGeometryResult = {
    polyline: [[13.0, 80.0], [12.0, 78.0]],
    distanceKm: 150,
    durationMinutes: 180,
    waypoints: [],
    isFallback: false,
  };

  // Search from A to C (depart after 07:00)
  const ctxForward: SearchContext = {
    origin: { id: 'orig', name: 'Origin A', lat: 13.0, lng: 80.0 },
    destination: { id: 'dest', name: 'Dest C', lat: 12.0, lng: 78.0 },
    date: '2026-10-28',
    departAfterTime: '07:00',
    timezone: 'Asia/Kolkata',
  };

  const resultsFwd = await provider.search(ctxForward, dummyRoute);
  assert.equal(resultsFwd.length, 1);
  assert.equal(resultsFwd[0].id, 'gtfs-TRIP_FWD');
  assert.equal(resultsFwd[0].fareEstimate, 'Fare not published');
  assert.equal(resultsFwd[0].bookable, false);

  // Depart after 08:30 -> TRIP_FWD departs at 08:00, so it should be filtered out
  const ctxLate: SearchContext = {
    ...ctxForward,
    departAfterTime: '08:30',
  };
  const resultsLate = await provider.search(ctxLate, dummyRoute);
  assert.equal(resultsLate.length, 0);

  // Search reverse from C to A
  const ctxRev: SearchContext = {
    origin: { id: 'origC', name: 'Origin C', lat: 12.0, lng: 78.0 },
    destination: { id: 'destA', name: 'Dest A', lat: 13.0, lng: 80.0 },
    date: '2026-10-28',
    departAfterTime: '07:00',
    timezone: 'Asia/Kolkata',
  };
  const resultsRev = await provider.search(ctxRev, dummyRoute);
  assert.equal(resultsRev.length, 1);
  assert.equal(resultsRev[0].id, 'gtfs-TRIP_REV');
});
