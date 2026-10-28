# Smart Bus Tracking & Timings

An honest, transparent bus schedule discovery and live tracking platform built with **React 19**, **Vite**, **Tailwind CSS 4**, **Leaflet**, and an **Express + TypeScript** backend.

---

## 1. Data Model & Architecture (Real vs. Simulated)

A core principle of Smart Bus Tracking & Timings is **integrity**: real transit schedules are clearly separated from simulated estimates, and invented metrics are strictly banned.

### Honest Representation
| Field | Real GTFS Data (`dataSource: 'GTFS'`) | Simulated Demo Data (`dataSource: 'SIMULATED'`) |
| :--- | :--- | :--- |
| **Badge & Notice** | Blue "Official GTFS" badge | Amber "Simulated" badge & results banner |
| **Schedule Source** | Official static GTFS `stop_times.txt`, `calendar.txt`, `routes.txt` | Deterministic daily departure slot grid with route jitter |
| **Live Tracking** | "Live GPS" **only** if GTFS-RT fix < 5 min old; otherwise "Estimated position" | "Estimated position" calculated from timetable progress |
| **`isGpsLive` flag** | `true` only with active vehicle feed fix (< 300s old) | Strictly `false` |
| **Fare Label** | `"Fare not published"` | Estimated fare formatted with `"~₹"` (e.g. `~₹185`) |
| **Booking Flow** | Direct link to official operator website (`bookingUrl`) | Interactive demo seat selector with `"DEMO-"` booking reference |
| **Operator Names** | Published GTFS `agency_name` or route long name | State RTC from origin state map (TNSTC, KSRTC, etc.) or generic private coach names |

### What is Explicitly Excluded
- **No invented reviews or ratings** (no fake "4.7 ★" or "1,200 reviews").
- **No fake helpline numbers** (no artificial toll-free 1800 numbers).
- **No fake battery indicators** (no random "87% EV battery").
- **No synthetic delay counters** (no fake "+15m delayed" animations).
- **No fake private brand names** (uses generic descriptions like "Private AC Sleeper Service" instead of trademarked private aggregators).
- **No hardcoded stop lists**: Intermediate stops use real highway waypoints from OSRM driving routes or deterministic kilometer milestones ("En route (km 45)").

---

## 2. Deterministic Timetable Engine

Simulated bus schedules are **deterministic**:
- Searching the same corridor (e.g. Chennai &rarr; Bengaluru) on the same date will **always return the exact same buses, departure times, fares, and service numbers**.
- Departure slots are based on a fixed 24-hour intercity schedule grid jittered by a deterministic hash of the route name.
- Timetable generation does **not** shift relative to the clock; the search time input means *"show departures at or after this time"*.

---

## 3. How to Plug in Real GTFS Feeds

The app provides a first-class GTFS provider in `server/providers/gtfs.ts`.

### 3.1 Static GTFS (Schedules & Stops)
1. Download or export standard GTFS `.txt` files from a transport agency or open data portal (e.g., Transitland, OpenMobilityData):
   - `stops.txt`
   - `routes.txt`
   - `trips.txt`
   - `stop_times.txt`
   - `calendar.txt`
   - `calendar_dates.txt` (optional, for holiday exceptions)
   - `agency.txt`
2. Unzip into a local folder (e.g. `./gtfs_data`).
3. Set the environment variable:
   ```env
   GTFS_DIR="./gtfs_data"
   GTFS_STOP_RADIUS_KM=3
   ```
4. The provider automatically parses the CSV files using streaming readers that handle UTF-8 BOMs and quoted values, indexes direction-aware trips, handles overnight times past 24:00 (e.g., `25:30:00`), and matches stops within the configurable radius.

### 3.2 GTFS-Realtime (Live Vehicle Positions)
1. Provide the Protocol Buffer feed endpoint for vehicle locations:
   ```env
   GTFS_RT_VEHICLE_POSITIONS_URL="https://agency.example.org/gtfs-rt/vehicle-positions.pb"
   GTFS_RT_AUTH_HEADER="Bearer YOUR_FEED_API_TOKEN"
   ```
2. The server caches binary vehicle positions in-memory for 10 seconds.
3. If a vehicle position for a trip has a timestamp **less than 5 minutes old**, the map displays **"Live GPS"** with live speed and heading. If the fix is stale (> 5 minutes) or unavailable, it smoothly falls back to an **"Estimated position"** and clearly labels it as such.

### 3.3 Provider Fallback Configuration
By default, if GTFS is unconfigured or returns zero trips for a query, the application falls back to the deterministic simulated provider. To disable simulated fallback and strictly serve real GTFS data:
```env
SIMULATED_FALLBACK="false"
```

---

## 4. Optional Gemini AI Route Insights

- If `GEMINI_API_KEY` is present, the server queries `@google/genai` in parallel with the bus search to retrieve transit corridor notes, major highway highlights, and travel tips.
- The Gemini call has an **8-second timeout** and a **6-hour TTL cache**. It **never blocks or fails the bus search**.
- AI notes are transparently labeled in the UI as `"AI-generated note (may be inaccurate)"` with sources marked as `"AI summary sources (unverified)"`.

---

## 5. Development and Testing

### Environment Setup
Copy the example environment configuration:
```bash
cp .env.example .env
```

### Running Tests
The test suite runs using Node's native test runner (`node:test` via `tsx --test`):
```bash
npm test
```
Tests cover:
- Time parsing, formatting, and GTFS past-24h calculations
- GTFS calendar schedules and date exception rules
- Direction-aware trip matching and time-window filtering
- GTFS-Realtime protobuf decoding and 5-minute freshness logic
- Deterministic simulated provider outputs & exclusion of invented fields
- Express API validation, rate limiting, and 404 responses

### Type Checking & Linting
```bash
npm run lint
```

### Building for Production
```bash
npm run build
```
In production, start the server with:
```bash
npm start
```
