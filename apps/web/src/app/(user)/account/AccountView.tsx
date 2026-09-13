"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BellOff,
  BellRing,
  Bookmark,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Info,
  LogOut,
  MapPin,
  MessageSquare,
  Pause,
  PauseCircle,
  Play,
  PlayCircle,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Zap,
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
  pauseAllSavedSearchesAction,
  removeWatchlistEntryAction,
  resumeAllSavedSearchesAction,
  toggleWatchlistMuteAction,
  updateSavedSearchFrequencyAction,
  updateWatchlistNotesAction,
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
type WatchlistFilterType = "all" | "employers" | "regions";

interface WatchlistNoteMeta {
  muted?: boolean;
  memo?: string;
}

function parseWatchlistNotes(rawNotes?: string | null): WatchlistNoteMeta {
  if (!rawNotes) return {};
  try {
    const parsed = JSON.parse(rawNotes);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as WatchlistNoteMeta;
    }
    return { memo: rawNotes };
  } catch {
    return { memo: rawNotes };
  }
}

export function AccountView({
  user,
  initialSavedSearches,
  initialWatchlist,
  initialAlerts,
}: AccountViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("searches");
  const [watchlistSubTab, setWatchlistSubTab] =
    useState<WatchlistFilterType>("all");

  const [savedSearches, setSavedSearches] =
    useState<SavedSearch[]>(initialSavedSearches);
  const [watchlist, setWatchlist] =
    useState<WatchlistEntry[]>(initialWatchlist);
  const [alerts, setAlerts] = useState<UserAlert[]>(initialAlerts.alerts);
  const [unreadCount, setUnreadCount] = useState<number>(
    initialAlerts.unreadCount,
  );

  // Stash last non-never frequency for quick 1-click resume
  const [cachedFrequencies, setCachedFrequencies] = useState<
    Record<string, AlertFrequency>
  >({});

  // Editing note state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>("");

  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 4000);
  };

  const watchedCompanies = useMemo(
    () => watchlist.filter((w) => w.entityType === "company"),
    [watchlist],
  );
  const watchedRegions = useMemo(
    () => watchlist.filter((w) => w.entityType === "region"),
    [watchlist],
  );

  const activeSearchesCount = useMemo(
    () => savedSearches.filter((s) => s.alertFrequency !== "never").length,
    [savedSearches],
  );
  const pausedSearchesCount = useMemo(
    () => savedSearches.filter((s) => s.alertFrequency === "never").length,
    [savedSearches],
  );

  // --- Saved Searches Handlers ---
  const handleDeleteSearch = (searchId: string, searchName: string) => {
    setActionError(null);
    startTransition(async () => {
      const res = await deleteSavedSearchAction(searchId);
      if (res.success) {
        setSavedSearches((prev) => prev.filter((s) => s.id !== searchId));
        showToast(`Deleted saved search "${searchName}"`);
      } else {
        setActionError(res.error ?? "Failed to delete search");
      }
    });
  };

  const handleUpdateFrequency = (searchId: string, freq: AlertFrequency) => {
    setActionError(null);
    const search = savedSearches.find((s) => s.id === searchId);
    if (search && search.alertFrequency !== "never") {
      setCachedFrequencies((prev) => ({
        ...prev,
        [searchId]: search.alertFrequency,
      }));
    }

    startTransition(async () => {
      const res = await updateSavedSearchFrequencyAction(searchId, freq);
      if (res.success) {
        setSavedSearches((prev) =>
          prev.map((s) =>
            s.id === searchId ? { ...s, alertFrequency: freq } : s,
          ),
        );
        const label =
          freq === "never"
            ? "Alerts paused"
            : freq === "daily"
              ? "Frequency set to Daily Digest"
              : freq === "weekly"
                ? "Frequency set to Weekly Digest"
                : "Frequency set to Instant Updates";
        showToast(label);
      } else {
        setActionError(res.error ?? "Failed to update notification frequency");
      }
    });
  };

  const handleTogglePauseSearch = (search: SavedSearch) => {
    if (search.alertFrequency === "never") {
      // Resume
      const targetFreq = cachedFrequencies[search.id] ?? "weekly";
      handleUpdateFrequency(search.id, targetFreq);
    } else {
      // Pause
      setCachedFrequencies((prev) => ({
        ...prev,
        [search.id]: search.alertFrequency,
      }));
      handleUpdateFrequency(search.id, "never");
    }
  };

  const handlePauseAll = () => {
    setActionError(null);
    startTransition(async () => {
      const res = await pauseAllSavedSearchesAction();
      if (res.success) {
        setSavedSearches((prev) =>
          prev.map((s) => ({ ...s, alertFrequency: "never" })),
        );
        showToast("Paused all email alerts");
      } else {
        setActionError(res.error ?? "Failed to pause all searches");
      }
    });
  };

  const handleResumeAll = (cadence: AlertFrequency = "weekly") => {
    setActionError(null);
    startTransition(async () => {
      const res = await resumeAllSavedSearchesAction(cadence);
      if (res.success) {
        setSavedSearches((prev) =>
          prev.map((s) =>
            s.alertFrequency === "never"
              ? { ...s, alertFrequency: cadence }
              : s,
          ),
        );
        showToast(`Resumed all saved searches (${cadence} digest)`);
      } else {
        setActionError(res.error ?? "Failed to resume saved searches");
      }
    });
  };

  // --- Watchlist Handlers ---
  const handleRemoveWatch = (entryId: string, name: string) => {
    setActionError(null);
    startTransition(async () => {
      const res = await removeWatchlistEntryAction(entryId);
      if (res.success) {
        setWatchlist((prev) => prev.filter((w) => w.id !== entryId));
        showToast(`Removed "${name}" from watchlist`);
      } else {
        setActionError(res.error ?? "Failed to remove watchlist item");
      }
    });
  };

  const handleToggleWatchlistMute = (entry: WatchlistEntry) => {
    setActionError(null);
    const meta = parseWatchlistNotes(entry.notes);
    const newMuted = !meta.muted;

    startTransition(async () => {
      const res = await toggleWatchlistMuteAction(
        entry.id,
        entry.notes ?? null,
        newMuted,
      );
      if (res.success) {
        const updatedMeta: WatchlistNoteMeta = { ...meta, muted: newMuted };
        const serialized = JSON.stringify(updatedMeta);
        setWatchlist((prev) =>
          prev.map((w) => (w.id === entry.id ? { ...w, notes: serialized } : w)),
        );
        showToast(
          newMuted
            ? "Notifications muted for this item"
            : "Notifications unmuted for this item",
        );
      } else {
        setActionError(res.error ?? "Failed to update notification settings");
      }
    });
  };

  const handleSaveNote = (entryId: string) => {
    const entry = watchlist.find((w) => w.id === entryId);
    if (!entry) return;
    const meta = parseWatchlistNotes(entry.notes);
    meta.memo = noteDraft.trim() || undefined;
    const serialized = JSON.stringify(meta);

    startTransition(async () => {
      const res = await updateWatchlistNotesAction(entryId, serialized);
      if (res.success) {
        setWatchlist((prev) =>
          prev.map((w) => (w.id === entryId ? { ...w, notes: serialized } : w)),
        );
        setEditingNoteId(null);
        setNoteDraft("");
        showToast("Note saved");
      } else {
        setActionError(res.error ?? "Failed to save note");
      }
    });
  };

  // --- Alerts Handlers ---
  const handleMarkAlertRead = (alertId: string) => {
    startTransition(async () => {
      const res = await markAlertReadAction(alertId);
      if (res.success) {
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId ? { ...a, readAt: new Date().toISOString() } : a,
          ),
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
          prev.map((a) => ({
            ...a,
            readAt: a.readAt ?? new Date().toISOString(),
          })),
        );
        setUnreadCount(0);
        showToast("Marked all alerts as read");
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
    if (s.filters.sa4Code) params.set("sa4", s.filters.sa4Code);
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Toast Feedback Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-navy-950 px-4 py-3 text-xs font-semibold text-white shadow-xl ring-1 ring-white/10 transition-all">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Breadcrumb Navigation */}
      <div className="mb-6 flex items-center justify-between">
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
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-surface-border bg-white p-6 shadow-2xs sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06] bg-center bg-cover [mask-image:radial-gradient(ellipse_at_top_right,black_50%,transparent_90%)]"
          style={{ backgroundImage: "url('/brand/hero_cartography.jpg')" }}
        />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-white shadow-xs">
              <User className="h-7 w-7" />
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
                Personal intelligence dashboard · Saved searches, employer watchlists, and delivery preferences.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("alerts")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-terracotta-50 border border-terracotta-200 px-3.5 py-2 text-xs font-semibold text-terracotta-800 hover:bg-terracotta-100 transition-colors shadow-2xs"
              >
                <Bell className="h-3.5 w-3.5 text-terracotta-700 animate-pulse" />
                <span>
                  {unreadCount} unread update{unreadCount === 1 ? "" : "s"}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Overview Metrics Strip */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Metric 1: Saved Searches */}
        <div
          onClick={() => setActiveTab("searches")}
          className="cursor-pointer rounded-xl border border-surface-border bg-white p-4 shadow-2xs hover:border-slate-300 transition-all"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Saved Searches
            </span>
            <Bookmark className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold text-navy-900">
              {savedSearches.length}
            </span>
            {savedSearches.length > 0 && (
              <span className="text-[11px] font-medium text-slate-500">
                ({activeSearchesCount} active)
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
            {pausedSearchesCount > 0 ? (
              <span className="text-amber-600 font-medium">
                {pausedSearchesCount} paused
              </span>
            ) : (
              <span>All alert cadences live</span>
            )}
          </div>
        </div>

        {/* Metric 2: Watched Employers */}
        <div
          onClick={() => {
            setActiveTab("watchlist");
            setWatchlistSubTab("employers");
          }}
          className="cursor-pointer rounded-xl border border-surface-border bg-white p-4 shadow-2xs hover:border-slate-300 transition-all"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Watched Employers
            </span>
            <Building2 className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold text-navy-900">
              {watchedCompanies.length}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              companies
            </span>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            Headcount &amp; visa monitors
          </div>
        </div>

        {/* Metric 3: Watched Regions */}
        <div
          onClick={() => {
            setActiveTab("watchlist");
            setWatchlistSubTab("regions");
          }}
          className="cursor-pointer rounded-xl border border-surface-border bg-white p-4 shadow-2xs hover:border-slate-300 transition-all"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Watched Regions
            </span>
            <MapPin className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold text-navy-900">
              {watchedRegions.length}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              hubs
            </span>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            Regional opportunity index
          </div>
        </div>

        {/* Metric 4: In-App Updates */}
        <div
          onClick={() => setActiveTab("alerts")}
          className="cursor-pointer rounded-xl border border-surface-border bg-white p-4 shadow-2xs hover:border-slate-300 transition-all"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              In-App Alerts
            </span>
            <Bell className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold text-navy-900">
              {unreadCount}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              unread
            </span>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            {alerts.length} total notifications
          </div>
        </div>
      </div>

      {/* Global Alert Dispatcher Status Callout */}
      <div className="mb-8 flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-white">
            <Clock className="h-4 w-4" />
          </div>
          <div className="text-xs">
            <span className="font-bold text-navy-900">
              Email Digest Delivery Engine
            </span>
            <p className="mt-0.5 text-slate-600">
              {activeSearchesCount > 0
                ? `Active subscriptions (${activeSearchesCount}) deliver new job observations and visa sponsorship events according to your cadence (Instant, Daily at 08:00 AEST, or Weekly on Mondays).`
                : "All email alerts are currently paused. Enable a search below to receive curated vacancy digests."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {activeSearchesCount > 0 ? (
            <button
              type="button"
              onClick={handlePauseAll}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-navy-900 transition-colors disabled:opacity-50"
            >
              <Pause className="h-3 w-3 text-slate-500" />
              <span>Pause All Alerts</span>
            </button>
          ) : (
            savedSearches.length > 0 && (
              <button
                type="button"
                onClick={() => handleResumeAll("weekly")}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <Play className="h-3 w-3 text-emerald-400" />
                <span>Resume All (Weekly)</span>
              </button>
            )
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-900 flex items-center justify-between">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-700 hover:text-red-900 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Primary Tabs Navigation */}
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
        {/* TAB 1: SAVED SEARCHES MANAGEMENT */}
        {activeTab === "searches" && (
          <div>
            {savedSearches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-surface-border bg-white p-12 text-center">
                <Bookmark className="mx-auto h-8 w-8 text-slate-400" />
                <h3 className="mt-3 font-heading text-base font-bold text-navy-900">
                  No saved searches yet
                </h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  When filtering companies or regions on the map, click
                  &quot;Save Search&quot; to bookmark your criteria and receive
                  opportunity alerts.
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
              <div className="grid gap-5">
                {savedSearches.map((search) => {
                  const isPaused = search.alertFrequency === "never";

                  return (
                    <div
                      key={search.id}
                      className={`flex flex-col justify-between rounded-2xl border bg-white p-6 shadow-2xs transition-all ${
                        isPaused
                          ? "border-slate-200/60 bg-slate-50/40"
                          : "border-surface-border hover:border-slate-300"
                      }`}
                    >
                      {/* Top Row: Title, Status Badge, and Action Buttons */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h3 className="font-heading text-base font-bold text-navy-900">
                              {search.name}
                            </h3>

                            {/* Status Indicator Badge */}
                            {isPaused ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                                <PauseCircle className="h-3 w-3 text-amber-600" />
                                Paused
                              </span>
                            ) : search.alertFrequency === "instant" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                <Zap className="h-3 w-3 text-emerald-600" />
                                Active · Instant Updates
                              </span>
                            ) : search.alertFrequency === "daily" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[10px] font-bold text-blue-800">
                                <Clock className="h-3 w-3 text-blue-600" />
                                Active · Daily Digest
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[10px] font-bold text-indigo-800">
                                <Calendar className="h-3 w-3 text-indigo-600" />
                                Active · Weekly Digest
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                            <span>
                              Created{" "}
                              {new Date(search.createdAt).toLocaleDateString(
                                "en-AU",
                                { day: "numeric", month: "short", year: "numeric" },
                              )}
                            </span>
                            {search.lastAlertedAt ? (
                              <span>
                                · Last alert:{" "}
                                {new Date(search.lastAlertedAt).toLocaleDateString(
                                  "en-AU",
                                  { day: "numeric", month: "short" },
                                )}
                              </span>
                            ) : (
                              <span>· No alerts sent yet</span>
                            )}
                          </div>
                        </div>

                        {/* Right Quick Controls: Pause/Resume toggle & Delete */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleTogglePauseSearch(search)}
                            disabled={isPending}
                            title={isPaused ? "Resume email alerts" : "Pause email alerts"}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors ${
                              isPaused
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {isPaused ? (
                              <>
                                <Play className="h-3 w-3 text-emerald-700" />
                                <span>Resume</span>
                              </>
                            ) : (
                              <>
                                <Pause className="h-3 w-3 text-slate-500" />
                                <span>Pause</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteSearch(search.id, search.name)}
                            disabled={isPending}
                            title="Delete saved search"
                            className="rounded-lg border border-transparent p-1.5 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-700 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Filter Chips Preview */}
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {search.filters.query && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            <Search className="h-2.5 w-2.5 text-slate-400" />
                            &quot;{search.filters.query}&quot;
                          </span>
                        )}
                        {search.filters.roleFamily && (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            Role: {search.filters.roleFamily}
                          </span>
                        )}
                        {search.filters.category && (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            Category: {search.filters.category}
                          </span>
                        )}
                        {search.filters.remote && (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 capitalize">
                            Work: {search.filters.remote}
                          </span>
                        )}
                        {search.filters.hubCity && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[11px] font-medium border border-emerald-200/60">
                            <MapPin className="h-2.5 w-2.5 text-emerald-600" />
                            Hub: {search.filters.hubCity}
                          </span>
                        )}
                        {search.filters.sa4Code && (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 font-mono">
                            SA4: {search.filters.sa4Code}
                          </span>
                        )}
                        {search.filters.sponsorship && (
                          <span className="rounded-md bg-terracotta-50 text-terracotta-800 px-2 py-0.5 text-[11px] font-medium border border-terracotta-200/60">
                            482 Sponsor
                          </span>
                        )}
                        {search.filters.regional && (
                          <span className="rounded-md bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[11px] font-medium border border-emerald-200/60">
                            Regional Hub
                          </span>
                        )}
                        {search.filters.hiring && (
                          <span className="rounded-md bg-blue-50 text-blue-800 px-2 py-0.5 text-[11px] font-medium border border-blue-200/60">
                            Actively Hiring
                          </span>
                        )}
                      </div>

                      {/* Bottom Controls Bar: Segmented Frequency Pill & Map Execution */}
                      <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        {/* Interactive Frequency Switcher */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-500">
                            Alert Cadence:
                          </span>
                          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50/80 p-0.5 text-xs">
                            <button
                              type="button"
                              onClick={() => handleUpdateFrequency(search.id, "never")}
                              disabled={isPending}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                                search.alertFrequency === "never"
                                  ? "bg-white text-slate-800 shadow-2xs ring-1 ring-slate-200"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              Paused
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateFrequency(search.id, "daily")}
                              disabled={isPending}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                                search.alertFrequency === "daily"
                                  ? "bg-blue-600 text-white shadow-2xs font-bold"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              Daily
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateFrequency(search.id, "weekly")}
                              disabled={isPending}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                                search.alertFrequency === "weekly"
                                  ? "bg-navy-900 text-white shadow-2xs font-bold"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              Weekly
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateFrequency(search.id, "instant")}
                              disabled={isPending}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                                search.alertFrequency === "instant"
                                  ? "bg-emerald-700 text-white shadow-2xs font-bold"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              Instant
                            </button>
                          </div>
                        </div>

                        {/* Execute Query on Map */}
                        <Link
                          href={buildSearchHref(search)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 text-xs font-bold text-navy-900 transition-colors shrink-0"
                        >
                          <Search className="h-3.5 w-3.5 text-slate-500" />
                          <span>Run on Map</span>
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: WATCHLIST MANAGEMENT */}
        {activeTab === "watchlist" && (
          <div className="space-y-6">
            {/* Sub-Tabs: All / Employers / Regional Hubs */}
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setWatchlistSubTab("all")}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors ${
                    watchlistSubTab === "all"
                      ? "bg-navy-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  All Items ({watchlist.length})
                </button>
                <button
                  type="button"
                  onClick={() => setWatchlistSubTab("employers")}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors ${
                    watchlistSubTab === "employers"
                      ? "bg-navy-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  Employers ({watchedCompanies.length})
                </button>
                <button
                  type="button"
                  onClick={() => setWatchlistSubTab("regions")}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors ${
                    watchlistSubTab === "regions"
                      ? "bg-navy-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  Regional Hubs ({watchedRegions.length})
                </button>
              </div>

              <Link
                href="/"
                className="inline-flex items-center gap-1 text-xs font-semibold text-terracotta-700 hover:underline"
              >
                <span>Find more on map</span>
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            {watchlist.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-surface-border bg-white p-12 text-center">
                <Building2 className="mx-auto h-8 w-8 text-slate-400" />
                <h3 className="mt-3 font-heading text-base font-bold text-navy-900">
                  Your watchlist is empty
                </h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  Watch technology employers or regional tech hubs to track
                  headcount momentum, new visa sponsorship data, and local
                  ecosystem changes.
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
              <div className="space-y-8">
                {/* SECTION: WATCHED EMPLOYERS */}
                {(watchlistSubTab === "all" || watchlistSubTab === "employers") && (
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-500">
                        Tracked Employers ({watchedCompanies.length})
                      </h3>
                    </div>

                    {watchedCompanies.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        No employers watched yet.
                      </p>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {watchedCompanies.map((w) => {
                          const meta = parseWatchlistNotes(w.notes);
                          const isMuted = Boolean(meta.muted);
                          const isEditingNote = editingNoteId === w.id;

                          return (
                            <div
                              key={w.id}
                              className="flex flex-col justify-between rounded-xl border border-surface-border bg-white p-5 shadow-2xs hover:border-slate-300 transition-all"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3 min-w-0">
                                    {/* Monogram Avatar */}
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 text-navy-900 font-heading text-sm font-bold">
                                      {(w.company?.name ?? "C").slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <Link
                                        href={`/companies/${w.company?.slug ?? ""}`}
                                        className="font-heading text-sm font-bold text-navy-900 hover:text-terracotta-700 transition-colors truncate block"
                                      >
                                        {w.company?.name ?? "Company"}
                                      </Link>
                                      {w.company?.city && (
                                        <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500 mt-0.5">
                                          <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                                          {w.company.city}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Top Actions: Mute/Unmute & Remove */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleWatchlistMute(w)}
                                      disabled={isPending}
                                      title={isMuted ? "Unmute updates" : "Mute updates"}
                                      className={`rounded-lg p-1.5 transition-colors ${
                                        isMuted
                                          ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                          : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                      }`}
                                    >
                                      {isMuted ? (
                                        <BellOff className="h-3.5 w-3.5" />
                                      ) : (
                                        <BellRing className="h-3.5 w-3.5" />
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRemoveWatch(
                                          w.id,
                                          w.company?.name ?? "Company",
                                        )
                                      }
                                      disabled={isPending}
                                      title="Unwatch employer"
                                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700 transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Company Badges */}
                                <div className="mt-3 flex flex-wrap gap-1">
                                  {w.company?.primaryCategory && (
                                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                      {w.company.primaryCategory}
                                    </span>
                                  )}
                                  {w.company?.hasSponsorshipEvidence && (
                                    <span className="rounded bg-terracotta-50 text-terracotta-800 px-2 py-0.5 text-[10px] font-medium border border-terracotta-200/60">
                                      482 Sponsor
                                    </span>
                                  )}
                                  {w.company?.isRegional && (
                                    <span className="rounded bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[10px] font-medium border border-emerald-200/60">
                                      Regional
                                    </span>
                                  )}
                                  {isMuted && (
                                    <span className="rounded bg-amber-50 text-amber-800 px-2 py-0.5 text-[10px] font-semibold border border-amber-200/60">
                                      Muted
                                    </span>
                                  )}
                                </div>

                                {/* Private Career Memo / Note */}
                                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-xs">
                                  {isEditingNote ? (
                                    <div className="flex flex-col gap-2">
                                      <textarea
                                        value={noteDraft}
                                        onChange={(e) => setNoteDraft(e.target.value)}
                                        placeholder="Add private note (e.g. Applied for role, Spoke with recruiter)..."
                                        rows={2}
                                        className="w-full rounded border border-slate-300 bg-white p-2 text-xs text-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900"
                                      />
                                      <div className="flex items-center justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setEditingNoteId(null)}
                                          className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSaveNote(w.id)}
                                          disabled={isPending}
                                          className="rounded bg-navy-900 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs"
                                        >
                                          Save
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      onClick={() => {
                                        setEditingNoteId(w.id);
                                        setNoteDraft(meta.memo ?? "");
                                      }}
                                      className="group flex cursor-pointer items-start justify-between gap-2"
                                    >
                                      <div className="flex items-start gap-1.5 text-slate-600">
                                        <MessageSquare className="h-3 w-3 mt-0.5 text-slate-400 shrink-0" />
                                        <span className="text-[11px] leading-snug">
                                          {meta.memo ? (
                                            meta.memo
                                          ) : (
                                            <span className="text-slate-400 italic">
                                              Click to add private career note...
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Footer: Watched since date & Profile link */}
                              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                                <span className="text-[10px] font-mono text-slate-400">
                                  Watching since{" "}
                                  {new Date(w.createdAt).toLocaleDateString("en-AU", {
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </span>
                                <Link
                                  href={`/companies/${w.company?.slug ?? ""}`}
                                  className="inline-flex items-center gap-1 font-semibold text-terracotta-700 hover:text-terracotta-800"
                                >
                                  <span>View Dossier</span>
                                  <ArrowUpRight className="h-3 w-3" />
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* SECTION: WATCHED REGIONAL HUBS */}
                {(watchlistSubTab === "all" || watchlistSubTab === "regions") && (
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-500">
                        Tracked Regional Tech Hubs ({watchedRegions.length})
                      </h3>
                    </div>

                    {watchedRegions.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        No regional hubs watched yet.
                      </p>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {watchedRegions.map((w) => {
                          const meta = parseWatchlistNotes(w.notes);
                          const isMuted = Boolean(meta.muted);

                          return (
                            <div
                              key={w.id}
                              className="flex flex-col justify-between rounded-xl border border-surface-border bg-white p-5 shadow-2xs hover:border-slate-300 transition-all"
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

                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleWatchlistMute(w)}
                                      disabled={isPending}
                                      title={isMuted ? "Unmute updates" : "Mute updates"}
                                      className={`rounded-lg p-1.5 transition-colors ${
                                        isMuted
                                          ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                          : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                      }`}
                                    >
                                      {isMuted ? (
                                        <BellOff className="h-3.5 w-3.5" />
                                      ) : (
                                        <BellRing className="h-3.5 w-3.5" />
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRemoveWatch(
                                          w.id,
                                          w.region?.name ?? `SA4 ${w.sa4Code}`,
                                        )
                                      }
                                      disabled={isPending}
                                      title="Unwatch region"
                                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700 transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {w.region?.opportunityScore !== undefined && (
                                  <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200/80 px-2.5 py-1">
                                    <span className="font-mono text-xs font-bold text-navy-900">
                                      Score: {w.region.opportunityScore ?? "N/A"}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      Regional Labour Index
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                                <span className="text-[10px] font-mono text-slate-400">
                                  {isMuted ? "Alerts Muted" : "Active Monitor"}
                                </span>
                                <Link
                                  href={`/regions/${w.sa4Code ?? w.region?.code ?? ""}`}
                                  className="inline-flex items-center gap-1 font-semibold text-terracotta-700 hover:text-terracotta-800"
                                >
                                  <span>Regional Report</span>
                                  <ArrowUpRight className="h-3 w-3" />
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
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
                  New verified employer sponsorships, active tech vacancies, and
                  regional labour market changes will appear here.
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
                              {new Date(alert.createdAt).toLocaleString(
                                "en-AU",
                                {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                            {alert.link && (
                              <Link
                                href={alert.link}
                                onClick={() =>
                                  isUnread && handleMarkAlertRead(alert.id)
                                }
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
                Australia Tech Map follows APP 11 standards: personal data is
                collected solely to power your saved searches, watchlists, and
                delivery preferences. You hold full control to delete your
                account and immediately purge all associated state at any time.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-heading text-xs font-bold text-navy-900">
                    Delete Account &amp; Purge Personal Data
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Permanently disable your account, purge saved searches,
                    watchlists, and undelivered alerts, and record a tombstone
                    audit ledger.
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
