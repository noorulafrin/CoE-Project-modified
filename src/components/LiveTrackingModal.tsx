import React, { useEffect, useState, useRef } from 'react';
import { X, Navigation, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { BusService, LiveStatus, Location } from '../types.js';
import { InteractiveMap } from './InteractiveMap.js';

interface LiveTrackingModalProps {
  bus: BusService;
  routePolyline: [number, number][];
  origin: Location;
  destination: Location;
  onClose: () => void;
}

export const LiveTrackingModal: React.FC<LiveTrackingModalProps> = ({
  bus,
  routePolyline,
  origin,
  destination,
  onClose,
}) => {
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');

  const isMountedRef = useRef(true);

  const fetchLiveStatus = async () => {
    // If user switched tabs, pause polling
    if (document.visibilityState === 'hidden') {
      return;
    }

    try {
      const res = await fetch(`/api/buses/${encodeURIComponent(bus.id)}/live-track`);
      if (!isMountedRef.current) return;

      if (res.status === 404) {
        setErrorMessage('Bus not found or tracking expired. Please perform a fresh search.');
        setIsLoading(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || 'Unable to retrieve live tracking data.');
        setIsLoading(false);
        return;
      }

      const data: LiveStatus = await res.json();
      if (!isMountedRef.current) return;

      setLiveStatus(data);
      setErrorMessage(null);
      setIsLoading(false);
      setLastRefreshedAt(new Date().toLocaleTimeString());
    } catch {
      if (isMountedRef.current) {
        setErrorMessage('Connection issue fetching live position. Retrying...');
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchLiveStatus();

    // 8 second polling interval
    const interval = setInterval(fetchLiveStatus, 8000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchLiveStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [bus.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-lg text-slate-900">
                {bus.operatorName}
              </span>
              <span className="text-xs font-mono font-medium bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
                {bus.serviceNumber}
              </span>
              {bus.dataSource === 'SIMULATED' && (
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium border border-amber-200">
                  Simulated Demo
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {origin.name} &rarr; {destination.name}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            aria-label="Close modal"
          >
            <span>
              <X className="w-5 h-5" />
            </span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Banner */}
          {errorMessage ? (
            <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
              <span className="mt-0.5 shrink-0">
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </span>
              <div>
                <p className="font-medium text-sm">{errorMessage}</p>
                <p className="text-xs text-rose-600 mt-1">
                  Automatic retry happens every 8 seconds when connected.
                </p>
              </div>
            </div>
          ) : liveStatus ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className={`p-4 rounded-xl border flex items-center gap-3 ${
                  liveStatus.isGpsLive
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <span className="shrink-0">
                  {liveStatus.isGpsLive ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  ) : (
                    <Navigation className="w-6 h-6 text-amber-600" />
                  )}
                </span>
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-sm">
                    {liveStatus.statusLabel}
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        liveStatus.isGpsLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                      }`}
                    />
                  </div>
                  <p className="text-xs opacity-85 mt-0.5">
                    {liveStatus.statusDescription}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-center">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Next Stop / Arrival
                </span>
                <span className="font-semibold text-slate-800 text-sm mt-1 truncate">
                  {liveStatus.nextStop || destination.name}
                </span>
                <span className="text-xs text-slate-500">
                  Est. {liveStatus.etaNextStop || bus.arrivalTime}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-center">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Progress &amp; Speed
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="font-semibold text-slate-800 text-sm">
                    {liveStatus.progressPercent}% of route
                  </span>
                  {liveStatus.speedKmph !== undefined && (
                    <span className="text-xs text-slate-500 font-mono">
                      ~{liveStatus.speedKmph} km/h
                    </span>
                  )}
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      liveStatus.isGpsLive ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${liveStatus.progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-8 text-slate-500">
              <span className="animate-spin mr-2">
                <RefreshCw className="w-5 h-5 text-indigo-600" />
              </span>
              <span className="text-sm">Calculating route coordinates and status...</span>
            </div>
          )}

          {/* Map */}
          <div>
            <InteractiveMap
              routePolyline={routePolyline}
              origin={origin}
              destination={destination}
              stops={bus.stops}
              busPosition={liveStatus?.currentPosition}
              busHeading={liveStatus?.heading}
              busLabel={bus.serviceNumber}
              isGpsLive={liveStatus?.isGpsLive ?? false}
              className="w-full h-80 rounded-xl"
            />
          </div>

          {/* Timeline of Stops */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Route Stops &amp; Schedule
            </h4>
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {bus.stops.map((stop, idx) => {
                const isOrigin = idx === 0;
                const isDest = idx === bus.stops.length - 1;
                return (
                  <div
                    key={idx}
                    className="flex-shrink-0 flex items-center gap-2 text-xs text-slate-700 bg-white border border-slate-200 px-3 py-2 rounded-lg shadow-2xs"
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        isOrigin
                          ? 'bg-emerald-600'
                          : isDest
                          ? 'bg-rose-600'
                          : 'bg-slate-400'
                      }`}
                    />
                    <div>
                      <p className="font-medium text-slate-900">{stop.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {stop.time} {stop.km !== undefined ? `(km ${stop.km})` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer note */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <div className="flex items-center gap-1.5">
              <span>
                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              </span>
              <span>Refreshes every 8 seconds &bull; Pauses when tab inactive</span>
            </div>
            {lastRefreshedAt && <span>Updated: {lastRefreshedAt}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
