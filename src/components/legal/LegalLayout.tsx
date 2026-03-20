import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";

interface LegalLayoutProps {
  title: string;
  updated: string;
  summary: string;
  contactEmail: string;
  highlights: Array<{ label: string; value: string }>;
  children: ReactNode;
}

export const LegalLayout = ({
  title,
  updated,
  summary,
  contactEmail,
  highlights,
  children,
}: LegalLayoutProps) => {
  return (
    <div className="min-h-screen text-foreground">
      <Navbar />
      <main className="relative overflow-hidden px-4 pb-16 pt-28 sm:px-6">
        <div className="absolute inset-0 bg-radial-gradient" />
        <div className="absolute inset-0 gf-grid-overlay opacity-[0.1]" />

        <div className="relative mx-auto max-w-[1040px]">
          <Button variant="ghost" size="sm" className="mb-6" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>
          </Button>

          <section className="rounded-[28px] gf-panel p-6 sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Trust center
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">{title}</h1>
            <p className="mt-3 max-w-3xl text-[0.98rem] leading-7 text-white/60">{summary}</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[18px] bg-white/[0.04] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/34">Last updated</div>
                <div className="mt-1 text-sm font-medium text-white">{updated}</div>
              </div>
              <div className="rounded-[18px] bg-white/[0.04] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/34">Contact</div>
                <a
                  href={`mailto:${contactEmail}`}
                  className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-primary transition hover:text-white"
                >
                  <Mail className="h-4 w-4" />
                  {contactEmail}
                </a>
              </div>
              {highlights.slice(0, 2).map((item) => (
                <div key={item.label} className="rounded-[18px] bg-white/[0.04] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/34">{item.label}</div>
                  <div className="mt-1 text-sm leading-6 text-white/66">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-8 space-y-8 text-[0.98rem] leading-7 text-white/66 [&_a]:font-medium [&_a]:text-primary [&_a]:transition [&_a]:hover:text-white [&_h2]:text-[1.08rem] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-white [&_li]:mb-2 [&_section]:space-y-3 [&_strong]:font-semibold [&_strong]:text-white [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
              {children}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
