"use client";

import { useState } from "react";

export function ConfirmButton({
  label,
  confirmTitle,
  confirmMessage,
  className,
  onConfirm
}: {
  label: string;
  confirmTitle: string;
  confirmMessage: string;
  className?: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className={className ?? "button secondary"} onClick={() => setOpen(true)} type="button">
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={confirmTitle}
          >
            <h3 className="text-lg font-semibold">{confirmTitle}</h3>
            <p className="mt-2 text-sm text-slate-600">{confirmMessage}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="button secondary" onClick={() => setOpen(false)} type="button">
                Cancel
              </button>
              <button
                className="button"
                onClick={() => {
                  setOpen(false);
                  onConfirm();
                }}
                type="button"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ConfirmFormButton({
  label,
  confirmTitle,
  confirmMessage,
  className,
  formAction,
  hiddenFields
}: {
  label: string;
  confirmTitle: string;
  confirmMessage: string;
  className?: string;
  formAction: string;
  hiddenFields?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className={className ?? "button secondary"} onClick={() => setOpen(true)} type="button">
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={confirmTitle}
          >
            <h3 className="text-lg font-semibold">{confirmTitle}</h3>
            <p className="mt-2 text-sm text-slate-600">{confirmMessage}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="button secondary" onClick={() => setOpen(false)} type="button">
                Cancel
              </button>
              <form action={formAction} method="post">
                {hiddenFields &&
                  Object.entries(hiddenFields).map(([name, value]) => (
                    <input key={name} name={name} type="hidden" value={value} />
                  ))}
                <button className="button" type="submit">
                  Confirm
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
