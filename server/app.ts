import express, { type Request, type Response, type NextFunction } from 'express';
import { busServiceManager } from './busService.js';
import { POPULAR_LOCATIONS, searchLocations } from './services/geocoding.js';
import type { Location } from '../src/types.js';

// Simple in-memory rate limiter per IP for /api routes
interface RateLimitBucket {
  count: number;
  resetTime: number;
}
const rateLimitMap = new Map<string, RateLimitBucket>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 120; // 120 requests/minute per IP

function apiRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let bucket = rateLimitMap.get(ip);

  if (!bucket || bucket.resetTime <= now) {
    bucket = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, bucket);
  } else {
    bucket.count++;
  }

  if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({
      error: 'Too many requests. Please wait a minute and try again.',
    });
    return;
  }
  next();
}

/**
 * Validates coordinate numbers
 */
function isValidCoord(val: unknown, min: number, max: number): val is number {
  return typeof val === 'number' && !isNaN(val) && val >= min && val <= max;
}

export function createApp() {
  const app = express();

  // Security: disable x-powered-by
  app.disable('x-powered-by');

  // JSON body parser with 20kb limit
  app.use(express.json({ limit: '20kb' }));

  // Apply rate limiter to /api
  app.use('/api', apiRateLimiter);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
    });
  });

  // Popular locations
  app.get('/api/locations/popular', (req, res) => {
    res.json(POPULAR_LOCATIONS.slice(0, 10));
  });

  // Search locations
  app.get('/api/locations/search', async (req, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
      const results = await searchLocations(q);
      res.json(results);
    } catch (err) {
      next(err);
    }
  });

  // Bus search endpoint
  app.post('/api/buses/search', async (req, res, next) => {
    try {
      const { origin, destination, date, departAfterTime } = req.body;

      if (!origin || !destination) {
        res.status(400).json({ error: 'Origin and destination locations are required.' });
        return;
      }

      if (
        typeof origin.name !== 'string' ||
        origin.name.length > 200 ||
        !isValidCoord(origin.lat, -90, 90) ||
        !isValidCoord(origin.lng, -180, 180)
      ) {
        res.status(400).json({ error: 'Invalid origin coordinates or name.' });
        return;
      }

      if (
        typeof destination.name !== 'string' ||
        destination.name.length > 200 ||
        !isValidCoord(destination.lat, -90, 90) ||
        !isValidCoord(destination.lng, -180, 180)
      ) {
        res.status(400).json({ error: 'Invalid destination coordinates or name.' });
        return;
      }

      const cleanOrigin: Location = {
        id: String(origin.id || 'loc-origin').slice(0, 80),
        name: String(origin.name).trim().slice(0, 200),
        state: origin.state ? String(origin.state).slice(0, 100) : undefined,
        lat: Number(origin.lat),
        lng: Number(origin.lng),
      };

      const cleanDestination: Location = {
        id: String(destination.id || 'loc-destination').slice(0, 80),
        name: String(destination.name).trim().slice(0, 200),
        state: destination.state ? String(destination.state).slice(0, 100) : undefined,
        lat: Number(destination.lat),
        lng: Number(destination.lng),
      };

      const dateStr = typeof date === 'string' ? date.slice(0, 20) : undefined;
      const timeStr = typeof departAfterTime === 'string' ? departAfterTime.slice(0, 10) : undefined;

      const result = await busServiceManager.search(
        cleanOrigin,
        cleanDestination,
        dateStr,
        timeStr
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Live tracking endpoint
  app.get('/api/buses/:id/live-track', async (req, res, next) => {
    try {
      const busId = req.params.id;
      if (!busId || busId.length > 150) {
        res.status(400).json({ error: 'Invalid bus ID parameter.' });
        return;
      }

      const status = await busServiceManager.getLiveStatus(busId);
      if (!status) {
        res.status(404).json({
          error: 'Bus not found or tracking expired. Please perform a fresh search.',
        });
        return;
      }

      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  // Demo Seat Booking
  app.post('/api/buses/book-demo', (req, res) => {
    const { busId, serviceNumber, seatNumbers, passengerName } = req.body;

    if (!busId || !serviceNumber || !Array.isArray(seatNumbers) || seatNumbers.length === 0) {
      res.status(400).json({ error: 'Invalid booking details.' });
      return;
    }

    const demoRef = `DEMO-${Math.floor(100000 + Math.random() * 900000)}`;

    res.json({
      bookingId: demoRef,
      status: 'CONFIRMED',
      busId,
      serviceNumber,
      seatNumbers,
      passengerName: passengerName ? String(passengerName).slice(0, 100) : 'Guest Passenger',
      message: 'Demo booking recorded. No ticket issued, no payment taken, no SMS sent.',
    });
  });

  // 404 handler for unmatched /api routes
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  // JSON error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    res.status(status).json({ error: message });
  });

  return app;
}
