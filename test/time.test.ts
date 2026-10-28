import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimeToMinutes,
  formatMinutesToTime,
  getNowInTimezone,
  resolveDateAndTime,
  formatToGtfsDate,
  getDayOfWeekForDate,
} from '../server/utils/time.js';

test('parseTimeToMinutes handles standard times and GTFS times past 24:00:00', () => {
  assert.equal(parseTimeToMinutes('00:00'), 0);
  assert.equal(parseTimeToMinutes('06:30'), 390);
  assert.equal(parseTimeToMinutes('14:45:00'), 885);
  // GTFS times past midnight
  assert.equal(parseTimeToMinutes('24:00:00'), 1440);
  assert.equal(parseTimeToMinutes('25:30:00'), 1530);
  assert.equal(parseTimeToMinutes('27:15:00'), 1635);
});

test('formatMinutesToTime formats minutes correctly and adds day markers', () => {
  assert.equal(formatMinutesToTime(390, false), '06:30');
  assert.equal(formatMinutesToTime(885, false), '14:45');
  assert.equal(formatMinutesToTime(1530, true), '01:30 +1d');
  assert.equal(formatMinutesToTime(1530, false), '01:30');
});

test('getNowInTimezone computes time accurately in Asia/Kolkata', () => {
  const refDate = new Date('2026-10-28T05:30:00Z'); // 11:00 AM IST
  const result = getNowInTimezone('Asia/Kolkata', refDate);
  assert.equal(result.timeStr, '11:00');
  assert.equal(result.dateStr, '2026-10-28');
  assert.equal(result.minutesFromMidnight, 660);
});

test('resolveDateAndTime resolves now, today, tomorrow, and ISO dates', () => {
  const todayRes = resolveDateAndTime('today', '08:00', 'Asia/Kolkata');
  assert.ok(todayRes.date.match(/^\d{4}-\d{2}-\d{2}$/));
  assert.equal(todayRes.departAfterTime, '08:00');

  const tmrwRes = resolveDateAndTime('tomorrow', '09:30', 'Asia/Kolkata');
  assert.ok(tmrwRes.date.match(/^\d{4}-\d{2}-\d{2}$/));
  assert.equal(tmrwRes.departAfterTime, '09:30');

  const isoRes = resolveDateAndTime('2026-12-25', '14:00', 'Asia/Kolkata');
  assert.equal(isoRes.date, '2026-12-25');
  assert.equal(isoRes.departAfterTime, '14:00');
});

test('formatToGtfsDate and getDayOfWeekForDate', () => {
  assert.equal(formatToGtfsDate('2026-10-28'), '20261028');
  // 2026-10-28 is a Wednesday (index 3)
  assert.equal(getDayOfWeekForDate('2026-10-28'), 3);
});
