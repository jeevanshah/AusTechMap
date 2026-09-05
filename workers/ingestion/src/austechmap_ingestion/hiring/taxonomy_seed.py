"""Seeds role_families (verbatim from PRODUCT_SPEC.md Appendix A.2, a
genuinely frozen taxonomy) and skills (a new v1 starter list this phase
authors -- Appendix A does not freeze a skills taxonomy). Idempotent
upsert, matching employers/seed.py's established convention: plain
Python constants, not inline migration INSERT."""

from __future__ import annotations

from dataclasses import dataclass

import psycopg

ROLE_FAMILIES: tuple[tuple[str, str], ...] = (
    ("software-engineering", "Software Engineering"),
    ("data", "Data"),
    ("ai-ml", "AI / ML"),
    ("cloud-platform", "Cloud / Platform"),
    ("security", "Security"),
    ("quality", "Quality"),
    ("product-delivery", "Product / Delivery"),
    ("design", "Design"),
    ("architecture", "Architecture"),
    ("it-infrastructure", "IT / Infrastructure"),
)


@dataclass(frozen=True)
class SkillSeed:
    key: str
    label: str
    category: str
    aliases: tuple[str, ...] = ()


SKILLS: tuple[SkillSeed, ...] = (
    SkillSeed("python", "Python", "language"),
    SkillSeed("javascript", "JavaScript", "language", ("JS",)),
    SkillSeed("typescript", "TypeScript", "language", ("TS",)),
    SkillSeed("java", "Java", "language"),
    SkillSeed("csharp", "C#", "language", ("C Sharp", "CSharp")),
    SkillSeed("golang", "Go", "language", ("Golang",)),
    SkillSeed("rust", "Rust", "language"),
    SkillSeed("ruby", "Ruby", "language"),
    SkillSeed("kotlin", "Kotlin", "language"),
    SkillSeed("swift", "Swift", "language"),
    SkillSeed("sql", "SQL", "language"),
    SkillSeed("react", "React", "framework", ("React.js", "ReactJS")),
    SkillSeed("angular", "Angular", "framework"),
    SkillSeed("vuejs", "Vue.js", "framework", ("VueJS", "Vue")),
    SkillSeed("nodejs", "Node.js", "framework", ("NodeJS", "Node")),
    SkillSeed("nextjs", "Next.js", "framework", ("NextJS",)),
    SkillSeed("django", "Django", "framework"),
    SkillSeed("spring", "Spring", "framework", ("Spring Boot",)),
    SkillSeed("dotnet", ".NET", "framework", ("ASP.NET",)),
    SkillSeed("rails", "Ruby on Rails", "framework", ("Rails",)),
    SkillSeed("aws", "AWS", "cloud", ("Amazon Web Services",)),
    SkillSeed("azure", "Azure", "cloud", ("Microsoft Azure",)),
    SkillSeed("gcp", "Google Cloud Platform", "cloud", ("GCP", "Google Cloud")),
    SkillSeed("docker", "Docker", "devops_tool"),
    SkillSeed("kubernetes", "Kubernetes", "devops_tool", ("K8s",)),
    SkillSeed("terraform", "Terraform", "devops_tool"),
    SkillSeed("jenkins", "Jenkins", "devops_tool"),
    SkillSeed("github_actions", "GitHub Actions", "devops_tool"),
    SkillSeed("postgresql", "PostgreSQL", "database", ("Postgres",)),
    SkillSeed("mysql", "MySQL", "database"),
    SkillSeed("mongodb", "MongoDB", "database", ("Mongo",)),
    SkillSeed("redis", "Redis", "database"),
    SkillSeed("kafka", "Kafka", "data", ("Apache Kafka",)),
    SkillSeed("graphql", "GraphQL", "other"),
    SkillSeed("machine_learning", "Machine Learning", "ai_ml", ("ML",)),
    SkillSeed("solidity", "Solidity", "blockchain"),
)


@dataclass(frozen=True)
class TaxonomySeedStats:
    role_families_created: int
    skills_created: int


def seed_taxonomy(database_url: str) -> TaxonomySeedStats:
    role_families_created = skills_created = 0
    with psycopg.connect(database_url, autocommit=True) as connection:
        for key, label in ROLE_FAMILIES:
            inserted = connection.execute(
                """
                INSERT INTO role_families (key, label)
                VALUES (%s, %s)
                ON CONFLICT (key) DO NOTHING
                RETURNING id
                """,
                (key, label),
            ).fetchone()
            if inserted is not None:
                role_families_created += 1

        for skill in SKILLS:
            inserted = connection.execute(
                """
                INSERT INTO skills (key, label, category, aliases)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (key) DO NOTHING
                RETURNING id
                """,
                (skill.key, skill.label, skill.category, list(skill.aliases)),
            ).fetchone()
            if inserted is not None:
                skills_created += 1

    return TaxonomySeedStats(
        role_families_created=role_families_created, skills_created=skills_created
    )
