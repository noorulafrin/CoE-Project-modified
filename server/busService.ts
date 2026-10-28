import type { BusService, CorridorNote, LiveStatus, SearchResponse } from '../src/types.js';
import { GtfsBusProvider } from './providers/gtfs.js';
import { SimulatedBusProvider } from './providers/simulated.js';
import { generateCorridorNote } from './services/gemini.js';
import { getRouteGeometry } from './services/routing.js';
import type { BusProvider, BusRegistryEntry, SearchContext } from './types.js';
import { thinPolyline } from './utils/geo.js';
import { DEFAULT_TIMEZONE, resolveDateAndTime } from './utils/time.js';

class BusServiceManager {
  private gtfsProvider: GtfsBusProvider;
  private simulatedProvider: SimulatedBusProvider;

  // 3-hour TTL Bus Registry
  private busRegistry = new Map<string, BusRegistryEntry>();
  private readonly REGISTRY_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

  constructor() {
    this.gtfsProvider = new GtfsBusProvider();
    this.simulatedProvider = new SimulatedBusProvider();

    // Clean up expired registry entries periodically (every 15 min)
    setInterval(() => this.cleanupRegistry(), 15 * 60 * 1000).unref();
  }

  private cleanupRegistry() {
    const now = Date.now();
    for (const [id, entry] of this.busRegistry.entries()) {
      if (entry.expiresAt <= now) {
        this.busRegistry.delete(id);
      }
    }
  }

  public registerBuses(
    buses: BusService[],
    polyline: [number, number][],
    providerName: 'GTFS' | 'SIMULATED'
  ) {
    const expiresAt = Date.now() + this.REGISTRY_TTL_MS;
    for (const bus of buses) {
      this.busRegistry.set(bus.id, {
        bus,
        polyline,
        providerName,
        expiresAt,
      });
    }
  }

  public getRegisteredBus(busId: string): BusRegistryEntry | null {
    const entry = this.busRegistry.get(busId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.busRegistry.delete(busId);
      return null;
    }
    return entry;
  }

  /**
   * Search buses across providers with fallback logic and parallel Gemini notes
   */
  async search(
    origin: SearchContext['origin'],
    destination: SearchContext['destination'],
    dateQuery?: string,
    timeQuery?: string
  ): Promise<SearchResponse> {
    const timezone = DEFAULT_TIMEZONE;
    const { date, departAfterTime } = resolveDateAndTime(dateQuery, timeQuery, timezone);

    const ctx: SearchContext = {
      origin,
      destination,
      date,
      departAfterTime,
      timezone,
    };

    // 1. Fetch highway routing geometry from OSRM
    const route = await getRouteGeometry(
      origin.lat,
      origin.lng,
      destination.lat,
      destination.lng
    );

    // Thin polyline to at most 800 points
    const thinnedPolyline = thinPolyline(route.polyline, 800);

    // 2. Parallel search and Gemini corridor note
    const allowSimulatedFallback = process.env.SIMULATED_FALLBACK !== 'false';

    const providerSearchPromise = (async (): Promise<{
      buses: BusService[];
      dataSource: 'GTFS' | 'SIMULATED';
    }> => {
      // Try GTFS first if configured
      if (this.gtfsProvider.isConfigured()) {
        try {
          const gtfsResults = await this.gtfsProvider.search(ctx, route);
          if (gtfsResults.length > 0) {
            return { buses: gtfsResults, dataSource: 'GTFS' };
          }
        } catch {
          // Fall through to simulated if error
        }
      }

      // Fallback to simulated if allowed
      if (allowSimulatedFallback) {
        const simResults = await this.simulatedProvider.search(ctx, route);
        return { buses: simResults, dataSource: 'SIMULATED' };
      }

      return { buses: [], dataSource: 'GTFS' };
    })();

    // Run search and Gemini in parallel
    const [searchSettled, geminiSettled] = await Promise.allSettled([
      providerSearchPromise,
      generateCorridorNote(origin.name, destination.name, route.distanceKm),
    ]);

    const searchOutcome =
      searchSettled.status === 'fulfilled'
        ? searchSettled.value
        : { buses: [], dataSource: 'SIMULATED' as const };

    const corridorNote: CorridorNote | null =
      geminiSettled.status === 'fulfilled' ? geminiSettled.value : null;

    // Register all returned buses for live tracking
    this.registerBuses(searchOutcome.buses, thinnedPolyline, searchOutcome.dataSource);

    return {
      origin,
      destination,
      date,
      departAfterTime,
      distanceKm: route.distanceKm,
      routePolyline: thinnedPolyline,
      dataSource: searchOutcome.dataSource,
      buses: searchOutcome.buses,
      corridorNote,
    };
  }

  /**
   * Retrieves live tracking status for a registered bus
   */
  async getLiveStatus(busId: string): Promise<LiveStatus | null> {
    const entry = this.getRegisteredBus(busId);
    if (!entry) {
      return null;
    }

    const provider: BusProvider =
      entry.providerName === 'GTFS' ? this.gtfsProvider : this.simulatedProvider;

    return await provider.getLiveStatus(entry.bus, entry.polyline);
  }
}

export const busServiceManager = new BusServiceManager();
