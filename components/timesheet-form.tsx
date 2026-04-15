"use client";

import { useMemo, useState } from "react";

type EventOption = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  city: string;
};

const RATE_TYPES = [
  { value: "STANDARD", label: "Standard" },
  { value: "SUNDAY", label: "Sunday" },
  { value: "OVERTIME", label: "Overtime" },
  { value: "PUBLIC_HOLIDAY", label: "Public Holiday" }
];

function roundStartDown(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const rounded = Math.floor(m / 15) * 15;
  return `${String(h).padStart(2, "0")}:${String(rounded).padStart(2, "0")}`;
}

function roundEndUp(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (m % 15 === 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const rounded = Math.ceil(m / 15) * 15;
  if (rounded >= 60) return `${String(h + 1).padStart(2, "0")}:00`;
  return `${String(h).padStart(2, "0")}:${String(rounded).padStart(2, "0")}`;
}

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

export function TimesheetForm({
  action,
  disabled,
  events,
  editEntry
}: {
  action: string;
  disabled: boolean;
  events: EventOption[];
  editEntry?: {
    id: string;
    eventId: string;
    date: string;
    startTime: string;
    endTime: string;
    rateType: string;
    comment: string;
  };
}) {
  const isEdit = Boolean(editEntry);
  const [eventId, setEventId] = useState(editEntry?.eventId ?? events[0]?.id ?? "");
  const [date, setDate] = useState(editEntry?.date ?? "");
  const [startTime, setStartTime] = useState(editEntry?.startTime ?? "");
  const [endTime, setEndTime] = useState(editEntry?.endTime ?? "");
  const [rateType, setRateType] = useState(editEntry?.rateType ?? "STANDARD");
  const [comment, setComment] = useState(editEntry?.comment ?? "");

  const selectedEvent = events.find((e) => e.id === eventId);

  const roundedStart = useMemo(() => startTime ? roundStartDown(startTime) : "", [startTime]);
  const roundedEnd = useMemo(() => endTime ? roundEndUp(endTime) : "", [endTime]);
  const hours = useMemo(() => calcHours(roundedStart, roundedEnd), [roundedStart, roundedEnd]);

  return (
    <form action={action} className="mt-5 grid gap-4" method="post">
      {isEdit && <input name="entryId" type="hidden" value={editEntry!.id} />}
      <input name="eventId" type="hidden" value={eventId} />
      <input name="startTime" type="hidden" value={roundedStart} />
      <input name="endTime" type="hidden" value={roundedEnd} />
      <input name="rateType" type="hidden" value={rateType} />

      <div className="grid-auto">
        <div className="field">
          <label htmlFor="ts-event">Event</label>
          <select
            id="ts-event"
            onChange={(e) => setEventId(e.target.value)}
            value={eventId}
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name} ({event.city})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ts-date">Date</label>
          <input
            id="ts-date"
            max={selectedEvent?.endDate}
            min={selectedEvent?.startDate}
            name="date"
            onChange={(e) => setDate(e.target.value)}
            required
            type="date"
            value={date}
          />
        </div>
      </div>

      <div className="grid-auto">
        <div className="field">
          <label htmlFor="ts-start">Start time</label>
          <input
            id="ts-start"
            onChange={(e) => setStartTime(e.target.value)}
            required
            step="60"
            type="time"
            value={startTime}
          />
          {startTime && startTime !== roundedStart && (
            <p className="mt-1 text-xs text-sky-700">Rounded down to {roundedStart}</p>
          )}
        </div>
        <div className="field">
          <label htmlFor="ts-end">End time</label>
          <input
            id="ts-end"
            onChange={(e) => setEndTime(e.target.value)}
            required
            step="60"
            type="time"
            value={endTime}
          />
          {endTime && endTime !== roundedEnd && (
            <p className="mt-1 text-xs text-sky-700">Rounded up to {roundedEnd}</p>
          )}
        </div>
        <div className="field">
          <label htmlFor="ts-rate">Rate type</label>
          <select id="ts-rate" onChange={(e) => setRateType(e.target.value)} value={rateType}>
            {RATE_TYPES.map((rt) => (
              <option key={rt.value} value={rt.value}>{rt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="ts-comment">Comment (optional)</label>
        <textarea
          id="ts-comment"
          maxLength={2000}
          name="comment"
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional comment"
          rows={2}
          value={comment}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Calculated hours</p>
          <p className="text-2xl font-semibold">{hours.toFixed(2)} hours</p>
        </div>
        <button className="button" disabled={disabled || hours <= 0} type="submit">
          {disabled ? "Awaiting admin activation" : isEdit ? "Update entry" : "Submit entry"}
        </button>
      </div>
    </form>
  );
}
