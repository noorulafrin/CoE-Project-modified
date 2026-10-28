import test from 'node:test';
import assert from 'node:assert/strict';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { GtfsBusProvider } from '../server/providers/gtfs.js';
import type { BusService } from '../src/types.js';

test('GtfsBusProvider live tracking decodes GTFS-RT feed and respects 5-minute freshness threshold', async () => {
  const provider = new GtfsBusProvider('/dummy');
  const priv = provider as any;

  const nowSeconds = Math.floor(Date.now() / 1000);

  // Create a protobuf FeedMessage payload using GtfsRealtimeBindings
  const feedMessage = {
    header: {
      gtfsRealtimeVersion: '2.0',
      timestamp: nowSeconds,
    },
    entity: [
      {
        id: 'entity-fresh',
        vehicle: {
          trip: { tripId: 'TRIP-FRESH-123' },
          position: {
            latitude: 13.05,
            longitude: 80.20,
            bearing: 90,
            speed: 15, // 15 m/s (~54 km/h)
          },
          timestamp: nowSeconds - 60, // 1 minute old (< 5 minutes)
        },
      },
      {
        id: 'entity-stale',
        vehicle: {
          trip: { tripId: 'TRIP-STALE-456' },
          position: {
            latitude: 12.50,
            longitude: 79.50,
            bearing: 180,
            speed: 10,
          },
          timestamp: nowSeconds - 400, // 400 seconds old (> 5 minutes)
        },
      },
    ],
  };

  const encodedFeed = (GtfsRealtimeBindings as any).transit_realtime.FeedMessage.encode(feedMessage).finish();

  // Mock global.fetch for GTFS-RT
  const originalFetch = global.fetch;
  global.fetch = async (url: any) => {
    return {
      ok: true,
      arrayBuffer: async () => encodedFeed.buffer.slice(encodedFeed.byteOffset, encodedFeed.byteOffset + encodedFeed.byteLength),
    } as any;
  };

  process.env.GTFS_RT_VEHICLE_POSITIONS_URL = 'https://fake-transit-agency.gov/gtfs-rt.pb';

  try {
    const dummyPolyline: [number, number][] = [
      [13.0, 80.0],
      [13.1, 80.3],
    ];

    // Bus with fresh GPS fix
    const freshBus: BusService = {
      id: 'gtfs-TRIP-FRESH-123',
      serviceNumber: 'EXP-101',
      operatorName: 'Metro Transit',
      operatorType: 'GOVERNMENT',
      busType: 'Standard Bus',
      category: 'SEATER',
      isAc: false,
      isElectric: false,
      departureTime: '08:00',
      arrivalTime: '10:00',
      durationMinutes: 120,
      fareEstimate: 'Fare not published',
      stopsCount: 2,
      stops: [
        { name: 'Origin', time: '08:00', lat: 13.0, lng: 80.0 },
        { name: 'Dest', time: '10:00', lat: 13.1, lng: 80.3 },
      ],
      dataSource: 'GTFS',
      bookable: false,
    };

    const statusFresh = await provider.getLiveStatus(freshBus, dummyPolyline);
    assert.ok(statusFresh);
    assert.equal(statusFresh.isGpsLive, true);
    assert.equal(statusFresh.statusLabel, 'Live GPS');
    assert.equal(statusFresh.statusDescription, 'Live GPS fix from vehicle feed');
    assert.equal(statusFresh.speedKmph, 54);

    // Bus with stale GPS fix (> 5 min old)
    const staleBus: BusService = {
      ...freshBus,
      id: 'gtfs-TRIP-STALE-456',
    };
    const statusStale = await provider.getLiveStatus(staleBus, dummyPolyline);
    assert.ok(statusStale);
    assert.equal(statusStale.isGpsLive, false);
    assert.equal(statusStale.statusLabel, 'Estimated position');
    assert.ok(statusStale.statusDescription.includes('estimated from timetable'));
  } finally {
    global.fetch = originalFetch;
    delete process.env.GTFS_RT_VEHICLE_POSITIONS_URL;
  }
});
