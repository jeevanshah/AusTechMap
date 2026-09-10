"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Building2,
  CheckCircle2,
  ExternalLink,
  Filter,
  Loader2,
  MapPin,
  Save,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from "lucide-react";
import type {
  AlertFrequency,
  OpportunityExperienceBand,
  OpportunityMatchPreferences,
  OpportunityMatchResponse,
  OpportunityWorkStyle,
  SponsoredPlacement,
} from "@austechmap/contracts";

import { PromotedOpportunityCard } from "./PromotedOpportunityCard";
import { matchOpportunitiesAction } from "../../app/actions/opportunityActions";
import {
  saveSearchAction,
  toggleCompanyWatchAction,
} from "../../app/actions/retentionActions";

const POPULAR_SKILLS = [
  "TypeScript",
  "React",
  "Python",
  "Go",
  "AWS",
  "Docker",
  "Kubernetes",
  "PostgreSQL",
  "Node.js",
  "Java",
  "C++",
  "Next.js",
  "GCP",
  "Terraform",
  "Rust",
  "GraphQL",
];

const ROLE_FAMILIES = [
  { key: "software-engineering", label: "Software Engineering" },
  { key: "data", label: "Data & Analytics" },
  { key: "ai-ml", label: "AI / Machine Learning" },
  { key: "cloud-platform", label: "Cloud & DevOps" },
  { key: "security", label: "Cybersecurity" },
  { key: "product-delivery", label: "Product & Delivery" },
  { key: "design", label: "UI / UX Design" },
  { key: "architecture", label: "Architecture" },
  { key: "it-infrastructure", label: "IT & Infrastructure" },
];

const POPULAR_LOCATIONS = [
  "Sydney",
  "Melbourne",
  "Brisbane",
  "Perth",
  "Adelaide",
  "Canberra",
  "NSW",
  "VIC",
  "QLD",
  "WA",
];

interface OpportunityMatcherShellProps {
  initialResponse: OpportunityMatchResponse;
  initialPreferences: OpportunityMatchPreferences;
  initialPromotedPlacements?: SponsoredPlacement[];
  user: { id: number; email: string } | null;
  watchedCompanyIds: string[];
}

export function OpportunityMatcherShell({
  initialResponse,
  initialPreferences,
  initialPromotedPlacements,
  user,
  watchedCompanyIds: initialWatched,
}: OpportunityMatcherShellProps) {
  const router = useRouter();
  const [preferences, setPreferences] =
    useState<OpportunityMatchPreferences>(initialPreferences);
  const [promotedPlacements, setPromotedPlacements] = useState<
    SponsoredPlacement[]
  >(initialPromotedPlacements ?? []);
  const [response, setResponse] =
    useState<OpportunityMatchResponse>(initialResponse);
  const [isPending, startTransition] = useTransition();

  // Watchlist state
  const [watchedSet, setWatchedSet] = useState<Set<string>>(
    () => new Set(initialWatched),
  );
  const [watchingPendingId, setWatchingPendingId] = useState<string | null>(
    null,
  );

  // Skill input state
  const [skillInput, setSkillInput] = useState("");

  // Save search modal state
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [alertFrequency, setAlertFrequency] =
    useState<AlertFrequency>("weekly");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");

  const runMatch = (updatedPrefs?: OpportunityMatchPreferences) => {
    const prefsToRun = updatedPrefs ?? preferences;
    startTransition(async () => {
      const res = await matchOpportunitiesAction(prefsToRun);
      if (res.success && res.response) {
        setResponse(res.response);
        if (res.promotedPlacements !== undefined) {
          setPromotedPlacements(res.promotedPlacements);
        }
      }
    });
  };

  const handleRoleSelect = (key: string) => {
    const nextRole = preferences.roleFamily === key ? undefined : key;
    const updated = { ...preferences, roleFamily: nextRole };
    setPreferences(updated);
    runMatch(updated);
  };

  const toggleSkill = (skill: string) => {
    const norm = skill.trim().toLowerCase();
    const current = preferences.skills.map((s) => s.toLowerCase());
    let nextSkills: string[];
    if (current.includes(norm)) {
      nextSkills = preferences.skills.filter((s) => s.toLowerCase() !== norm);
    } else {
      nextSkills = [...preferences.skills, skill];
    }
    const updated = { ...preferences, skills: nextSkills };
    setPreferences(updated);
    runMatch(updated);
  };

  const addCustomSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillInput.trim()) return;
    const norm = skillInput.trim();
    if (
      !preferences.skills
        .map((s) => s.toLowerCase())
        .includes(norm.toLowerCase())
    ) {
      const updated = { ...preferences, skills: [...preferences.skills, norm] };
      setPreferences(updated);
      runMatch(updated);
    }
    setSkillInput("");
  };

  const toggleLocation = (loc: string) => {
    const norm = loc.trim().toLowerCase();
    const current = preferences.locations.map((l) => l.toLowerCase());
    let nextLocations: string[];
    if (current.includes(norm)) {
      nextLocations = preferences.locations.filter(
        (l) => l.toLowerCase() !== norm,
      );
    } else {
      nextLocations = [...preferences.locations, loc];
    }
    const updated = { ...preferences, locations: nextLocations };
    setPreferences(updated);
    runMatch(updated);
  };

  const handleWorkStyle = (style: OpportunityWorkStyle) => {
    const updated = { ...preferences, workStyle: style };
    setPreferences(updated);
    runMatch(updated);
  };

  const handleExperienceBand = (band: OpportunityExperienceBand) => {
    const updated = { ...preferences, experienceBand: band };
    setPreferences(updated);
    runMatch(updated);
  };

  const toggleWatch = async (companyId: string) => {
    if (!user) {
      router.push("/sign-in?callbackUrl=/opportunities");
      return;
    }

    setWatchingPendingId(companyId);
    const nextSet = new Set(watchedSet);
    const wasWatching = nextSet.has(companyId);
    if (wasWatching) {
      nextSet.delete(companyId);
    } else {
      nextSet.add(companyId);
    }
    setWatchedSet(nextSet);

    try {
      const res = await toggleCompanyWatchAction(companyId);
      if (!res.success) {
        // revert on failure
        const reverted = new Set(watchedSet);
        if (wasWatching) reverted.add(companyId);
        else reverted.delete(companyId);
        setWatchedSet(reverted);
      }
    } finally {
      setWatchingPendingId(null);
    }
  };

  const handleSaveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push("/sign-in?callbackUrl=/opportunities");
      return;
    }

    setSaveStatus("saving");
    try {
      const filters = {
        roleFamily: preferences.roleFamily,
        sponsorship: preferences.requiresSponsorship ? "current" : undefined,
        regional: preferences.prefersRegional ? true : undefined,
        remote:
          preferences.workStyle !== "any" ? preferences.workStyle : undefined,
      };

      const res = await saveSearchAction(
        searchName.trim() ||
          `Match: ${preferences.roleFamily || "Tech Opportunities"}`,
        filters,
        alertFrequency,
      );

      if (res.success) {
        setSaveStatus("success");
        setTimeout(() => {
          setIsSaveModalOpen(false);
          setSaveStatus("idle");
        }, 1200);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-canvas pb-20">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-surface-border bg-white/90 px-4 py-3 backdrop-blur-md sm:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-white font-bold text-sm shadow-xs transition-transform group-hover:scale-105">
              AU
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm text-navy-900 leading-none">
                Australia Tech Map
              </span>
              <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                Opportunity Engine
              </span>
            </div>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
          <Link href="/" className="hover:text-navy-900 transition-colors">
            Map Explorer
          </Link>
          <span className="text-navy-900 cursor-default border-b-2 border-terracotta-700 pb-0.5">
            Opportunity Match
          </span>
          <Link
            href="/regions/101"
            className="hover:text-navy-900 transition-colors"
          >
            Regional Hubs
          </Link>
          {user && (
            <Link
              href="/account"
              className="hover:text-navy-900 transition-colors"
            >
              My Account
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2.5">
          {user ? (
            <Link
              href="/account"
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 shadow-2xs hover:bg-slate-50 transition-all"
            >
              <User className="h-3.5 w-3.5 text-slate-500" />
              <span className="max-w-[120px] truncate">{user.email}</span>
            </Link>
          ) : (
            <Link
              href="/sign-in?callbackUrl=/opportunities"
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 hover:text-navy-900 transition-all"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Hero Banner */}
      <section className="border-b border-surface-border bg-white px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-terracotta-200 bg-terracotta-50 px-2.5 py-0.5 text-xs font-semibold text-terracotta-800 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-terracotta-700" />
                Phase 7 Opportunity Graph
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-navy-900">
                Targeted Australian Tech Opportunity Match
              </h1>
              <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                Rank Australian tech employers against your role, skills, work
                style, and migration constraints. Every score is inspectable and
                grounded in verified company signals — never black-box AI
                guesses.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    router.push("/sign-in?callbackUrl=/opportunities");
                  } else {
                    setSearchName(
                      `Match: ${preferences.roleFamily || "Australian Tech"}`,
                    );
                    setIsSaveModalOpen(true);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-surface-border bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95"
              >
                <Save className="h-4 w-4 text-slate-500" />
                Save Match & Get Alerts
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Layout: Left Intake Panel + Right Ranked Results */}
      <div className="mx-auto max-w-6xl px-4 sm:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Intake Sidebar / Controls (4 cols on lg) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-2xs space-y-6">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <span className="flex items-center gap-1.5 font-bold text-sm text-navy-900">
                  <Filter className="h-4 w-4 text-terracotta-700" />
                  Your Opportunity Criteria
                </span>
                {isPending && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-terracotta-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Calculating...
                  </span>
                )}
              </div>

              {/* Target Role Family */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Role Family (30% Weight)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ROLE_FAMILIES.map((rf) => {
                    const isSelected = preferences.roleFamily === rf.key;
                    return (
                      <button
                        key={rf.key}
                        type="button"
                        onClick={() => handleRoleSelect(rf.key)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                          isSelected
                            ? "bg-navy-900 text-white font-semibold shadow-xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {rf.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Skills Intake (15% Weight) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Target Skills (15% Weight)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {POPULAR_SKILLS.map((skill) => {
                    const isSelected = preferences.skills
                      .map((s) => s.toLowerCase())
                      .includes(skill.toLowerCase());
                    return (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => toggleSkill(skill)}
                        className={`rounded-md px-2 py-0.5 text-xs transition-all ${
                          isSelected
                            ? "bg-emerald-600 text-white font-semibold shadow-2xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>
                <form onSubmit={addCustomSkill} className="flex gap-1.5">
                  <input
                    type="text"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    placeholder="Add other skill (e.g. Kotlin)..."
                    className="flex-1 rounded-lg border border-surface-border px-2.5 py-1 text-xs placeholder:text-slate-400 focus:border-navy-900 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    + Add
                  </button>
                </form>
                {preferences.skills.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {preferences.skills.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                      >
                        {s}
                        <button
                          type="button"
                          onClick={() => toggleSkill(s)}
                          className="text-emerald-600 hover:text-emerald-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Work Style & Seniority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Work Style
                  </label>
                  <select
                    value={preferences.workStyle}
                    onChange={(e) =>
                      handleWorkStyle(e.target.value as OpportunityWorkStyle)
                    }
                    className="w-full rounded-lg border border-surface-border bg-white px-2 py-1 text-xs text-slate-800 font-medium focus:border-navy-900 focus:outline-hidden"
                  >
                    <option value="any">Any Style</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="onsite">Onsite</option>
                  </select>
                  <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.workStyleRequired}
                      onChange={(e) => {
                        const updated = {
                          ...preferences,
                          workStyleRequired: e.target.checked,
                        };
                        setPreferences(updated);
                        runMatch(updated);
                      }}
                      className="rounded border-slate-300 text-terracotta-700 focus:ring-terracotta-700 h-3 w-3"
                    />
                    <span className="text-[11px] text-slate-600">
                      Strict filter
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Seniority
                  </label>
                  <select
                    value={preferences.experienceBand}
                    onChange={(e) =>
                      handleExperienceBand(
                        e.target.value as OpportunityExperienceBand,
                      )
                    }
                    className="w-full rounded-lg border border-surface-border bg-white px-2 py-1 text-xs text-slate-800 font-medium focus:border-navy-900 focus:outline-hidden"
                  >
                    <option value="any">Any Experience</option>
                    <option value="entry">Entry / Junior</option>
                    <option value="mid">Mid-Level</option>
                    <option value="senior">Senior</option>
                    <option value="lead_principal">Lead / Principal</option>
                  </select>
                </div>
              </div>

              {/* Location Preference */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Locations (10% Location Weight)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {POPULAR_LOCATIONS.map((loc) => {
                    const isSelected = preferences.locations
                      .map((l) => l.toLowerCase())
                      .includes(loc.toLowerCase());
                    return (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => toggleLocation(loc)}
                        className={`rounded-md px-2 py-0.5 text-xs transition-all ${
                          isSelected
                            ? "bg-navy-900 text-white font-semibold shadow-2xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {loc}
                      </button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.locationRequired}
                    onChange={(e) => {
                      const updated = {
                        ...preferences,
                        locationRequired: e.target.checked,
                      };
                      setPreferences(updated);
                      runMatch(updated);
                    }}
                    className="rounded border-slate-300 text-terracotta-700 focus:ring-terracotta-700 h-3 w-3"
                  />
                  <span className="text-[11px] text-slate-600">
                    Require office/presence in selected locations
                  </span>
                </label>
              </div>

              {/* Migration & Regional Strategic Constraints */}
              <div className="border-t border-surface-border pt-4 space-y-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.requiresSponsorship}
                    onChange={(e) => {
                      const updated = {
                        ...preferences,
                        requiresSponsorship: e.target.checked,
                      };
                      setPreferences(updated);
                      runMatch(updated);
                    }}
                    className="rounded border-slate-300 text-terracotta-700 focus:ring-terracotta-700 h-4 w-4 mt-0.5"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-navy-900 block">
                      Require Visa Sponsorship Evidence
                    </span>
                    <span className="text-slate-500">
                      Scores Home Affairs approved Labour Agreements &
                      accreditation.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.prefersRegional}
                    onChange={(e) => {
                      const updated = {
                        ...preferences,
                        prefersRegional: e.target.checked,
                      };
                      setPreferences(updated);
                      runMatch(updated);
                    }}
                    className="rounded border-slate-300 text-terracotta-700 focus:ring-terracotta-700 h-4 w-4 mt-0.5"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-navy-900 block">
                      Prioritize Regional Tech Hubs
                    </span>
                    <span className="text-slate-500">
                      Category 2/3 regional migration & DAMA designation
                      footprints.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Results Area (8 cols on lg) */}
          <div className="lg:col-span-8 space-y-5">
            {/* Results Summary Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-surface-border bg-white px-4 py-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-navy-900">
                  {response.totalMatches} Matching Employers
                </span>
                <span className="text-xs text-slate-500">
                  ranked by explainable fit
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                <span>Methodology: v1.0</span>
                <span>•</span>
                <span title={`Query hash: ${response.queryHash}`}>
                  Hash: {response.queryHash.slice(0, 8)}...
                </span>
              </div>
            </div>

            {/* Quarantined Promoted Partner Placements */}
            {promotedPlacements.length > 0 && (
              <div className="space-y-3">
                {promotedPlacements.map((placement) => (
                  <PromotedOpportunityCard
                    key={placement.id}
                    placement={placement}
                  />
                ))}
              </div>
            )}

            {/* Results Cards */}
            {response.matches.length === 0 ? (
              <div className="rounded-2xl border border-surface-border bg-white p-12 text-center shadow-2xs">
                <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <h3 className="font-bold text-base text-navy-900">
                  No employers matched these strict criteria
                </h3>
                <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto">
                  Try unchecking &ldquo;Strict filter&rdquo; on location or work
                  style, or broadening your role family to see adjacent
                  opportunity signals.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {response.matches.map((match) => {
                  const isWatched = watchedSet.has(match.companyId);
                  const isWatchingThis = watchingPendingId === match.companyId;

                  return (
                    <div
                      key={match.companyId}
                      className="rounded-2xl border border-surface-border bg-white p-5 shadow-2xs hover:shadow-xs transition-all"
                    >
                      {/* Card Header: Score, Name, Meta, Watch Button */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/companies/${match.companySlug}`}
                              className="font-bold text-base text-navy-900 hover:text-terracotta-700 transition-colors"
                            >
                              {match.companyName}
                            </Link>
                            {match.primaryCategory && (
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                {match.primaryCategory}
                              </span>
                            )}
                            {match.hqCity && (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium">
                                <MapPin className="h-3 w-3 text-slate-400" />
                                {match.hqCity}
                              </span>
                            )}
                            {match.isRegional && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                Regional Hub
                              </span>
                            )}
                          </div>

                          {match.sponsorshipSummary && (
                            <div className="inline-flex items-center gap-1 text-xs font-semibold text-terracotta-800 bg-terracotta-50 border border-terracotta-200 rounded-md px-2 py-0.5">
                              <ShieldCheck className="h-3.5 w-3.5 text-terracotta-700" />
                              {match.sponsorshipSummary}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Match Score Badge */}
                          <div
                            className={`flex flex-col items-center justify-center rounded-xl px-3 py-1.5 border shadow-2xs ${
                              match.matchScore >= 80
                                ? "border-terracotta-300 bg-terracotta-50 text-terracotta-800"
                                : match.matchScore >= 65
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                  : "border-slate-200 bg-slate-50 text-slate-700"
                            }`}
                          >
                            <span className="text-lg font-black tracking-tight leading-none">
                              {match.matchScore}%
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5">
                              Match
                            </span>
                          </div>

                          {/* Watchlist Toggle */}
                          <button
                            type="button"
                            onClick={() => toggleWatch(match.companyId)}
                            disabled={isWatchingThis}
                            title={
                              isWatched ? "Stop watching" : "Watch company"
                            }
                            className={`rounded-lg p-2 transition-all ${
                              isWatched
                                ? "bg-terracotta-50 text-terracotta-800 border border-terracotta-200"
                                : "bg-slate-50 text-slate-500 hover:text-slate-800 border border-surface-border"
                            }`}
                          >
                            {isWatchingThis ? (
                              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                            ) : isWatched ? (
                              <BookmarkCheck className="h-4 w-4 text-terracotta-700" />
                            ) : (
                              <Bookmark className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Score Breakdown Bar */}
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span>Component Score Breakdown (Out of 100)</span>
                          <span className="font-mono text-slate-400">
                            Role {match.scoreComponents.roleFit}/30 • Hiring{" "}
                            {match.scoreComponents.currentHiring}/20 • Skills{" "}
                            {match.scoreComponents.skillFit}/15 • Location{" "}
                            {match.scoreComponents.locationWorkStyleFit}/15
                          </span>
                        </div>
                        <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            style={{
                              width: `${(match.scoreComponents.roleFit / 30) * 30}%`,
                            }}
                            className="bg-navy-900"
                            title={`Role fit: ${match.scoreComponents.roleFit}/30`}
                          />
                          <div
                            style={{
                              width: `${(match.scoreComponents.currentHiring / 20) * 20}%`,
                            }}
                            className="bg-terracotta-600"
                            title={`Hiring activity: ${match.scoreComponents.currentHiring}/20`}
                          />
                          <div
                            style={{
                              width: `${(match.scoreComponents.skillFit / 15) * 15}%`,
                            }}
                            className="bg-emerald-600"
                            title={`Skill fit: ${match.scoreComponents.skillFit}/15`}
                          />
                          <div
                            style={{
                              width: `${(match.scoreComponents.locationWorkStyleFit / 15) * 15}%`,
                            }}
                            className="bg-sky-500"
                            title={`Location & style: ${match.scoreComponents.locationWorkStyleFit}/15`}
                          />
                          <div
                            style={{
                              width: `${(match.scoreComponents.hiringMomentum / 10) * 10}%`,
                            }}
                            className="bg-purple-500"
                            title={`Hiring momentum: ${match.scoreComponents.hiringMomentum}/10`}
                          />
                          <div
                            style={{
                              width: `${(match.scoreComponents.sponsorshipRegionalFit / 10) * 10}%`,
                            }}
                            className="bg-amber-500"
                            title={`Sponsorship & regional: ${match.scoreComponents.sponsorshipRegionalFit}/10`}
                          />
                        </div>
                      </div>

                      {/* Top Reasons (Explainability) */}
                      <div className="mt-3.5 space-y-1">
                        {match.topReasons.map((reason) => (
                          <div
                            key={reason}
                            className="flex items-start gap-1.5 text-xs text-slate-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                            <span>{reason}</span>
                          </div>
                        ))}
                      </div>

                      {/* Skills alignment pills */}
                      {(match.matchedSkills.length > 0 ||
                        match.missingSkills.length > 0) && (
                        <div className="mt-3 flex items-center gap-1.5 flex-wrap text-xs">
                          <span className="font-semibold text-slate-500 text-[11px]">
                            Skills:
                          </span>
                          {match.matchedSkills.map((s) => (
                            <span
                              key={s}
                              className="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 text-[11px] font-medium"
                            >
                              ✓ {s}
                            </span>
                          ))}
                          {match.missingSkills.map((s) => (
                            <span
                              key={s}
                              className="rounded bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.2 text-[11px]"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Sample Open Roles Preview */}
                      {match.sampleActiveRoles.length > 0 && (
                        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center justify-between">
                            <span>
                              Active Open Roles ({match.activeRolesCount})
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              Scraped from official ATS feed
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {match.sampleActiveRoles.map((role) => (
                              <div
                                key={role.id}
                                className="flex items-center justify-between text-xs gap-2"
                              >
                                <span className="font-medium text-navy-900 truncate">
                                  {role.title}
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  {role.remoteType && (
                                    <span className="rounded bg-white border border-slate-200 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                                      {role.remoteType}
                                    </span>
                                  )}
                                  <a
                                    href={role.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-terracotta-700 hover:text-terracotta-800 inline-flex items-center gap-0.5"
                                  >
                                    Apply <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Card Footer Link */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end">
                        <Link
                          href={`/companies/${match.companySlug}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-navy-900 hover:text-terracotta-700 transition-colors"
                        >
                          View Company Intelligence & Locations{" "}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Search Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-surface-border bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-navy-900">
                Save Opportunity Match
              </h3>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Get notified when new Australian employers meet this exact profile
              or when matching active jobs are discovered.
            </p>

            <form onSubmit={handleSaveSearch} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Search Name
                </label>
                <input
                  type="text"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="e.g. Senior Go / TypeScript in Sydney"
                  required
                  className="w-full rounded-lg border border-surface-border px-3 py-2 text-xs text-slate-800 focus:border-navy-900 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alert Frequency
                </label>
                <select
                  value={alertFrequency}
                  onChange={(e) =>
                    setAlertFrequency(e.target.value as AlertFrequency)
                  }
                  className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-xs text-slate-800 font-medium focus:border-navy-900 focus:outline-hidden"
                >
                  <option value="never">Never (Saved query only)</option>
                  <option value="daily">Daily Digest</option>
                  <option value="weekly">Weekly Digest</option>
                  <option value="instant">Instant (High Signal)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveStatus === "saving"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-terracotta-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-terracotta-800 disabled:opacity-50"
                >
                  {saveStatus === "saving" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {saveStatus === "success" && "Saved!"}
                  {saveStatus === "idle" && "Confirm & Save"}
                  {saveStatus === "error" && "Retry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
