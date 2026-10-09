"use client";

import { LoaderCircle, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import type {
  CandidateProfile,
  CandidateProfileSuggestion,
  OpportunityExperienceBand,
  OpportunityWorkStyle,
} from "@austechmap/contracts";

import {
  MAX_PROFILE_LOCATION_CHARS,
  MAX_PROFILE_LOCATIONS,
} from "../../lib/profile/limits";
import type { RoleFamilyRow, SkillRow } from "../../lib/queries/taxonomy";
import { saveCandidateProfileAction } from "../../app/actions/profileActions";

const EXPERIENCE_OPTIONS: Array<{
  value: OpportunityExperienceBand;
  label: string;
}> = [
  { value: "any", label: "Not detected — please choose" },
  { value: "entry", label: "Entry / Junior" },
  { value: "mid", label: "Mid-Level" },
  { value: "senior", label: "Senior" },
  { value: "lead_principal", label: "Lead / Principal" },
];

const WORK_STYLE_OPTIONS: Array<{
  value: OpportunityWorkStyle;
  label: string;
}> = [
  { value: "any", label: "Not detected — any style" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
];

interface ResumeReviewPanelProps {
  suggestion: CandidateProfileSuggestion;
  roleFamilies: RoleFamilyRow[];
  skills: SkillRow[];
  /** Locations are never read from a CV, so a re-upload starts from the saved ones. */
  initialLocations?: string[];
  onSaved: (profile: CandidateProfile) => void;
  onCancel: () => void;
}

export function ResumeReviewPanel({
  suggestion,
  roleFamilies,
  skills,
  initialLocations = [],
  onSaved,
  onCancel,
}: ResumeReviewPanelProps) {
  const uid = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // The panel replaces the upload card; move focus to it so keyboard and
    // screen-reader users land on the review rather than on nothing.
    headingRef.current?.focus();
  }, []);
  const [roleFamilyKey, setRoleFamilyKey] = useState<string | null>(
    suggestion.roleFamilyKey,
  );
  const [selectedSkillKeys, setSelectedSkillKeys] = useState<Set<string>>(
    () => new Set(suggestion.skills.map((skill) => skill.key)),
  );
  const [experienceBand, setExperienceBand] =
    useState<OpportunityExperienceBand>(suggestion.experienceBand);
  const [workStyle, setWorkStyle] = useState<OpportunityWorkStyle>(
    suggestion.workStyle,
  );
  const [workStyleRequired, setWorkStyleRequired] = useState(
    suggestion.workStyleRequired,
  );
  const [locations, setLocations] = useState<string[]>(initialLocations);
  const [locationInput, setLocationInput] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggleSkill = (key: string) => {
    setSelectedSkillKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addLocation = (event: React.FormEvent) => {
    event.preventDefault();
    const value = locationInput.trim();
    if (!value) return;
    if (
      locations.length < MAX_PROFILE_LOCATIONS &&
      !locations.some((loc) => loc.toLowerCase() === value.toLowerCase())
    ) {
      setLocations((current) => [...current, value]);
    }
    setLocationInput("");
  };

  const matchingSkills = skillSearch.trim()
    ? skills.filter(
        (skill) =>
          !selectedSkillKeys.has(skill.key) &&
          skill.label.toLowerCase().includes(skillSearch.trim().toLowerCase()),
      )
    : [];

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveCandidateProfileAction({
          roleFamilyKey,
          experienceBand,
          skillKeys: Array.from(selectedSkillKeys),
          workStyle,
          workStyleRequired,
          locations,
          source: "resume_upload",
        });
        if (result.success) {
          onSaved(result.profile);
        } else {
          setError(result.error);
        }
      } catch {
        setError(
          "We couldn't save your profile. Please check your connection and try again.",
        );
      }
    });
  };

  return (
    <div className="rounded-2xl border border-terracotta-200 bg-terracotta-50/40 p-5 shadow-2xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="font-heading text-sm font-bold text-navy-900 outline-none"
          >
            Review what we found
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Nothing is saved until you confirm. Edit anything below first. Your
            resume file never leaves your browser — only what you approve here
            is sent to us and saved.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Discard and close"
          className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800"
        >
          {error}
        </p>
      )}

      <div className="mt-4 space-y-5">
        <div>
          <span
            id={`${uid}-role`}
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Role family
          </span>
          <div
            role="group"
            aria-labelledby={`${uid}-role`}
            className="flex flex-wrap gap-1.5"
          >
            {roleFamilies.map((family) => {
              const isSelected = roleFamilyKey === family.key;
              return (
                <button
                  key={family.key}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() =>
                    setRoleFamilyKey(isSelected ? null : family.key)
                  }
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    isSelected
                      ? "bg-navy-900 text-white font-semibold shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {family.label}
                </button>
              );
            })}
          </div>
          {roleFamilyKey === null && (
            <p className="mt-1.5 text-[11px] text-slate-500">
              Not detected — please choose one.
            </p>
          )}
        </div>

        <div>
          <span
            id={`${uid}-skills`}
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Skills
          </span>
          {selectedSkillKeys.size === 0 ? (
            <p className="mb-2 text-[11px] text-slate-500">
              No skills detected — search below to add some.
            </p>
          ) : (
            <div
              role="group"
              aria-labelledby={`${uid}-skills`}
              className="mb-2 flex flex-wrap gap-1.5"
            >
              {Array.from(selectedSkillKeys).map((key) => {
                const label =
                  skills.find((skill) => skill.key === key)?.label ??
                  suggestion.skills.find((skill) => skill.key === key)?.label ??
                  key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={`Remove ${label}`}
                    onClick={() => toggleSkill(key)}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-2xs"
                  >
                    {label}
                    <X className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
          )}
          <input
            type="text"
            value={skillSearch}
            onChange={(event) => setSkillSearch(event.target.value)}
            aria-label="Search skills to add"
            placeholder="Search to add another skill…"
            className="w-full rounded-lg border border-surface-border px-2.5 py-1 text-xs placeholder:text-slate-400 focus:border-navy-900 focus:outline-hidden"
          />
          {matchingSkills.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {matchingSkills.slice(0, 8).map((skill) => (
                <button
                  key={skill.key}
                  type="button"
                  onClick={() => {
                    toggleSkill(skill.key);
                    setSkillSearch("");
                  }}
                  className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200"
                >
                  + {skill.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`${uid}-experience`}
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              Experience
            </label>
            <select
              id={`${uid}-experience`}
              value={experienceBand}
              onChange={(event) =>
                setExperienceBand(
                  event.target.value as OpportunityExperienceBand,
                )
              }
              className="w-full rounded-lg border border-surface-border bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-navy-900 focus:outline-hidden"
            >
              {EXPERIENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor={`${uid}-work-style`}
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              Work style
            </label>
            <select
              id={`${uid}-work-style`}
              value={workStyle}
              onChange={(event) =>
                setWorkStyle(event.target.value as OpportunityWorkStyle)
              }
              className="w-full rounded-lg border border-surface-border bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-navy-900 focus:outline-hidden"
            >
              {WORK_STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="mt-1.5 flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={workStyleRequired}
                onChange={(event) => setWorkStyleRequired(event.target.checked)}
                className="h-3 w-3 rounded border-slate-300 text-terracotta-700 focus:ring-terracotta-700"
              />
              <span className="text-[11px] text-slate-600">Strict filter</span>
            </label>
          </div>
        </div>

        <div>
          <span
            id={`${uid}-locations`}
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Preferred locations (optional)
          </span>
          {locations.length > 0 && (
            <div
              role="group"
              aria-labelledby={`${uid}-locations`}
              className="mb-2 flex flex-wrap gap-1.5"
            >
              {locations.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  aria-label={`Remove ${loc}`}
                  onClick={() =>
                    setLocations((current) =>
                      current.filter((item) => item !== loc),
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-md bg-navy-900 px-2 py-0.5 text-[11px] font-semibold text-white"
                >
                  {loc}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
          <form onSubmit={addLocation} className="flex gap-1.5">
            <input
              type="text"
              value={locationInput}
              onChange={(event) => setLocationInput(event.target.value)}
              aria-label="Add a preferred location"
              maxLength={MAX_PROFILE_LOCATION_CHARS}
              placeholder="e.g. Sydney"
              className="flex-1 rounded-lg border border-surface-border px-2.5 py-1 text-xs placeholder:text-slate-400 focus:border-navy-900 focus:outline-hidden"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              + Add
            </button>
          </form>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        >
          Discard
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleConfirm}
          className="inline-flex items-center gap-1.5 rounded-lg bg-terracotta-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-terracotta-800 disabled:cursor-wait disabled:opacity-60"
        >
          {isPending && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
          Confirm &amp; Save
        </button>
      </div>
    </div>
  );
}
