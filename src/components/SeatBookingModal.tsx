import React, { useState } from 'react';
import { X, CheckCircle2, AlertTriangle, ExternalLink, ShieldCheck } from 'lucide-react';
import type { BusService, DemoBookingResponse } from '../types.js';

interface SeatBookingModalProps {
  bus: BusService;
  onClose: () => void;
}

export const SeatBookingModal: React.FC<SeatBookingModalProps> = ({ bus, onClose }) => {
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [passengerEmail, setPassengerEmail] = useState('');
  const [boardingPoint, setBoardingPoint] = useState(bus.stops[0]?.name || 'Origin Bus Terminal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState<DemoBookingResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const isRealGtfs = bus.dataSource === 'GTFS';

  // Toggle seat selection
  const handleToggleSeat = (seatId: string) => {
    if (selectedSeats.includes(seatId)) {
      setSelectedSeats(selectedSeats.filter((s) => s !== seatId));
    } else {
      if (selectedSeats.length >= 6) {
        setFormError('You can select up to 6 seats in this demo.');
        return;
      }
      setFormError(null);
      setSelectedSeats([...selectedSeats, seatId]);
    }
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSeats.length === 0) {
      setFormError('Please select at least one seat.');
      return;
    }
    if (!passengerName.trim()) {
      setFormError('Please enter the passenger name.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch('/api/buses/book-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          busId: bus.id,
          serviceNumber: bus.serviceNumber,
          seatNumbers: selectedSeats,
          passengerName: passengerName.trim(),
          passengerEmail,
          passengerPhone,
          boardingPoint,
        }),
      });

      if (!res.ok) {
        throw new Error('Demo booking request failed');
      }

      const data: DemoBookingResponse = await res.json();
      setBookingResult(data);
    } catch {
      setFormError('Could not record demo booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate a mock 2x2 layout of 24 to 32 seats
  const totalDemoSeats = bus.category === 'SLEEPER' ? 24 : 32;
  const seats = Array.from({ length: totalDemoSeats }, (_, i) => {
    const num = i + 1;
    const seatId = bus.category === 'SLEEPER' ? `B${num}` : `S${num}`;
    // Pseudo-random unavailable seats based on bus ID
    const isOccupied = (num * 7 + bus.serviceNumber.length) % 5 === 0;
    return { id: seatId, isOccupied };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg text-slate-900">
                {isRealGtfs ? 'Operator Booking Portal' : 'Demo Seat Reservation'}
              </h3>
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium border border-amber-200">
                Demo Only
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {bus.operatorName} &bull; {bus.serviceNumber} ({bus.busType})
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

        {/* Demo Notice Banner */}
        <div className="bg-amber-50 px-6 py-2.5 border-b border-amber-100 flex items-center gap-2 text-xs text-amber-900">
          <span className="shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </span>
          <span>
            <strong>Simulation Notice:</strong> This is a simulation sandbox. No real payment, seat reservation, or ticket is processed.
          </span>
        </div>

        {/* Content */}
        <div className="p-6">
          {bookingResult ? (
            /* Success confirmation screen */
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h4 className="text-xl font-bold text-slate-900">Demo Booking Recorded</h4>
              <p className="text-sm font-medium text-slate-600 max-w-md mx-auto">
                {bookingResult.message}
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-w-sm mx-auto text-left space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Booking Reference:</span>
                  <span className="font-mono font-bold text-indigo-700">
                    {bookingResult.bookingId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Passenger:</span>
                  <span className="font-medium text-slate-800">
                    {bookingResult.passengerName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Selected Seats:</span>
                  <span className="font-mono font-medium text-slate-800">
                    {bookingResult.seatNumbers.join(', ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Departure:</span>
                  <span className="font-medium text-slate-800">{bus.departureTime}</span>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition"
                >
                  Done
                </button>
              </div>
            </div>
          ) : isRealGtfs ? (
            /* Real GTFS bus - booking redirect or notice */
            <div className="py-6 space-y-4 text-center">
              <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-slate-900">Official Scheduled Transit Trip</h4>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                This timetable is published from real GTFS transit schedules. Direct seat ticketing is handled by the official transport authority.
              </p>

              {bus.bookingUrl ? (
                <div className="pt-2">
                  <a
                    href={bus.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition shadow-sm"
                  >
                    <span>Book with Operator</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <p className="text-xs text-slate-400 mt-2">
                    Opens the official portal ({new URL(bus.bookingUrl).hostname})
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200 max-w-md mx-auto">
                  Tickets can be purchased at designated station counters or via the state RTC mobile app.
                </div>
              )}

              <div className="pt-4">
                <button
                  onClick={onClose}
                  className="px-5 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Simulated bus seat selection form */
            <form onSubmit={handleSubmitBooking} className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Select Seats ({selectedSeats.length} selected)
                  </label>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-white border border-slate-300 rounded-xs" /> Available
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-indigo-600 rounded-xs" /> Selected
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-slate-200 rounded-xs" /> Taken
                    </span>
                  </div>
                </div>

                {/* Seat Grid */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex justify-end mb-2">
                    <span className="text-[11px] text-slate-400 uppercase font-medium mr-2">
                      Front / Driver &rarr;
                    </span>
                  </div>
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
                    {seats.map((seat) => {
                      const isSelected = selectedSeats.includes(seat.id);
                      return (
                        <button
                          key={seat.id}
                          type="button"
                          disabled={seat.isOccupied}
                          onClick={() => handleToggleSeat(seat.id)}
                          className={`h-9 rounded-md text-xs font-mono font-medium border flex items-center justify-center transition-all ${
                            seat.isOccupied
                              ? 'bg-slate-200 border-slate-200 text-slate-400 cursor-not-allowed'
                              : isSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                              : 'bg-white border-slate-300 text-slate-700 hover:border-indigo-400'
                          }`}
                        >
                          {seat.id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Passenger Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Passenger Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={passengerName}
                    onChange={(e) => setPassengerName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number (Demo)
                  </label>
                  <input
                    type="tel"
                    value={passengerPhone}
                    onChange={(e) => setPassengerPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Boarding Point
                </label>
                <select
                  value={boardingPoint}
                  onChange={(e) => setBoardingPoint(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                >
                  {bus.stops.map((s, idx) => (
                    <option key={idx} value={s.name}>
                      {s.name} ({s.time})
                    </option>
                  ))}
                </select>
              </div>

              {formError && (
                <p className="text-xs text-rose-600 font-medium">{formError}</p>
              )}

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-sm font-semibold transition shadow-xs"
                >
                  {isSubmitting ? 'Recording...' : 'Confirm Demo Booking'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
