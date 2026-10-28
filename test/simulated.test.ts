import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulatedBusProvider, getGovernmentOperatorName } from '../server/providers/simulated.js';
import type { RouteGeometryResult, SearchContext } from '../server/types.js';

test('SimulatedBusProvider is strictly deterministic (same route = same buses on every search)', async () => {
  const provider = new SimulatedBusProvider();

  const ctx: SearchContext = {
    origin: { id: 'ka-bengaluru', name: 'Bengaluru (Majestic KBS)', state: 'Karnataka', lat: 12.9774, lng: 77.5729 },
    destination: { id: 'ka-mysuru', name: 'Mysuru (Suburban Bus Stand)', state: 'Karnataka', lat: 12.3106, lng: 76.6578 },
    date: '2026-10-28',
    departAfterTime: '06:00',
    timezone: 'Asia/Kolkata',
  };

  const route: RouteGeometryResult = {
    polyline: [
      [12.9774, 77.5729],
      [12.6000, 77.1000],
      [12.3106, 76.6578],
    ],
    distanceKm: 145,
    durationMinutes: 180,
    waypoints: [
      { name: 'Bengaluru-Mysuru Expressway', lat: 12.65, lng: 77.15 },
      { name: 'Mandya Highway Toll', lat: 12.52, lng: 76.90 },
    ],
    isFallback: false,
  };

  const search1 = await provider.search(ctx, route);
  const search2 = await provider.search(ctx, route);

  assert.equal(search1.length, search2.length);
  assert.ok(search1.length > 0);

  for (let i = 0; i < search1.length; i++) {
    const b1 = search1[i];
    const b2 = search2[i];

    assert.equal(b1.id, b2.id);
    assert.equal(b1.serviceNumber, b2.serviceNumber);
    assert.equal(b1.departureTime, b2.departureTime);
    assert.equal(b1.arrivalTime, b2.arrivalTime);
    assert.equal(b1.fareEstimate, b2.fareEstimate);
    assert.equal(b1.operatorName, b2.operatorName);
    assert.equal(b1.dataSource, 'SIMULATED');

    // Strict requirements: NO invented data!
    assert.equal((b1 as any).rating, undefined, 'Must not have rating');
    assert.equal((b1 as any).reviewCount, undefined, 'Must not have reviewCount');
    assert.equal((b1 as any).helpline, undefined, 'Must not have helpline');
    assert.equal((b1 as any).batteryLevel, undefined, 'Must not have batteryLevel');
    assert.equal((b1 as any).delayMinutes, undefined, 'Must not have fake delayMinutes');

    // Fare is marked as estimate
    assert.ok(b1.fareEstimate.startsWith('~₹'));
  }
});

test('SimulatedBusProvider live status has isGpsLive = false and honest label', async () => {
  const provider = new SimulatedBusProvider();

  const ctx: SearchContext = {
    origin: { id: 'mh-mumbai', name: 'Mumbai', state: 'Maharashtra', lat: 19.0178, lng: 72.8478 },
    destination: { id: 'mh-pune', name: 'Pune', state: 'Maharashtra', lat: 18.5314, lng: 73.8446 },
    date: '2026-10-28',
    departAfterTime: '00:00',
    timezone: 'Asia/Kolkata',
  };

  const route: RouteGeometryResult = {
    polyline: [[19.0, 72.8], [18.7, 73.3], [18.5, 73.8]],
    distanceKm: 150,
    durationMinutes: 190,
    waypoints: [{ name: 'Mumbai-Pune Expressway', lat: 18.7, lng: 73.3 }],
    isFallback: false,
  };

  const buses = await provider.search(ctx, route);
  assert.ok(buses.length > 0);

  const status = await provider.getLiveStatus(buses[0], route.polyline);
  assert.ok(status);
  assert.equal(status.isGpsLive, false);
  assert.equal(status.statusLabel, 'Estimated position');
  assert.equal(status.statusDescription, 'Estimated from timetable, not live GPS');
  assert.equal(status.dataSource, 'SIMULATED');
});

test('getGovernmentOperatorName accurately uses state map and generic private names', () => {
  assert.ok(['TNSTC', 'SETC'].includes(getGovernmentOperatorName('Tamil Nadu', 0)));
  assert.equal(getGovernmentOperatorName('Karnataka', 0), 'KSRTC');
  assert.equal(getGovernmentOperatorName('Maharashtra', 0), 'MSRTC');
  assert.equal(getGovernmentOperatorName('Gujarat', 0), 'GSRTC');
  assert.equal(getGovernmentOperatorName('Andhra Pradesh', 0), 'APSRTC');
});
