import { describe, expect, it } from "vitest";

import {
  classifyExperienceBand,
  classifyRoleFamily,
  classifyWorkStyle,
  extractSkillMatches,
  isNegated,
  type SkillCandidate,
} from "./resumeClassifiers";

const NOW = new Date("2026-10-09T00:00:00Z");

// Snapshot of the v1 starter list in
// workers/ingestion/src/austechmap_ingestion/hiring/taxonomy_seed.py.
// Update this when that seed changes.
const SEEDED_SKILLS: SkillCandidate[] = [
  { key: "python", label: "Python", aliases: [] },
  { key: "javascript", label: "JavaScript", aliases: ["JS"] },
  { key: "typescript", label: "TypeScript", aliases: ["TS"] },
  { key: "java", label: "Java", aliases: [] },
  { key: "csharp", label: "C#", aliases: ["C Sharp", "CSharp"] },
  { key: "golang", label: "Go", aliases: ["Golang"] },
  { key: "rust", label: "Rust", aliases: [] },
  { key: "ruby", label: "Ruby", aliases: [] },
  { key: "kotlin", label: "Kotlin", aliases: [] },
  { key: "swift", label: "Swift", aliases: [] },
  { key: "sql", label: "SQL", aliases: [] },
  { key: "react", label: "React", aliases: ["React.js", "ReactJS"] },
  { key: "angular", label: "Angular", aliases: [] },
  { key: "vuejs", label: "Vue.js", aliases: ["VueJS", "Vue"] },
  { key: "nodejs", label: "Node.js", aliases: ["NodeJS", "Node"] },
  { key: "nextjs", label: "Next.js", aliases: ["NextJS"] },
  { key: "django", label: "Django", aliases: [] },
  { key: "spring", label: "Spring", aliases: ["Spring Boot"] },
  { key: "dotnet", label: ".NET", aliases: ["ASP.NET"] },
  { key: "rails", label: "Ruby on Rails", aliases: ["Rails"] },
  { key: "aws", label: "AWS", aliases: ["Amazon Web Services"] },
  { key: "azure", label: "Azure", aliases: ["Microsoft Azure"] },
  {
    key: "gcp",
    label: "Google Cloud Platform",
    aliases: ["GCP", "Google Cloud"],
  },
  { key: "docker", label: "Docker", aliases: [] },
  { key: "kubernetes", label: "Kubernetes", aliases: ["K8s"] },
  { key: "terraform", label: "Terraform", aliases: [] },
  { key: "jenkins", label: "Jenkins", aliases: [] },
  { key: "github_actions", label: "GitHub Actions", aliases: [] },
  { key: "postgresql", label: "PostgreSQL", aliases: ["Postgres"] },
  { key: "mysql", label: "MySQL", aliases: [] },
  { key: "mongodb", label: "MongoDB", aliases: ["Mongo"] },
  { key: "redis", label: "Redis", aliases: [] },
  { key: "kafka", label: "Kafka", aliases: ["Apache Kafka"] },
  { key: "graphql", label: "GraphQL", aliases: [] },
  { key: "machine_learning", label: "Machine Learning", aliases: ["ML"] },
  { key: "solidity", label: "Solidity", aliases: [] },
];

function skillKeys(text: string): string[] {
  return extractSkillMatches(text, SEEDED_SKILLS).map((match) => match.key);
}

describe("classifyRoleFamily", () => {
  it("matches a clearly software-engineering resume", () => {
    const text =
      "Senior Backend Engineer with 6 years building full stack services.";
    expect(classifyRoleFamily(text)).toBe("software-engineering");
  });

  it("returns null when nothing matches", () => {
    const text = "Enjoys hiking, painting, and community volunteering.";
    expect(classifyRoleFamily(text)).toBeNull();
  });

  it("returns null on a tie between two families", () => {
    // One keyword hit each for software-engineering and data -- a genuine
    // tie, not a guessed default.
    const text = "Backend developer who also works as a data analyst.";
    expect(classifyRoleFamily(text)).toBeNull();
  });

  it.each([
    ["Full-Stack Developer at Acme", "software-engineering"],
    ["Software Developer, Foo Pty Ltd", "software-engineering"],
    ["DevOps engineer focused on site reliability", "cloud-platform"],
    ["Data scientist applying data science to churn", "data"],
    ["UX designer and UI designer", "design"],
    ["Project manager and scrum master", "product-delivery"],
  ])("recognises resume vocabulary: %s", (text, expected) => {
    expect(classifyRoleFamily(text)).toBe(expected);
  });
});

describe("classifyExperienceBand", () => {
  it.each([
    ["Jane Example\nSenior Software Engineer\njane@example.com", "senior"],
    ["Jane Example\nSr. Software Engineer\njane@example.com", "senior"],
    ["Jane Example\nEngineering Manager\njane@example.com", "lead_principal"],
    ["Jane Example\nCTO\njane@example.com", "lead_principal"],
    ["Jane Example\nPrincipal Engineer\njane@example.com", "lead_principal"],
    ["Jane Example\nJunior Developer\njane@example.com", "entry"],
    ["Jane Example\nGraduate Software Engineer\njane@example.com", "entry"],
  ])("reads a seniority keyword from the header: %j", (text, expected) => {
    expect(classifyExperienceBand(text, NOW)).toBe(expected);
  });

  it.each([
    // A job title is not a seniority level.
    "Jane Example\nProduct Manager\njane@example.com",
    "Jane Example\nProject Manager\njane@example.com",
    // Qualifications and prose that merely contain a seniority word.
    "Jane Example\nGraduate Diploma in Information Technology\njane@example.com",
    "Jane Example\nPrincipal responsibilities included delivery.",
  ])(
    "does not read seniority from a plain title or qualification: %j",
    (header) => {
      // With no dated experience there is nothing else to go on...
      expect(classifyExperienceBand(header, NOW)).toBe("any");
      // ...and with 16 years of dated experience, years decide instead.
      expect(
        classifyExperienceBand(`${header}\nAcme  2010 - Present`, NOW),
      ).toBe("senior");
    },
  );

  it("ignores seniority keywords outside the header", () => {
    // Mentions of "manager" and "senior" in the body describe other people
    // and must not decide the candidate's own level.
    const filler = "Skilled at delivering reliable software.\n".repeat(12);
    const text = [
      "Jane Example",
      "jane@example.com | Sydney NSW",
      filler,
      "Reported to the Engineering Manager and presented to senior stakeholders.",
      "Acme Pty Ltd  2018 - Present",
    ].join("\n");
    expect(classifyExperienceBand(text, NOW)).toBe("senior");
  });

  it.each([
    ["Engineer, Acme  2025 - Present", "entry"],
    ["Engineer, Acme  Jan 2023 – Present", "mid"],
    ["Engineer, Acme  January 2021 - March 2024", "mid"],
    ["Engineer, Acme  01/2018 - 03/2023", "senior"],
    ["Engineer, Acme  2019 to 2022", "mid"],
    ["Engineer, Acme  2016—2020", "mid"],
    ["Engineer, Acme  Sept 2012 - Present", "senior"],
  ])("estimates years from date ranges: %s", (text, expected) => {
    expect(classifyExperienceBand(text, NOW)).toBe(expected);
  });

  it("sums separate jobs but merges overlapping ones", () => {
    const separate = "Jan 2020 - Dec 2021\nMar 2022 - Present";
    expect(classifyExperienceBand(separate, NOW)).toBe("senior");

    const overlapping = "2018 - 2020\n2019 - 2021";
    // Merged to 2018-2021 = 3 years, not 2 + 2 = 4.
    expect(classifyExperienceBand(overlapping, NOW)).toBe("mid");
  });

  it("never suggests lead_principal from years alone", () => {
    expect(classifyExperienceBand("Engineer, Acme  2000 - Present", NOW)).toBe(
      "senior",
    );
  });

  it("ignores education dates on the same line", () => {
    const text = [
      "Bachelor of Science, University of Sydney  2012 - 2015",
      "Software Engineer, Acme  2024 - Present",
    ].join("\n");
    // Only 2024-2026 counts (2 years), not the degree's 2012-2015.
    expect(classifyExperienceBand(text, NOW)).toBe("mid");
  });

  it("ignores dates inside an Education section", () => {
    const text = [
      "Education",
      "University of Sydney",
      "2012 - 2015",
      "Experience",
      "Software Engineer, Acme  2024 - Present",
    ].join("\n");
    expect(classifyExperienceBand(text, NOW)).toBe("mid");
  });

  it("ends an Education section at a heading it recognises", () => {
    const text = [
      "Education",
      "University of Sydney",
      "2012 - 2015",
      "Professional Background",
      "Software Engineer, Acme  2020 - Present",
    ].join("\n");
    expect(classifyExperienceBand(text, NOW)).toBe("senior");
  });

  it("does not mistake Scrum Master for a master's degree", () => {
    expect(classifyExperienceBand("Scrum Master, Acme  2018 - 2024", NOW)).toBe(
      "senior",
    );
  });

  it("returns any when no signal is present", () => {
    expect(classifyExperienceBand("Built things with computers.", NOW)).toBe(
      "any",
    );
  });

  it("ignores implausible future ranges", () => {
    expect(classifyExperienceBand("Acme  2030 - 2035", NOW)).toBe("any");
  });
});

describe("extractSkillMatches", () => {
  describe("every seeded skill is detectable by label and alias", () => {
    for (const skill of SEEDED_SKILLS) {
      for (const form of [skill.label, ...skill.aliases]) {
        it(`${skill.key}: "${form}"`, () => {
          expect(
            skillKeys(`Hands-on experience with ${form} and testing.`),
          ).toContain(skill.key);
        });
      }
    }
  });

  it("matches skills whose names start or end with punctuation", () => {
    const keys = skillKeys("Delivered services in C# and .NET on Azure.");
    expect(keys).toEqual(expect.arrayContaining(["csharp", "dotnet", "azure"]));
  });

  it("does not match a short skill inside a longer word", () => {
    // "Java" must not fire for JavaScript, nor "Go" for Golang prose.
    const keys = skillKeys("Wrote JavaScript for the browser.");
    expect(keys).toContain("javascript");
    expect(keys).not.toContain("java");
  });

  it("ignores everyday-English uses of ambiguous skill names", () => {
    const text =
      "Led the go-live for a go-to-market launch, reacted to swift changes in " +
      "the spring, and installed guard rails around the node pool.";
    expect(skillKeys(text)).toEqual([]);
  });

  it.each([
    "Spring 2019 semester abroad",
    "Owned the Go-to-market plan",
    "Integrated SWIFT payments for the bank",
  ])("ignores capitalised non-skill uses: %s", (text) => {
    expect(skillKeys(text)).toEqual([]);
  });

  it("still matches the framework, language and compound forms", () => {
    expect(skillKeys("Built services with Spring Boot")).toContain("spring");
    expect(skillKeys("Spring, Hibernate and Kafka")).toContain("spring");
    expect(skillKeys("Go, Python and SQL")).toContain("golang");
  });

  it("still matches ambiguous skill names in canonical or ALL-CAPS form", () => {
    expect(skillKeys("Languages: Go, Rust, Swift, Ruby")).toEqual(
      expect.arrayContaining(["golang", "rust", "swift", "ruby"]),
    );
    expect(skillKeys("SKILLS: PYTHON, GO, REACT, SPRING")).toEqual(
      expect.arrayContaining(["python", "golang", "react", "spring"]),
    );
  });

  it("is case-insensitive for unambiguous names", () => {
    expect(skillKeys("strong typescript and PYTHON background")).toEqual(
      expect.arrayContaining(["typescript", "python"]),
    );
  });

  it("returns no matches for unrelated text", () => {
    expect(skillKeys("Enjoys baking sourdough bread.")).toEqual([]);
  });

  it("excludes a negated skill mention", () => {
    const text = "No experience with PHP. Proficient in Python.";
    const matches = extractSkillMatches(text, [
      { key: "php", label: "PHP", aliases: [] },
      { key: "python", label: "Python", aliases: [] },
    ]);
    expect(matches.map((match) => match.key)).toEqual(["python"]);
  });

  it("treats a curly-apostrophe negation like a straight one", () => {
    // PDFs and word processors usually emit "don’t", not "don't".
    const matches = extractSkillMatches("I don’t have experience with PHP.", [
      { key: "php", label: "PHP", aliases: [] },
    ]);
    expect(matches).toEqual([]);
  });

  it("returns each skill once even if mentioned repeatedly", () => {
    const keys = skillKeys("Python, Python, and more Python.");
    expect(keys.filter((key) => key === "python")).toHaveLength(1);
  });
});

describe("classification cost", () => {
  it("stays fast when every mention in a very long text is negated", () => {
    // Re-scanning all preceding text for each negated match was quadratic:
    // ~9s at 200K characters for four skills.
    const text = "no Python no TypeScript no Go no React ".repeat(5_200);
    const start = performance.now();
    expect(skillKeys(text)).toEqual([]);
    expect(performance.now() - start).toBeLessThan(1_500);
  });
});

describe("isNegated", () => {
  it("does not let a window that starts mid-word create a fake negation", () => {
    // The 120-character lookback would begin at "not" inside "knot".
    const text = "x".repeat(10) + "knot" + " ".repeat(117) + "Python";
    expect(isNegated(text, text.indexOf("Python"))).toBe(false);
  });

  it("still counts a match when a negation word is far before it", () => {
    const text =
      "No interest in gardening whatsoever. Five years of professional PHP development.";
    const phpIndex = text.toLowerCase().indexOf("php");
    expect(isNegated(text, phpIndex)).toBe(false);
  });

  it("flags a match preceded closely by a negation word", () => {
    const text = "Has no experience with PHP.";
    expect(isNegated(text, text.indexOf("PHP"))).toBe(true);
  });
});

describe("classifyWorkStyle", () => {
  it("detects an explicit remote preference", () => {
    expect(
      classifyWorkStyle("Seeking remote opportunities only.").workStyle,
    ).toBe("remote");
  });

  it("defaults to any with no explicit preference", () => {
    const result = classifyWorkStyle("Experienced backend engineer.");
    expect(result.workStyle).toBe("any");
    expect(result.workStyleRequired).toBe(false);
  });
});
