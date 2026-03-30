"use client";

import { useMemo, useState } from "react";

type Option = {
  id: string;
  label: string;
};

type LineItemInput = {
  projectId: string;
  languagePairId: string;
  hours: string;
  note: string;
};

const emptyItem = (projectId = "", languagePairId = ""): LineItemInput => ({
  projectId,
  languagePairId,
  hours: "",
  note: ""
});

export function TimesheetForm({
  action,
  disabled,
  periodStart,
  periodEnd,
  projects,
  languagePairs,
  initialItems
}: {
  action: string;
  disabled: boolean;
  periodStart: string;
  periodEnd: string;
  projects: Option[];
  languagePairs: Option[];
  initialItems: LineItemInput[];
}) {
  const [items, setItems] = useState<LineItemInput[]>(
    initialItems.length > 0
      ? initialItems
      : [emptyItem(projects[0]?.id ?? "", languagePairs[0]?.id ?? "")]
  );

  const totalHours = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item.hours) || 0), 0),
    [items]
  );

  const updateItem = (index: number, nextItem: LineItemInput) => {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? nextItem : item)));
  };

  const removeItem = (index: number) => {
    setItems((current) =>
      current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const addItem = () => {
    setItems((current) => [...current, emptyItem(projects[0]?.id ?? "", languagePairs[0]?.id ?? "")]);
  };

  return (
    <form action={action} className="mt-5 grid gap-4" method="post">
      <input name="periodStart" type="hidden" value={periodStart} />
      <input name="periodEnd" type="hidden" value={periodEnd} />
      <input name="lineItemsJson" type="hidden" value={JSON.stringify(items)} />

      <div className="space-y-4">
        {items.map((item, index) => (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" key={`line-item-${index}`}>
            <div className="grid-auto">
              <div className="field">
                <label htmlFor={`project-${index}`}>Project or client</label>
                <select
                  id={`project-${index}`}
                  onChange={(event) => updateItem(index, { ...item, projectId: event.target.value })}
                  value={item.projectId}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`language-pair-${index}`}>Language pair</label>
                <select
                  id={`language-pair-${index}`}
                  onChange={(event) => updateItem(index, { ...item, languagePairId: event.target.value })}
                  value={item.languagePairId}
                >
                  {languagePairs.map((languagePair) => (
                    <option key={languagePair.id} value={languagePair.id}>
                      {languagePair.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`hours-${index}`}>Hours</label>
                <input
                  id={`hours-${index}`}
                  max="24"
                  min="0.25"
                  onChange={(event) => updateItem(index, { ...item, hours: event.target.value })}
                  step="0.25"
                  type="number"
                  value={item.hours}
                />
              </div>
            </div>
            <div className="mt-4 field">
              <label htmlFor={`note-${index}`}>Note</label>
              <textarea
                id={`note-${index}`}
                onChange={(event) => updateItem(index, { ...item, note: event.target.value })}
                placeholder="Optional note for payroll context"
                rows={3}
                value={item.note}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">Line total: {Number(item.hours || 0).toFixed(2)} hours</p>
              <button
                className="button secondary"
                onClick={() => removeItem(index)}
                type="button"
              >
                Remove line
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Running total</p>
          <p className="text-2xl font-semibold">{totalHours.toFixed(2)} hours</p>
        </div>
        <button className="button secondary" onClick={addItem} type="button">
          Add line item
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="button secondary" disabled={disabled} name="mode" type="submit" value="draft">
          {disabled ? "Awaiting admin activation" : "Save draft"}
        </button>
        <button className="button" disabled={disabled} name="mode" type="submit" value="submit">
          {disabled ? "Awaiting admin activation" : "Submit timesheet"}
        </button>
      </div>
    </form>
  );
}
