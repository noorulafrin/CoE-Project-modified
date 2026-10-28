import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import type { Server } from 'http';

function startTestServer(app: any): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

test('API endpoints: validation, 400 on bad input, 404 on unknown bus, and demo booking', async () => {
  const app = createApp();
  const { server, url } = await startTestServer(app);

  try {
    // 1. Bad input: missing origin/destination -> 400
    const badRes1 = await fetch(`${url}/api/buses/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(badRes1.status, 400);
    const badJson1 = await badRes1.json();
    assert.ok(badJson1.error);

    // 2. Bad input: invalid coordinates (lat > 90) -> 400
    const badRes2 = await fetch(`${url}/api/buses/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { name: 'Valid Origin', lat: 105.0, lng: 77.0 },
        destination: { name: 'Valid Dest', lat: 12.0, lng: 78.0 },
      }),
    });
    assert.equal(badRes2.status, 400);

    // 3. Valid search returns SIMULATED data and thinned polyline
    const validRes = await fetch(`${url}/api/buses/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { id: 'tn-chennai', name: 'Chennai', lat: 13.0827, lng: 80.2707 },
        destination: { id: 'ka-bengaluru', name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
        date: 'today',
        departAfterTime: '06:00',
      }),
    });
    assert.equal(validRes.status, 200);
    const searchData = await validRes.json();
    assert.equal(searchData.dataSource, 'SIMULATED');
    assert.ok(Array.isArray(searchData.buses));
    assert.ok(searchData.buses.length > 0);
    assert.ok(Array.isArray(searchData.routePolyline));
    assert.ok(searchData.routePolyline.length <= 800, 'Polyline must be thinned to at most 800 points');

    const firstBusId = searchData.buses[0].id;

    // 4. Unknown bus ID -> 404 with helpful message
    const unknownRes = await fetch(`${url}/api/buses/unknown-bus-99999/live-track`);
    assert.equal(unknownRes.status, 404);
    const unknownJson = await unknownRes.json();
    assert.ok(unknownJson.error.includes('Bus not found or tracking expired'));

    // 5. Registered bus ID -> 200 with LiveStatus
    const liveRes = await fetch(`${url}/api/buses/${encodeURIComponent(firstBusId)}/live-track`);
    assert.equal(liveRes.status, 200);
    const liveData = await liveRes.json();
    assert.equal(liveData.busId, firstBusId);
    assert.equal(liveData.isGpsLive, false);
    assert.equal(liveData.statusLabel, 'Estimated position');

    // 6. Demo seat booking
    const bookRes = await fetch(`${url}/api/buses/book-demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        busId: firstBusId,
        serviceNumber: searchData.buses[0].serviceNumber,
        seatNumbers: ['S1', 'S2'],
        passengerName: 'Test Traveler',
      }),
    });
    assert.equal(bookRes.status, 200);
    const bookData = await bookRes.json();
    assert.ok(bookData.bookingId.startsWith('DEMO-'));
    assert.equal(bookData.status, 'CONFIRMED');
    assert.ok(bookData.message.includes('No ticket issued, no payment taken'));

    // 7. Unknown /api route -> 404 JSON
    const notFoundRes = await fetch(`${url}/api/non-existent-route`);
    assert.equal(notFoundRes.status, 404);
    const notFoundJson = await notFoundRes.json();
    assert.equal(notFoundJson.error, 'API route not found');
  } finally {
    server.close();
  }
});
