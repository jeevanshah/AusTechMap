"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  LogOut,
  MapPin,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react";
import type {
  AlertFrequency,
  SavedSearch,
  UserAlert,
  WatchlistEntry,
} from "@austechmap/contracts";

import {
  deleteSavedSearchAction,
  markAlertReadAction,
  markAllAlertsReadAction,
  removeWatchlistEntryAction,
  updateSavedSearchFrequencyAction,
} from "../../actions/retentionActions";

interface AccountViewProps {
  user: {
    id: number;
    email: string;
    role: string;
    mfaVerifiedAt?: Date | null;
  };
  initialSavedSearches: SavedSearch[];
  initialWatchlist: WatchlistEntry[];
  initialAlerts: { unreadCount: number; alerts: UserAlert[] };
}

type TabType = "searches" | "watchlist" | "alerts" | "security";

export function AccountView({
  user,
  initialSavedSearches,
  initialWatchlist,
  initialAlerts,
}: AccountViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("searches");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(initialSavedSearches);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>(initialWatchlist);
  const [alerts, setAlerts] = useState<UserAlert[]>(initialAlerts.alerts);
  const [unreadCount, setUnreadCount] = useState<number>(initialAlerts.unreadCount);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const watchedCompanies = watchlist.filter((w) => w.entityType === "company");
  const watchedRegions = watchlist.filter((w) => w.entityType === "region");

  const handleDeleteSearch = (searchId: string) => {
    setActionError(null);
    startTransition(async () => {
      const res = await deleteSavedSearchAction(searchId);
      if (res.success) {
        setSavedSearches((prev) => prev.filter((s) => s.id !== searchId));
      } else {
        setActionError(res.error ?? "Failed to delete search");
      }
    });
  };

  const handleUpdateFrequency = (searchId: string, freq: AlertFrequency) => {
    setActionError(null);
    startTransition(async () => {
      const res = await updateSavedSearchFrequencyAction(searchId, freq);
      if (res.success) {
        setSavedSearches((prev) =>
          prev.map((s) => (s.id === searchId ? { ...s, alertFrequency: freq } : s)),
        );
      } else {
        setActionError(res.error ?? "Failed to update notification frequency");
      }
    });
  };

  const handleRemoveWatch = (entryId: string) => {
    setActionError(null);
    startTransition(async () => {
      const res = await removeWatchlistEntryAction(entryId);
      if (res.success) {
        setWatchlist((prev) => prev.filter((w) => w.id !== entryId));
      } else {
        setActionError(res.error ?? "Failed to remove watchlist item");
      }
    });
  };

  const handleMarkAlertRead = (alertId: string) => {
    startTransition(async () => {
      const res = await markAlertReadAction(alertId);
      if (res.success) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? { ...a, readAt: new Date().toISOString() } : a)),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    });
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      const res = await markAllAlertsReadAction();
      if (res.success) {
        setAlerts((prev) =>
          prev.map((a) => ({ ...a, readAt: a.readAt ?? new Date().toISOString() })),
        );
        setUnreadCount(0);
      }
    });
  };

  const buildSearchHref = (s: SavedSearch): string => {
    const params = new URLSearchParams();
    if (s.filters.query) params.set("q", s.filters.query);
    if (s.filters.category) params.set("category", s.filters.category);
    if (s.filters.roleFamily) params.set("role", s.filters.roleFamily);
    if (s.filters.sponsorship) params.set("sponsorship", s.filters.sponsorship);
    if (s.filters.hiring) params.set("hiring", "true");
    if (s.filters.regional) params.set("regional", "true");
    if (s.filters.remote) params.set("remote", s.filters.remote);
    if (s.filters.hubCity) params.set("hub", s.filters.hubCity);
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Top Header */}
      <div className="mb-8 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-navy-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to National Map</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/api/auth/signout"
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-navy-900 transition-all"
          >
            <LogOut className="h-3.5 w-3.5 text-slate-400" />
            <span>Sign out</span>
          </Link>
        </div>
      </div>

      {/* Account Profile Banner */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-surface-border bg-white p-6 shadow-2xs sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06] bg-center bg-cover [mask-image:radial-gradient(ellipse_at_top_right,black_50%,transparent_90%)]"
          style={{ backgroundImage: "url('/brand/hero_cartography.jpg')" }}
        />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-navy-900 border border-slate-200 shadow-xs">
              <User className="h-7 w-7 text-navy-900" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading text-xl font-bold text-navy-900 sm:text-2xl">
                  {user.email}
                </h1>
                <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  {user.role}
                </span>
                {user.role !== "user" && user.mfaVerifiedAt && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700">
                    <ShieldCheck className="h-3 w-3" />
                    MFA Verified
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Personal discovery portfolio, saved opportunity queries, and watchlist alerts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("alerts")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-terracotta-50 border border-terracotta-200 px-3 py-1.5 text-xs font-semibold text-terracotta-800 hover:bg-terracotta-100 transition-colors"
              >
                <Bell className="h-3.5 w-3.5" />
                <span>{unreadCount} unread update{unreadCount === 1 ? "" : "s"}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {actionError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-900">
          {actionError}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex border-b border-surface-border">
        <button
          type="button"
          onClick={() => setActiveTab("searches")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-colors ${
            activeTab === "searches"
              ? "border-navy-900 text-navy-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Bookmark className="h-4 w-4" />
          <span>Saved Searches</span>
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px]">
            {savedSearches.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("watchlist")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-colors ${
            activeTab === "watchlist"
              ? "border-navy-900 text-navy-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Watchlist</span>
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px]">
            {watchlist.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("alerts")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-colors ${
            activeTab === "alerts"
              ? "border-navy-900 text-navy-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Bell className="h-4 w-4" />
          <span>In-App Alerts</span>
          {unreadCount > 0 ? (
            <span className="ml-1 rounded-full bg-terracotta-700 text-white px-2 py-0.5 font-mono text-[10px] font-bold">
              {unreadCount}
            </span>
          ) : (
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px]">
              {alerts.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-colors ${
            activeTab === "security"
              ? "border-navy-900 text-navy-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>Privacy &amp; Data</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div className="space-y-6">
        {/* TAB 1: SAVED SEARCHES */}
        {activeTab === "searches" && (
          <div>
            {savedSearches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-surface-border bg-white p-12 text-center">
                <Bookmark className="mx-auto h-8 w-8 text-slate-400" />
                <h3 className="mt-3 font-heading text-base font-bold text-navy-900">
                  No saved searches yet
                </h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  When filtering companies or regions on the map, click &quot;Save Search&quot; to
                  bookmark your criteria and receive opportunity alerts.
                </p>
                <div className="mt-5">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition-colors"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>Explore National Map</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {savedSearches.map((search) => (
                  <div
                    key={search.id}
                    className="flex flex-col justify-between rounded-xl border border-surface-border bg-white p-5 shadow-2xs hover:border-slate-300 transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-heading text-sm font-bold text-navy-900 truncate">
                            {search.name}
                          </h3>
                          <span className="font-mono text-[10px] text-slate-400">
                            Saved {new Date(search.createdAt).toLocaleDateString("en-AU")}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSearch(search.id)}
                          disabled={isPending}
                          title="Delete saved search"
                          className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-700 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Filter badges */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {search.filters.query && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            Query: &quot;{search.filters.query}&quot;
                          </span>
                        )}
                        {search.filters.category && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            {search.filters.category}
                          </span>
                        )}
                        {search.filters.hubCity && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            Hub: {search.filters.hubCity}
                          </span>
                        )}
                        {search.filters.sa4Code && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 font-mono">
                            SA4: {search.filters.sa4Code}
                          </span>
                        )}
                        {search.filters.sponsorship && (
                          <span className="rounded bg-terracotta-50 text-terracotta-800 px-2 py-0.5 text-[11px] font-medium border border-terracotta-200/60">
                            482 Sponsor
                          </span>
                        )}
                        {search.filters.regional && (
                          <span className="rounded bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[11px] font-medium border border-emerald-200/60">
                            Regional Hub
                          </span>
                        )}
                        {search.filters.hiring && (
                          <span className="rounded bg-blue-50 text-blue-800 px-2 py-0.5 text-[11px] font-medium">
                            Actively Hiring
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                      {/* Alert Frequency Selector */}
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <select
                          value={search.alertFrequency}
                          onChange={(e) =>
                            handleUpdateFrequency(search.id, e.target.value as AlertFrequency)
                          }
                          disabled={isPending}
                          className="bg-transparent font-medium text-slate-700 hover:text-navy-900 focus:outline-none cursor-pointer text-xs"
                        >
                          <option value="never">No email alerts</option>
                          <option value="daily">Daily digest</option>
                          <option value="weekly">Weekly digest</option>
                          <option value="instant">Instant updates</option>
                        </select>
                      </div>

                      <Link
                        href={buildSearchHref(search)}
                        className="inline-flex items-center gap-1 font-semibold text-terracotta-700 hover:text-terracotta-800 hover:underline"
                      >
                        <span>Run search</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: WATCHLIST */}
        {activeTab === "watchlist" && (
          <div className="space-y-8">
            {watchlist.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-surface-border bg-white p-12 text-center">
                <Building2 className="mx-auto h-8 w-8 text-slate-400" />
                <h3 className="mt-3 font-heading text-base font-bold text-navy-900">
                  Your watchlist is empty
                </h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  Watch technology employers or regional tech hubs to track headcount momentum,
                  new visa sponsorship data, and local ecosystem changes.
                </p>
                <div className="mt-5">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition-colors"
                  >
                    <span>Browse Employers &amp; Hubs</span>
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {/* Watched Employers */}
                <div>
                  <h3 className="mb-3 font-heading text-xs font-bold uppercase tracking-wider text-slate-500">
                    Tracked Employers ({watchedCompanies.length})
                  </h3>
                  {watchedCompanies.length === 0 ? (
                    <p className="text-xs text-slate-400">No employers watched yet.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {watchedCompanies.map((w) => (
                        <div
                          key={w.id}
                          className="flex flex-col justify-between rounded-xl border border-surface-border bg-white p-4 shadow-2xs hover:border-slate-300 transition-all"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <Link
                                  href={`/companies/${w.company?.slug ?? ""}`}
                                  className="font-heading text-sm font-bold text-navy-900 hover:text-terracotta-700 transition-colors truncate block"
                                >
                                  {w.company?.name ?? "Company"}
                                </Link>
                                {w.company?.city && (
                                  <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500 mt-0.5">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    {w.company.city}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveWatch(w.id)}
                                disabled={isPending}
                                title="Unwatch employer"
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-1">
                              {w.company?.primaryCategory && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  {w.company.primaryCategory}
                                </span>
                              )}
                              {w.company?.hasSponsorshipEvidence && (
                                <span className="rounded bg-terracotta-50 text-terracotta-800 px-1.5 py-0.5 text-[10px] font-medium border border-terracotta-200/60">
                                  482 Sponsor
                                </span>
                              )}
                              {w.company?.isRegional && (
                                <span className="rounded bg-emerald-50 text-emerald-800 px-1.5 py-0.5 text-[10px] font-medium border border-emerald-200/60">
                                  Regional
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-[10px] font-mono text-slate-400">Watching</span>
                            <Link
                              href={`/companies/${w.company?.slug ?? ""}`}
                              className="inline-flex items-center gap-1 font-semibold text-terracotta-700 hover:text-terracotta-800"
                            >
                              <span>Profile</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Watched Regions */}
                <div>
                  <h3 className="mb-3 font-heading text-xs font-bold uppercase tracking-wider text-slate-500">
                    Tracked Regional Tech Hubs ({watchedRegions.length})
                  </h3>
                  {watchedRegions.length === 0 ? (
                    <p className="text-xs text-slate-400">No regional hubs watched yet.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {watchedRegions.map((w) => (
                        <div
                          key={w.id}
                          className="flex flex-col justify-between rounded-xl border border-surface-border bg-white p-4 shadow-2xs hover:border-slate-300 transition-all"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <span className="font-mono text-[10px] font-bold text-slate-400 uppercase">
                                  ABS SA4 {w.sa4Code ?? w.region?.code}
                                </span>
                                <h4 className="font-heading text-sm font-bold text-navy-900 truncate">
                                  {w.region?.name ?? `SA4 Region ${w.sa4Code}`}
                                </h4>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveWatch(w.id)}
                                disabled={isPending}
                                title="Unwatch region"
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {w.region?.opportunityScore !== undefined && (
                              <div className="mt-3 flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-navy-900">
                                  Score: {w.region.opportunityScore ?? "N/A"}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  Regional labour index
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-[10px] font-mono text-slate-400">Watching</span>
                            <Link
                              href={`/regions/${w.sa4Code ?? w.region?.code ?? ""}`}
                              className="inline-flex items-center gap-1 font-semibold text-terracotta-700 hover:text-terracotta-800"
                            >
                              <span>Report</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: IN-APP ALERTS */}
        {activeTab === "alerts" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {alerts.length} total event{alerts.length === 1 ? "" : "s"}
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Mark all as read</span>
                </button>
              )}
            </div>

            {alerts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-surface-border bg-white p-12 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                <h3 className="mt-3 font-heading text-base font-bold text-navy-900">
                  You&apos;re all caught up
                </h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  New verified employer sponsorships, active tech vacancies, and regional labour
                  market changes will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-surface-border bg-white shadow-2xs">
                {alerts.map((alert) => {
                  const isUnread = !alert.readAt;
                  return (
                    <div
                      key={alert.id}
                      className={`flex items-start justify-between gap-4 p-4 transition-colors ${
                        isUnread ? "bg-slate-50/70" : "hover:bg-slate-50/40"
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                            isUnread
                              ? "bg-terracotta-700 text-white border-terracotta-700"
                              : "bg-slate-100 text-slate-500 border-slate-200"
                          }`}
                        >
                          <Bell className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-heading text-xs font-bold text-navy-900 truncate">
                              {alert.title}
                            </h4>
                            {isUnread && (
                              <span className="h-1.5 w-1.5 rounded-full bg-terracotta-700 shrink-0" />
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                            {alert.message}
                          </p>
                          <div className="mt-2 flex items-center gap-3">
                            <span className="font-mono text-[10px] text-slate-400">
                              {new Date(alert.createdAt).toLocaleString("en-AU")}
                            </span>
                            {alert.link && (
                              <Link
                                href={alert.link}
                                onClick={() => isUnread && handleMarkAlertRead(alert.id)}
                                className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-terracotta-700 hover:underline"
                              >
                                <span>Inspect</span>
                                <ArrowUpRight className="h-2.5 w-2.5" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>

                      {isUnread && (
                        <button
                          type="button"
                          onClick={() => handleMarkAlertRead(alert.id)}
                          disabled={isPending}
                          title="Mark as read"
                          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PRIVACY & DATA */}
        {activeTab === "security" && (
          <div className="rounded-xl border border-surface-border bg-white p-6 shadow-2xs space-y-6">
            <div>
              <h3 className="font-heading text-base font-bold text-navy-900">
                Australian Privacy Principles &amp; Data Control
              </h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed max-w-2xl">
                Australia Tech Map follows APP 11 standards: personal data is collected solely to
                power your saved searches, watchlists, and delivery preferences. You hold full
                control to delete your account and immediately purge all associated state at any
                time.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-heading text-xs font-bold text-navy-900">
                    Delete Account &amp; Purge Personal Data
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Permanently disable your account, purge saved searches, watchlists, and
                    undelivered alerts, and record a tombstone audit ledger.
                  </p>
                </div>
                <Link
                  href="/account/delete"
                  className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 shadow-2xs hover:bg-red-50 transition-colors shrink-0"
                >
                  Delete Account
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
