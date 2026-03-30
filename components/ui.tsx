import { clsx } from "clsx";
import { ReactNode } from "react";

export const PageShell = ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
  <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
    <header className="space-y-2">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">Courant</p>
      <h1 className="text-4xl font-semibold tracking-tight text-slate-950">{title}</h1>
      <p className="max-w-3xl text-sm leading-7 text-slate-600">{description}</p>
    </header>
    {children}
  </main>
);

export const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <section className={clsx("rounded-3xl border border-slate-200 bg-white p-6 shadow-sm", className)}>{children}</section>
);

export const Badge = ({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "warning" | "danger" }) => {
  const tones = {
    default: "bg-slate-100 text-slate-700",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-rose-100 text-rose-800"
  };

  return <span className={clsx("inline-flex rounded-full px-3 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
};
