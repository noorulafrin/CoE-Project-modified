import React, { useState } from 'react';
import {
  Navigation,
  ChevronDown,
  ChevronUp,
  Zap,
  Wind,
  Ticket,
  Clock,
  MapPin,
} from 'lucide-react';
import type { BusService } from '../types.js';

interface BusCardProps {
  bus: BusService;
  onTrack: (bus: BusService) => void;
  onBook: (bus: BusService) => void;
}

export const BusCard: React.FC<BusCardProps> = ({ bus, onTrack, onBook }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Format duration into hours and minutes
  const hours = Math.floor(bus.durationMinutes / 60);
  const mins = bus.durationMinutes % 60;
  const durationText = `${hours}h ${mins > 0 ? `${mins}m` : ''}`.trim();

  const isSimulated = bus.dataSource === 'SIMULATED';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all overflow-hidden">
      <div className="p-5 sm:p-6">
        {/* Top Header: Operator & Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <h3 className="font-bold text-slate-900 text-base sm:text-lg">
              {bus.operatorName}
            </h3>
            <span className="text-xs font-mono font-medium px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
              {bus.serviceNumber}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isSimulated ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                Simulated
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                Official GTFS
              </span>
            )}
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {bus.operatorType === 'GOVERNMENT' ? 'State Transport' : 'Private Coach'}
            </span>
          </div>
        </div>

        {/* Bus Type and Tags */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mb-5">
          <span className="font-medium text-slate-800">{bus.busType}</span>
          <span>&bull;</span>
          <span className="capitalize">{bus.category.toLowerCase().replace('_', ' ')}</span>
          {bus.isAc && (
            <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 px-2 py-0.5 rounded">
              <span>
                <Wind className="w-3 h-3" />
              </span>
              <span>AC</span>
            </span>
          )}
          {bus.isElectric && (
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
              <span>
                <Zap className="w-3 h-3" />
              </span>
              <span>Electric EV</span>
            </span>
          )}
        </div>

        {/* Main Info: Timings, Duration, Fare */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-3 border-y border-slate-100 items-center">
          {/* Departure & Arrival */}
          <div className="sm:col-span-2 flex items-center justify-between sm:justify-start sm:gap-8">
            <div>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {bus.departureTime}
              </p>
              <p className="text-xs text-slate-500 font-medium">Departure</p>
            </div>

            <div className="flex flex-col items-center px-2">
              <span className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                <span>
                  <Clock className="w-3 h-3" />
                </span>
                <span>{durationText}</span>
              </span>
              <div className="w-24 sm:w-28 relative flex items-center">
                <div className="w-full border-t border-slate-300" />
                <div className="absolute right-0 w-2 h-2 rounded-full bg-slate-400" />
              </div>
              <span className="text-[10px] text-slate-400 mt-1">
                {bus.stopsCount} stops
              </span>
            </div>

            <div>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {bus.arrivalTime}
              </p>
              <p className="text-xs text-slate-500 font-medium">Arrival</p>
            </div>
          </div>

          {/* Fare Section */}
          <div className="text-left sm:text-right flex flex-col justify-center">
            <span className="text-lg sm:text-xl font-extrabold text-slate-900">
              {bus.fareEstimate}
            </span>
            <span className="text-xs text-slate-500">
              {bus.fareEstimate.startsWith('~') ? 'Estimated fare' : 'Fare note'}
            </span>
            {isSimulated && bus.availableSeats !== undefined && (
              <span className="text-[11px] text-emerald-700 font-medium mt-0.5">
                {bus.availableSeats} demo seats left
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
          >
            <span>{isExpanded ? 'Hide route stops' : `View ${bus.stopsCount} stops`}</span>
            <span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </span>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => onTrack(bus)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition"
            >
              <span>
                <Navigation className="w-3.5 h-3.5" />
              </span>
              <span>Live Track</span>
            </button>

            <button
              onClick={() => onBook(bus)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-2xs"
            >
              <span>
                <Ticket className="w-3.5 h-3.5" />
              </span>
              <span>{isSimulated ? 'Select Seats' : 'Operator Info'}</span>
            </button>
          </div>
        </div>

        {/* Expandable Stops View */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50 rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Route Stoppages
            </h4>
            <div className="space-y-2">
              {bus.stops.map((stop, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">
                      <MapPin className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-medium">{stop.name}</span>
                    {stop.km !== undefined && (
                      <span className="text-[11px] text-slate-400">(km {stop.km})</span>
                    )}
                  </div>
                  <span className="font-mono text-slate-500 font-medium">{stop.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
