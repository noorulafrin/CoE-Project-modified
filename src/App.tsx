import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Bus,
  Search,
  ArrowRightLeft,
  Calendar,
  Clock,
  Sparkles,
  MapPin,
  AlertTriangle,
  Info,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import type {
  BusService,
  Location,
  SearchResponse,
} from './types.js';
import { BusCard } from './components/BusCard.js';
import {
  FilterBar,
  type OperatorFilter,
  type ClassFilter,
  type TimeFilter,
  type SortOption,
} from './components/FilterBar.js';
import { LiveTrackingModal } from './components/LiveTrackingModal.js';
import { SeatBookingModal } from './components/SeatBookingModal.js';

export default function App() {
  // Search inputs
  const [originQuery, setOriginQuery] = useState('Chennai (Koyambedu CMBT)');
  const [selectedOrigin, setSelectedOrigin] = useState<Location>({
    id: 'tn-chennai',
    name: 'Chennai (Koyambedu CMBT)',
    state: 'Tamil Nadu',
    lat: 13.0694,
    lng: 80.2057,
  });

  const [destQuery, setDestQuery] = useState('Bengaluru (Majestic KBS)');
  const [selectedDest, setSelectedDest] = useState<Location>({
    id: 'ka-bengaluru',
    name: 'Bengaluru (Majestic KBS)',
    state: 'Karnataka',
    lat: 12.9774,
    lng: 77.5729,
  });

  const [dateOption, setDateOption] = useState<'today' | 'tomorrow' | 'custom'>('today');
  const [customDate, setCustomDate] = useState('');
  const [departTime, setDepartTime] = useState('');

  // Location suggestions
  const [originSuggestions, setOriginSuggestions] = useState<Location[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<Location[]>([]);
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);

  // Search Results
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Client-side Filter & Sort state (runs strictly client-side with useMemo)
  const [operatorFilter, setOperatorFilter] = useState<OperatorFilter>('ALL');
  const [classFilter, setClassFilter] = useState<ClassFilter>('ALL');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('DEPARTURE_ASC');

  // Modals
  const [trackingBus, setTrackingBus] = useState<BusService | null>(null);
  const [bookingBus, setBookingBus] = useState<BusService | null>(null);

  // Suggestions debouncing
  useEffect(() => {
    if (!originQuery.trim() || originQuery === selectedOrigin.name) {
      setOriginSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/locations/search?q=${encodeURIComponent(originQuery)}`);
        if (res.ok) {
          const list = await res.json();
          setOriginSuggestions(list);
        }
      } catch {
        // Ignore
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [originQuery, selectedOrigin.name]);

  useEffect(() => {
    if (!destQuery.trim() || destQuery === selectedDest.name) {
      setDestSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/locations/search?q=${encodeURIComponent(destQuery)}`);
        if (res.ok) {
          const list = await res.json();
          setDestSuggestions(list);
        }
      } catch {
        // Ignore
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [destQuery, selectedDest.name]);

  // Execute Search
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedOrigin || !selectedDest) {
      setSearchError('Please select a valid origin and destination from the dropdown list.');
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const dateVal = dateOption === 'custom' && customDate ? customDate : dateOption;

    try {
      const res = await fetch('/api/buses/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: selectedOrigin,
          destination: selectedDest,
          date: dateVal,
          departAfterTime: departTime || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to search bus schedules');
      }

      const data: SearchResponse = await res.json();
      setSearchResponse(data);
    } catch (err: any) {
      setSearchError(err.message || 'Error connecting to search service.');
    } finally {
      setIsSearching(false);
    }
  };

  // Perform initial search on mount
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      handleSearch();
    }
  }, []);

  // Swap Origin and Destination
  const handleSwap = () => {
    const tempOrigin = selectedOrigin;
    const tempOriginQuery = originQuery;
    setSelectedOrigin(selectedDest);
    setOriginQuery(destQuery);
    setSelectedDest(tempOrigin);
    setDestQuery(tempOriginQuery);
  };

  // Popular corridors shortcuts
  const handleSelectPopularCorridor = (
    orig: Location,
    dest: Location
  ) => {
    setSelectedOrigin(orig);
    setOriginQuery(orig.name);
    setSelectedDest(dest);
    setDestQuery(destQuery);
    setDestQuery(dest.name);
  };

  // Helper to parse HH:MM to minutes
  const parseTimeToMin = (t: string) => {
    const parts = t.split(':');
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  };

  // Helper to parse fare number
  const parseFareNumber = (fareStr: string) => {
    const match = fareStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  // STRICTLY CLIENT-SIDE FILTERING AND SORTING WITH useMemo
  // Does NOT re-call /api/buses/search
  const filteredAndSortedBuses = useMemo(() => {
    if (!searchResponse || !searchResponse.buses) return [];

    let list = [...searchResponse.buses];

    // 1. Filter by Operator
    if (operatorFilter !== 'ALL') {
      list = list.filter((b) => b.operatorType === operatorFilter);
    }

    // 2. Filter by Class
    if (classFilter === 'AC') {
      list = list.filter((b) => b.isAc);
    } else if (classFilter === 'NON_AC') {
      list = list.filter((b) => !b.isAc);
    } else if (classFilter === 'SLEEPER') {
      list = list.filter((b) => b.category === 'SLEEPER' || b.category === 'SEATER_SLEEPER');
    } else if (classFilter === 'SEATER') {
      list = list.filter((b) => b.category === 'SEATER');
    } else if (classFilter === 'ELECTRIC') {
      list = list.filter((b) => b.isElectric);
    }

    // 3. Filter by Departure Time Window
    if (timeFilter === 'MORNING') {
      list = list.filter((b) => {
        const m = parseTimeToMin(b.departureTime);
        return m >= 360 && m < 720; // 06:00 to 12:00
      });
    } else if (timeFilter === 'AFTERNOON') {
      list = list.filter((b) => {
        const m = parseTimeToMin(b.departureTime);
        return m >= 720 && m < 1080; // 12:00 to 18:00
      });
    } else if (timeFilter === 'EVENING_NIGHT') {
      list = list.filter((b) => {
        const m = parseTimeToMin(b.departureTime);
        return m >= 1080 || m < 360; // 18:00 to 06:00
      });
    }

    // 4. Sort (uses durationMinutes, departure, fare - NO "Top Rated")
    list.sort((a, b) => {
      if (sortBy === 'DEPARTURE_ASC') {
        return parseTimeToMin(a.departureTime) - parseTimeToMin(b.departureTime);
      }
      if (sortBy === 'DEPARTURE_DESC') {
        return parseTimeToMin(b.departureTime) - parseTimeToMin(a.departureTime);
      }
      if (sortBy === 'DURATION_ASC') {
        // Strictly uses durationMinutes, NOT distance
        return a.durationMinutes - b.durationMinutes;
      }
      if (sortBy === 'FARE_ASC') {
        return parseFareNumber(a.fareEstimate) - parseFareNumber(b.fareEstimate);
      }
      if (sortBy === 'FARE_DESC') {
        return parseFareNumber(b.fareEstimate) - parseFareNumber(a.fareEstimate);
      }
      return 0;
    });

    return list;
  }, [searchResponse, operatorFilter, classFilter, timeFilter, sortBy]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Bus className="w-6 h-6" />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 text-lg tracking-tight block">
                Smart Bus Tracking
              </span>
              <span className="text-[11px] font-medium text-slate-500 block -mt-0.5">
                Timetable Discovery &amp; Live Corridor Viewer
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-xs font-semibold text-slate-600">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>GTFS &amp; Timetable Engine</span>
            </span>
          </div>
        </div>
      </header>

      {/* Hero & Search Container */}
      <div className="bg-gradient-to-b from-white to-slate-100 border-b border-slate-200 pt-8 pb-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mb-6">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Intercity Bus Timetables &amp; Transit Tracking
            </h1>
            <p className="text-sm text-slate-600 mt-1.5">
              Check deterministic schedules, estimated fares, intermediate highway stops, and route positioning.
            </p>
          </div>

          {/* Search Form Card */}
          <form
            onSubmit={handleSearch}
            className="bg-white rounded-2xl border border-slate-200 shadow-md p-4 sm:p-6"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-end">
              {/* Origin */}
              <div className="lg:col-span-4 relative">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1">
                  <span>
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  </span>
                  <span>From (Origin)</span>
                </label>
                <input
                  type="text"
                  required
                  value={originQuery}
                  onChange={(e) => {
                    setOriginQuery(e.target.value);
                    setShowOriginDropdown(true);
                  }}
                  onFocus={() => setShowOriginDropdown(true)}
                  placeholder="Enter departure city or bus stand"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />

                {showOriginDropdown && originSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-56 overflow-y-auto">
                    {originSuggestions.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => {
                          setSelectedOrigin(loc);
                          setOriginQuery(loc.name);
                          setShowOriginDropdown(false);
                        }}
                        className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-indigo-50 border-b border-slate-100 last:border-0 flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-900">{loc.name}</span>
                        {loc.state && (
                          <span className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {loc.state}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Swap Button */}
              <div className="hidden lg:flex lg:col-span-1 justify-center pb-1">
                <button
                  type="button"
                  onClick={handleSwap}
                  className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition border border-slate-200"
                  aria-label="Swap origin and destination"
                >
                  <span>
                    <ArrowRightLeft className="w-4 h-4" />
                  </span>
                </button>
              </div>

              {/* Destination */}
              <div className="lg:col-span-4 relative">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1">
                  <span>
                    <MapPin className="w-3.5 h-3.5 text-rose-600" />
                  </span>
                  <span>To (Destination)</span>
                </label>
                <input
                  type="text"
                  required
                  value={destQuery}
                  onChange={(e) => {
                    setDestQuery(e.target.value);
                    setShowDestDropdown(true);
                  }}
                  onFocus={() => setShowDestDropdown(true)}
                  placeholder="Enter destination terminal"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />

                {showDestDropdown && destSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-56 overflow-y-auto">
                    {destSuggestions.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => {
                          setSelectedDest(loc);
                          setDestQuery(loc.name);
                          setShowDestDropdown(false);
                        }}
                        className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-indigo-50 border-b border-slate-100 last:border-0 flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-900">{loc.name}</span>
                        {loc.state && (
                          <span className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {loc.state}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Date & Search Button */}
              <div className="lg:col-span-3 flex items-center gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1">
                    <span>
                      <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    </span>
                    <span>Travel Date</span>
                  </label>
                  <select
                    value={dateOption}
                    onChange={(e) => setDateOption(e.target.value as any)}
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="today">Today</option>
                    <option value="tomorrow">Tomorrow</option>
                    <option value="custom">Custom Date</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isSearching}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center justify-center gap-2 shrink-0 h-[42px]"
                >
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  <span>Search</span>
                </button>
              </div>
            </div>

            {/* Custom Date Input row if chosen */}
            {dateOption === 'custom' && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
                <label className="text-xs font-medium text-slate-600">Pick Date:</label>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50"
                />
              </div>
            )}

            {/* Depart After Time Option */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Show departures at or after:</span>
                <input
                  type="time"
                  value={departTime}
                  onChange={(e) => setDepartTime(e.target.value)}
                  className="px-2 py-1 text-xs border border-slate-200 rounded-md bg-slate-50"
                />
              </div>

              {/* Popular route shortcuts */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-600">Popular:</span>
                <button
                  type="button"
                  onClick={() =>
                    handleSelectPopularCorridor(
                      { id: 'tn-chennai', name: 'Chennai (Koyambedu CMBT)', state: 'Tamil Nadu', lat: 13.0694, lng: 80.2057 },
                      { id: 'ka-bengaluru', name: 'Bengaluru (Majestic KBS)', state: 'Karnataka', lat: 12.9774, lng: 77.5729 }
                    )
                  }
                  className="text-indigo-600 hover:underline font-medium"
                >
                  Chennai &rarr; Bengaluru
                </button>
                <span>&bull;</span>
                <button
                  type="button"
                  onClick={() =>
                    handleSelectPopularCorridor(
                      { id: 'ka-bengaluru', name: 'Bengaluru (Majestic KBS)', state: 'Karnataka', lat: 12.9774, lng: 77.5729 },
                      { id: 'ka-mysuru', name: 'Mysuru (Suburban Bus Stand)', state: 'Karnataka', lat: 12.3106, lng: 76.6578 }
                    )
                  }
                  className="text-indigo-600 hover:underline font-medium"
                >
                  Bengaluru &rarr; Mysuru
                </button>
                <span>&bull;</span>
                <button
                  type="button"
                  onClick={() =>
                    handleSelectPopularCorridor(
                      { id: 'mh-mumbai', name: 'Mumbai (Dadar Asiad)', state: 'Maharashtra', lat: 19.0178, lng: 72.8478 },
                      { id: 'mh-pune', name: 'Pune (Shivaji Nagar Bus Stand)', state: 'Maharashtra', lat: 18.5314, lng: 73.8446 }
                    )
                  }
                  className="text-indigo-600 hover:underline font-medium"
                >
                  Mumbai &rarr; Pune
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Main Results Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-6">
        {searchError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {/* 1. Amber Banner on results page when data is SIMULATED (Requirement 1) */}
        {searchResponse && searchResponse.dataSource === 'SIMULATED' && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 shadow-xs">
            <span className="mt-0.5 shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </span>
            <div className="text-xs sm:text-sm text-amber-900">
              <p className="font-bold">Simulation Notice</p>
              <p className="mt-0.5">
                Demo data: timetables, fares and positions are simulated estimates, not real schedules or live GPS.
              </p>
            </div>
          </div>
        )}

        {/* Corridor Note from Gemini (Requirement 3: labelled AI-generated note) */}
        {searchResponse && searchResponse.corridorNote && (
          <div className="bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-slate-50 border border-indigo-100 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                AI-generated note (may be inaccurate)
              </span>
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1.5">
              {searchResponse.corridorNote.title}
            </h3>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed mb-3">
              {searchResponse.corridorNote.summary}
            </p>
            {searchResponse.corridorNote.highlights.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 pt-2 border-t border-indigo-100/60">
                {searchResponse.corridorNote.highlights.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <span className="text-indigo-500 font-bold">&bull;</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
            {searchResponse.corridorNote.sources && searchResponse.corridorNote.sources.length > 0 && (
              <p className="text-[11px] text-slate-400 mt-3 italic">
                AI summary sources (unverified): {searchResponse.corridorNote.sources.join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Route Overview & Distance */}
        {searchResponse && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 px-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-sm">
                {searchResponse.origin.name} &rarr; {searchResponse.destination.name}
              </span>
              <span>&bull;</span>
              <span>~{searchResponse.distanceKm} km highway distance</span>
              <span>&bull;</span>
              <span>Date: {searchResponse.date}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-medium">
                Departures &ge; {searchResponse.departAfterTime}
              </span>
            </div>
          </div>
        )}

        {/* Filters and Sorting bar */}
        {searchResponse && (
          <FilterBar
            totalCount={searchResponse.buses.length}
            filteredCount={filteredAndSortedBuses.length}
            operatorFilter={operatorFilter}
            setOperatorFilter={setOperatorFilter}
            classFilter={classFilter}
            setClassFilter={setClassFilter}
            timeFilter={timeFilter}
            setTimeFilter={setTimeFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
          />
        )}

        {/* Bus List */}
        {isSearching ? (
          <div className="py-16 text-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">
              Querying bus timetables &amp; calculating route polyline...
            </p>
          </div>
        ) : filteredAndSortedBuses.length > 0 ? (
          <div className="space-y-4">
            {filteredAndSortedBuses.map((bus) => (
              <BusCard
                key={bus.id}
                bus={bus}
                onTrack={(b) => setTrackingBus(b)}
                onBook={(b) => setBookingBus(b)}
              />
            ))}
          </div>
        ) : searchResponse ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
            <Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <h4 className="font-bold text-slate-800 text-base">No matching buses found</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Try adjusting your filter criteria (operator type, bus class, departure window) or changing the travel date.
            </p>
          </div>
        ) : null}
      </main>

      {/* Live Tracking Modal */}
      {trackingBus && searchResponse && (
        <LiveTrackingModal
          bus={trackingBus}
          routePolyline={searchResponse.routePolyline}
          origin={searchResponse.origin}
          destination={searchResponse.destination}
          onClose={() => setTrackingBus(null)}
        />
      )}

      {/* Seat Booking Modal */}
      {bookingBus && (
        <SeatBookingModal
          bus={bookingBus}
          onClose={() => setBookingBus(null)}
        />
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-8 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Bus className="w-4 h-4 text-indigo-600" />
              <span className="font-bold text-slate-800">
                Smart Bus Tracking &amp; Timings
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Deterministic Schedule Engine &bull; Open GTFS Realtime Interface
            </div>
          </div>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            Independent bus timetable and tracking viewer. Timetables, fares, and tracking data are provided via open GTFS feeds or simulated estimates for demonstration. Not affiliated with any state transport corporation (TNSTC, SETC, KSRTC, APSRTC, TGSRTC, MSRTC, GSRTC) or private bus operator.
          </p>
        </div>
      </footer>
    </div>
  );
}
