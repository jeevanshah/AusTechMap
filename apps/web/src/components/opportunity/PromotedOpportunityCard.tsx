"use client";

import Link from "next/link";
import { Sparkles, ArrowRight, ShieldCheck } from "lucide-react";
import type { SponsoredPlacement } from "@austechmap/contracts";

interface PromotedOpportunityCardProps {
  placement: SponsoredPlacement;
}

/**
 * Renders a quarantined, visibly separate sponsored employer placement.
 *
 * SPECIFICATION INVARIANT (PRODUCT_SPEC.md §18.7):
 * Paid placements are strictly separated from organic Opportunity Match results.
 * Payment never alters the organic 100-point Opportunity Match algorithm,
 * Home Affairs verification evidence, or regional opportunity scores.
 */
export function PromotedOpportunityCard({ placement }: PromotedOpportunityCardProps) {
  const targetUrl = placement.ctaUrl || (placement.companySlug ? `/companies/${placement.companySlug}` : "#");

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-50/60 via-orange-50/30 to-amber-50/40 p-4 shadow-sm transition-all hover:border-amber-400 dark:border-amber-500/30 dark:from-amber-950/20 dark:to-orange-950/10">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 pb-2.5 dark:border-amber-500/20">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-900 uppercase dark:bg-amber-900/60 dark:text-amber-200">
            <Sparkles className="h-2.5 w-2.5 text-amber-600 dark:text-amber-300" />
            Promoted Partner
          </span>
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
            {placement.companyName}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-amber-900/70 dark:text-amber-300/80">
          <ShieldCheck className="h-3 w-3 text-emerald-600" />
          <span>Verified Organisation</span>
        </div>
      </div>

      <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
            {placement.headline}
          </h4>
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            {placement.campaignName}
          </p>
        </div>

        <Link
          href={targetUrl}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        >
          <span>{placement.ctaLabel}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-3 border-t border-amber-200/40 pt-2 text-[10px] text-slate-500 dark:text-slate-400">
        <em>Independent Ranking Disclosure:</em> Promoted placement does not alter organic Opportunity Match scores or Home Affairs sponsorship evidence.
      </div>
    </div>
  );
}
