import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvLine, GtfsBusProvider } from '../server/providers/gtfs.js';

test('parseCsvLine handles quotes, commas inside quotes, escaped quotes, and BOM', () => {
  // BOM character at start
  const lineWithBom = '\uFEFFstop_id,stop_name,"Main St, Stop",stop_lat';
  const parsed1 = parseCsvLine(lineWithBom);
  assert.deepEqual(parsed1, ['stop_id', 'stop_name', 'Main St, Stop', 'stop_lat']);

  // Escaped double quotes
  const lineWithEscapedQuotes = 'trip_1,"Bus with ""Super"" Deluxe",100';
  const parsed2 = parseCsvLine(lineWithEscapedQuotes);
  assert.deepEqual(parsed2, ['trip_1', 'Bus with "Super" Deluxe', '100']);
});

test('GtfsBusProvider isServiceActive checks calendar day and calendar_dates exceptions', () => {
  const provider = new GtfsBusProvider('/non/existent');

  // Inject test calendar directly into private maps for unit test
  const priv = provider as any;
  priv.calendars.set('SERVICE_WEEKDAY', {
    serviceId: 'SERVICE_WEEKDAY',
    // days: [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
    days: [false, true, true, true, true, true, false],
    startDate: '20261001',
    endDate: '20261031',
  });

  // Wednesday (2026-10-28) -> should be active
  assert.equal(provider.isServiceActive('SERVICE_WEEKDAY', '2026-10-28'), true);

  // Sunday (2026-10-25) -> should be inactive
  assert.equal(provider.isServiceActive('SERVICE_WEEKDAY', '2026-10-25'), false);

  // Out of range (2026-11-04) -> should be inactive
  assert.equal(provider.isServiceActive('SERVICE_WEEKDAY', '2026-11-04'), false);

  // Exception Type 2: Explicitly removed on a Wednesday
  priv.calendarExceptions.set('SERVICE_WEEKDAY:20261028', 2);
  assert.equal(provider.isServiceActive('SERVICE_WEEKDAY', '2026-10-28'), false);

  // Exception Type 1: Explicitly added on a Sunday
  priv.calendarExceptions.set('SERVICE_WEEKDAY:20261025', 1);
  assert.equal(provider.isServiceActive('SERVICE_WEEKDAY', '2026-10-25'), true);
});
