import type { SkillFit } from "../../lib/jobs/skillFit";

/**
 * "How you match" for one job: the user's saved profile skills against the
 * skills we found in the posting. A native <details> (no client JS). Wording is
 * deliberately modest: see lib/jobs/skillFit.ts.
 */
export function SkillFitPanel({ fit }: { fit: SkillFit }) {
  const skillsWord = fit.statedTotal === 1 ? "skill" : "skills";
  const summary =
    fit.matched.length === 0
      ? `None of the ${fit.statedTotal} ${skillsWord} we found ${fit.statedTotal === 1 ? "is" : "are"} in your profile`
      : `${fit.matched.length} of ${fit.statedTotal} ${skillsWord} we found ${fit.matched.length === 1 && fit.statedTotal === 1 ? "is" : "are"} in your profile`;

  return (
    <details className="group mt-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs">
      <summary className="cursor-pointer select-none font-semibold text-navy-900">
        How you match: {summary}
      </summary>

      <div className="mt-2 space-y-2.5">
        {fit.matched.length > 0 && (
          <div>
            <p className="font-bold text-emerald-800">In your profile</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {fit.matched.map((skill) => (
                <li
                  key={skill.key}
                  title={`Found in the ${skill.evidence}`}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                >
                  {skill.label}
                  <span className="ml-1 font-normal text-emerald-700/80">
                    · {skill.evidence}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {fit.leadWith.length > 0 && (
          <p className="text-slate-700">
            <span className="font-bold text-navy-900">Lead with: </span>
            {fit.leadWith.map((skill) => skill.label).join(", ")} — put these
            first on your CV for this role.
          </p>
        )}

        {fit.missingTotal > 0 && (
          <div>
            <p className="font-bold text-slate-700">Not in your profile</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {fit.missing.map((skill) => (
                <li
                  key={skill.key}
                  title={`Found in the ${skill.evidence}`}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700"
                >
                  {skill.label}
                </li>
              ))}
              {fit.missingTotal > fit.missing.length && (
                <li className="px-1 py-0.5 text-[11px] text-slate-500">
                  and {fit.missingTotal - fit.missing.length} more
                </li>
              )}
            </ul>
            <p className="mt-1 text-slate-500">
              If you do have one of these, add it to your CV and profile.
            </p>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-slate-500">
          Based on the skills we found in this posting and the skills in your
          saved profile. Posting skills are extracted automatically and may be
          incomplete, and this is not a prediction of whether you will be hired.
          We never see your CV.
        </p>
      </div>
    </details>
  );
}
