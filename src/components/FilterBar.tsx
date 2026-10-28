import React from 'react';
import { SlidersHorizontal, ArrowUpDown } from 'lucide-react';

export type OperatorFilter = 'ALL' | 'GOVERNMENT' | 'PRIVATE';
export type ClassFilter = 'ALL' | 'AC' | 'NON_AC' | 'SLEEPER' | 'SEATER' | 'ELECTRIC';
export type TimeFilter = 'ALL' | 'MORNING' | 'AFTERNOON' | 'EVENING_NIGHT';
export type SortOption =
  | 'DEPARTURE_ASC'
  | 'DEPARTURE_DESC'
  | 'DURATION_ASC'
  | 'FARE_ASC'
  | 'FARE_DESC';

interface FilterBarProps {
  totalCount: number;
  filteredCount: number;
  operatorFilter: OperatorFilter;
  setOperatorFilter: (v: OperatorFilter) => void;
  classFilter: ClassFilter;
  setClassFilter: (v: ClassFilter) => void;
  timeFilter: TimeFilter;
  setTimeFilter: (v: TimeFilter) => void;
  sortBy: SortOption;
  setSortBy: (v: SortOption) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  totalCount,
  filteredCount,
  operatorFilter,
  setOperatorFilter,
  classFilter,
  setClassFilter,
  timeFilter,
  setTimeFilter,
  sortBy,
  setSortBy,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
      {/* Top summary & Sort */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">
            <SlidersHorizontal className="w-4 h-4" />
          </span>
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Filters &amp; Sort
          </span>
          <span className="text-xs text-slate-500 font-medium ml-1">
            (Showing {filteredCount} of {totalCount} buses)
          </span>
        </div>

        {/* Sort selector (strictly durationMinutes, departure, fare; NO "Top Rated") */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400">
            <ArrowUpDown className="w-3.5 h-3.5" />
          </span>
          <label htmlFor="sort-select" className="text-xs text-slate-500 font-medium">
            Sort by:
          </label>
          <select
            id="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="DEPARTURE_ASC">Departure: Earliest first</option>
            <option value="DEPARTURE_DESC">Departure: Latest first</option>
            <option value="DURATION_ASC">Duration: Shortest first</option>
            <option value="FARE_ASC">Fare: Lowest first</option>
            <option value="FARE_DESC">Fare: Highest first</option>
          </select>
        </div>
      </div>

      {/* Filter Buttons row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Operator Filter */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Operator
          </label>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              onClick={() => setOperatorFilter('ALL')}
              className={`flex-1 py-1 rounded-md font-medium transition ${
                operatorFilter === 'ALL'
                  ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setOperatorFilter('GOVERNMENT')}
              className={`flex-1 py-1 rounded-md font-medium transition ${
                operatorFilter === 'GOVERNMENT'
                  ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Govt RTC
            </button>
            <button
              onClick={() => setOperatorFilter('PRIVATE')}
              className={`flex-1 py-1 rounded-md font-medium transition ${
                operatorFilter === 'PRIVATE'
                  ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Private
            </button>
          </div>
        </div>

        {/* Class Filter */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Bus Class
          </label>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value as ClassFilter)}
            className="w-full text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="AC">AC Coaches</option>
            <option value="NON_AC">Non-AC Coaches</option>
            <option value="SLEEPER">Sleeper</option>
            <option value="SEATER">Seater</option>
            <option value="ELECTRIC">Electric (EV)</option>
          </select>
        </div>

        {/* Departure Time of Day Filter */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Departure Window
          </label>
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
            className="w-full text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">Any Time</option>
            <option value="MORNING">Morning (06:00 - 12:00)</option>
            <option value="AFTERNOON">Afternoon (12:00 - 18:00)</option>
            <option value="EVENING_NIGHT">Evening / Night (18:00 - 06:00)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
