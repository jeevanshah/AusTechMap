"use client";

import type {
  CandidateProfile,
  CandidateProfileSuggestion,
  ProfileAlertFrequency,
} from "@austechmap/contracts";
import { ShieldCheck, Trash2, User } from "lucide-react";
import { useState, useTransition } from "react";

import { mergeSuggestionWithProfile } from "../../../lib/profile/preferences";
import type { RoleFamilyRow, SkillRow } from "../../../lib/queries/taxonomy";
import {
  deleteCandidateProfileAction,
  setProfileAlertFrequencyAction,
} from "../../actions/profileActions";
import { ResumeIntakeCard } from "../../../components/profile/ResumeIntakeCard";
import { ResumeReviewPanel } from "../../../components/profile/ResumeReviewPanel";

interface CandidateProfilePanelProps {
  initialProfile: CandidateProfile | null;
  roleFamilies: RoleFamilyRow[];
  skills: SkillRow[];
  onProfileChange?: (profile: CandidateProfile | null) => void;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(new Date(value));
}

export function CandidateProfilePanel({
  initialProfile,
  roleFamilies,
  skills,
  onProfileChange,
}: CandidateProfilePanelProps) {
  const [profile, setProfile] = useState<CandidateProfile | null>(
    initialProfile,
  );
  const [pendingSuggestion, setPendingSuggestion] =
    useState<CandidateProfileSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const changeAlerts = (frequency: ProfileAlertFrequency) => {
    if (!profile) return;
    const previous = profile.alertFrequency;
    setError(null);
    setMessage(null);
    setProfile({ ...profile, alertFrequency: frequency });
    startTransition(async () => {
      try {
        const result = await setProfileAlertFrequencyAction(frequency);
        if (result.success) {
          onProfileChange?.({ ...profile, alertFrequency: frequency });
          setMessage(
            frequency === "never"
              ? "Profile alerts turned off."
              : "Profile alerts turned on.",
          );
        } else {
          setProfile({ ...profile, alertFrequency: previous });
          setError(result.error ?? "Could not update profile alerts");
        }
      } catch {
        setProfile({ ...profile, alertFrequency: previous });
        setError(
          "We couldn't update profile alerts. Please check your connection and try again.",
        );
      }
    });
  };

  const removeProfile = () => {
    if (
      !window.confirm("Delete your candidate profile? This cannot be undone.")
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await deleteCandidateProfileAction();
        if (result.success) {
          setProfile(null);
          onProfileChange?.(null);
          setMessage("Candidate profile deleted.");
        } else {
          setError(result.error ?? "Could not delete your profile");
        }
      } catch {
        setError(
          "We couldn't delete your profile. Please check your connection and try again.",
        );
      }
    });
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
          <div>
            <h3 className="font-heading text-sm font-bold text-navy-900">
              Your candidate profile
            </h3>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">
              Your resume is read in your browser and never uploaded — only the
              structured details you explicitly confirm are saved. This profile
              pre-fills Opportunity Match for you.
            </p>
          </div>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800"
        >
          {message}
        </p>
      )}

      {pendingSuggestion ? (
        <ResumeReviewPanel
          suggestion={pendingSuggestion}
          roleFamilies={roleFamilies}
          skills={skills}
          initialLocations={profile?.locations ?? []}
          onCancel={() => setPendingSuggestion(null)}
          onSaved={(saved) => {
            setProfile(saved);
            onProfileChange?.(saved);
            setPendingSuggestion(null);
            setMessage("Candidate profile saved.");
          }}
        />
      ) : (
        <ResumeIntakeCard
          hasExistingProfile={profile !== null}
          taxonomy={{ roleFamilies, skills }}
          onParsed={(suggestion) => {
            setError(null);
            setMessage(null);
            setPendingSuggestion(
              profile
                ? mergeSuggestionWithProfile(suggestion, profile)
                : suggestion,
            );
          }}
        />
      )}

      {!pendingSuggestion && profile && (
        <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-2xs sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-slate-100 p-2">
                <User className="h-4 w-4 text-slate-600" />
              </div>
              <div>
                <h4 className="font-heading text-sm font-bold text-navy-900">
                  {profile.roleFamilyLabel ?? "Role not set"}
                </h4>
                <p className="mt-1 text-[11px] text-slate-500">
                  Last updated {formatDate(profile.updatedAt)}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={removeProfile}
              aria-label="Delete candidate profile"
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
            <span className="rounded-md bg-slate-100 px-2 py-1">
              {profile.experienceBand === "any"
                ? "Any experience level"
                : profile.experienceBand.replaceAll("_", " ")}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-1">
              {profile.workStyle === "any"
                ? "Any work style"
                : profile.workStyle}
              {profile.workStyleRequired ? " (strict)" : ""}
            </span>
            {profile.locations.map((loc) => (
              <span key={loc} className="rounded-md bg-slate-100 px-2 py-1">
                {loc}
              </span>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <label
              htmlFor="profile-alert-frequency"
              className="block text-xs font-bold text-navy-900"
            >
              Alert me about new roles that match this profile
            </label>
            <select
              id="profile-alert-frequency"
              value={profile.alertFrequency}
              disabled={isPending}
              onChange={(event) =>
                changeAlerts(event.target.value as ProfileAlertFrequency)
              }
              className="mt-1.5 w-full max-w-xs cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-navy-900 focus:border-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/15"
            >
              <option value="never">Off</option>
              <option value="daily">Daily digest</option>
              <option value="instant">As soon as we spot them</option>
            </select>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Off by default. We compare your saved profile with roles we newly
              find on employer careers pages and tell you here and by email.
              &quot;As soon as&quot; means within hours of our next check, not
              minutes, and at most three emails a day. Every email has a
              one-click unsubscribe.
            </p>
          </div>

          {profile.skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.skills.map((skill) => (
                <span
                  key={skill.key}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800"
                >
                  {skill.label}
                </span>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
