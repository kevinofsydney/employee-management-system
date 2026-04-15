import { clsx } from "clsx";
import { ReactNode } from "react";

export const PageShell = ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
  <main className="page-shell">
    <header className="page-header">
      <p className="page-kicker">Courant</p>
      <h1 className="page-title">{title}</h1>
      <p className="page-description">{description}</p>
    </header>
    {children}
  </main>
);

export const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <section className={clsx("card", className)}>{children}</section>
);

export const Badge = ({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "warning" | "danger" }) => {
  return <span className={clsx("badge", tone !== "default" && tone)}>{children}</span>;
};
