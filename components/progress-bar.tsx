import { clsx } from "clsx";

type Step = {
  label: string;
  status: "not_started" | "in_progress" | "complete";
};

export function ProgressBar({ steps }: { steps: Step[] }) {
  const completedCount = steps.filter((s) => s.status === "complete").length;
  const percentage = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-sm font-semibold text-slate-600">{percentage}%</span>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => (
          <li
            className={clsx(
              "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium",
              step.status === "complete" && "border-emerald-200 bg-emerald-50 text-emerald-800",
              step.status === "in_progress" && "border-sky-200 bg-sky-50 text-sky-800",
              step.status === "not_started" && "border-slate-200 bg-slate-50 text-slate-500"
            )}
            key={step.label}
          >
            <span
              className={clsx(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                step.status === "complete" && "bg-emerald-500",
                step.status === "in_progress" && "bg-sky-500",
                step.status === "not_started" && "bg-slate-300"
              )}
            >
              {step.status === "complete" ? "\u2713" : index + 1}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
