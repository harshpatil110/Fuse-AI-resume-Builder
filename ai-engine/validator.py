"""
validator.py — Output grounding validators for Fuse AI Engine.

Anti-hallucination layer. The Writer Agent sometimes copy-pastes Job Description
keywords into the Skills section even when the candidate's history provides no
evidence for them (e.g. inventing "AWS" or "ChromaDB"). These validators
intercept the agent's output and drop any proposed skill that is not grounded —
exact keyword or fuzzy/contextual match — in the generated experience and
project bullet points.

Core rule (:func:`validate_skills_grounding`): a proposed skill may stay in the
final Skills list only if its exact form, an alias, or a close fuzzy equivalent
appears in the newly written work/project bullets.

Matching design (deliberate, to avoid both hallucination *and* over-stripping):

* Text is tokenized into alphanumeric *runs* (case preserved); a skill matches a
  bullet when a run equals the skill or is a close fuzzy equivalent. Raw
  substrings are NOT used, so "Rust" can't match "trusted", "Java" can't match
  "JavaScript", and "React" can't match "reactor".
* All-caps acronyms ("ML", "AWS", "AI") are matched case-sensitively, so "ML"
  is never grounded by "10 ml of buffer" and "AI" is never grounded by "aim".
* Skills that are everyday English words ("Go", "AI") can only be grounded by a
  longer contextual alias ("golang"), never by the bare word.
* A curated alias map covers product-name variants and plurals ("PostgreSQL"
  grounds "SQL", "REST APIs" grounds "API", "RStudio" grounds "R",
  "Dockerfiles" grounds "Docker").
* Multi-word skills ("amazon web services", "machine learning") match as a
  normalized phrase or when all words appear in a single bullet — never across
  two unrelated bullets.
"""

from __future__ import annotations

import logging
import re
from difflib import SequenceMatcher
from typing import Iterable, List, Optional, Sequence, Set, Tuple

logger = logging.getLogger(__name__)

# Minimum difflib ratio for a "contextual equivalent" (fuzzy) match.
FUZZY_THRESHOLD = 0.85

# All-caps skills (acronyms like ML, AWS, SQL) are matched case-sensitively.
_ACRONYM_RE = re.compile(r"^[A-Z][A-Z0-9]{1,}$")

# Everyday-English words that must be proven via a longer contextual alias.
_ENGLISH_WORD_ONLY = {"go", "ai"}

_WS_RE = re.compile(r"\s+")
_RUN_RE = re.compile(r"[a-zA-Z0-9]+")

# Canonical skill spelling -> alternate forms that also prove it (product names,
# plurals, abbreviations). Expanded in both directions at lookup time.
_SKILL_ALIASES = {
    "postgresql": {"postgres", "postgre", "psql"},
    "sql": {
        "postgresql", "mysql", "sqlite", "mssql", "sqlserver", "tsql",
        "postgres", "postgre",
    },
    "nodejs": {"node", "node.js"},
    "javascript": {"js"},
    "typescript": {"ts"},
    "csharp": {"c#"},
    "cpp": {"c++"},
    "go": {"golang"},
    "amazon web services": {"aws"},
    "google cloud platform": {"gcp"},
    "kubernetes": {"k8s"},
    "machine learning": {"ml"},
    "artificial intelligence": {"ai"},
    "apis": {"api"},
    "rstudio": {"r"},
    "nextjs": {"next", "next.js"},
    "expressjs": {"express", "express.js"},
    "docker": {"dockerfiles", "dockerized"},
    "reactjs": {"react", "react.js"},
    "html5": {"html"},
    "css3": {"css"},
}


def normalize_skill_text(text: str) -> str:
    """Lowercase and collapse common skill spelling variants to plain words."""
    t = text.lower()
    t = t.replace("c#", "csharp")
    t = t.replace("c++", "cpp")
    t = t.replace(".js", "js")
    t = t.replace(".ts", "ts")
    t = t.replace(".net", " dotnet ")
    t = t.replace(".", " ")
    t = t.replace("-", " ")
    t = _WS_RE.sub(" ", t).strip()
    return t


def skill_name(skill) -> str:
    """Extract the name from a skill entry (string or JSON-Resume dict)."""
    if isinstance(skill, dict):
        return str(skill.get("name") or skill.get("title") or "")
    return str(skill)


def _search_variants(skill: str) -> Set[str]:
    """Return normalized candidate strings that would ground ``skill``.

    Includes the skill itself plus any alias expansion in either direction.
    """
    norm = normalize_skill_text(skill)
    variants: Set[str] = {norm} if norm else set()
    for canonical, alternates in _SKILL_ALIASES.items():
        alt_norms = {normalize_skill_text(alt) for alt in alternates}
        if norm == canonical:
            variants |= alt_norms
        elif norm in alt_norms:
            variants.add(canonical)
            variants |= alt_norms
    return variants


def _single_token_grounded(
    token: str,
    runs: Sequence[str],
    strict_case: bool,
    blocklisted: bool,
) -> bool:
    """Ground a single normalized skill token against the bullet runs."""
    if blocklisted:
        # Everyday-English word — only a longer alias form can prove it.
        return False
    if strict_case:
        upper = token.upper()
        if any(r == upper for r in runs):
            return True
    else:
        if any(r.lower() == token for r in runs):
            return True
    if len(token) >= 4:
        for run in runs:
            if len(run) >= 3 and SequenceMatcher(
                None, token, run.lower()
            ).ratio() >= FUZZY_THRESHOLD:
                return True
    return False


def _multi_word_grounded(
    variant: str,
    joined_norm: str,
    runs_by_bullet: Sequence[Sequence[str]],
) -> bool:
    """Ground a multi-word skill (phrase, or all words within one bullet)."""
    if variant in joined_norm:
        return True
    wanted = set(variant.split())
    for runs in runs_by_bullet:
        lower = {run.lower() for run in runs}
        if wanted <= lower:
            return True
    return False


def validate_skills_grounding(
    generated_bullets: Iterable[str],
    proposed_skills: Sequence,
) -> List:
    """Return only the proposed skills that are grounded in the bullet text.

    A skill survives iff an exact/keyword form — or a close fuzzy/contextual
    equivalent (aliases, near-spellings, product names) — appears in the
    generated experience/project bullet points. Unproven skills (e.g. "ChromaDB"
    when the candidate's history never mentions it) are dropped.

    Args:
        generated_bullets: The newly written experience/project bullet text
            (an iterable of strings, or a single joined string).
        proposed_skills: The skills the agent proposed for the Skills section.

    Returns:
        The original skill entries that are grounded, preserving their type.
    """
    if isinstance(generated_bullets, str):
        bullet_list = [generated_bullets]
    else:
        bullet_list = [str(b) for b in generated_bullets if b]
    if not bullet_list:
        return []

    bullet_sents = [normalize_skill_text(b) for b in bullet_list]
    runs_by_bullet = [_RUN_RE.findall(b) for b in bullet_list]
    joined_norm = " ".join(sent for sent in bullet_sents if sent)
    all_runs = [run for runs in runs_by_bullet for run in runs]
    if not joined_norm:
        return []

    grounded: List = []
    for skill in proposed_skills:
        name = skill_name(skill).strip()
        norm = normalize_skill_text(name)
        if not name or not norm:
            continue

        strict_case = bool(_ACRONYM_RE.match(name))
        blocklisted = norm in _ENGLISH_WORD_ONLY
        ok = False

        for variant in _search_variants(name):
            if " " in variant:
                if _multi_word_grounded(variant, joined_norm, runs_by_bullet):
                    ok = True
                    break
            else:
                is_primary = variant == norm
                if _single_token_grounded(
                    variant,
                    all_runs,
                    strict_case and is_primary,
                    blocklisted and is_primary,
                ):
                    ok = True
                    break

        if ok:
            grounded.append(skill)
    return grounded


def extract_known_skills(resume: dict) -> Optional[Set[str]]:
    """Return the candidate's original skill names, if the parsed resume has any.

    Note: the live pipeline's parsed_resume shapes (the LaTeX ``extracted_data``
    dict with ``sections``/``raw_tex`` and the PDF dict with ``raw_text``/
    ``chunks``) do not expose a top-level ``skills`` list, so this returns
    ``None`` there — original-skill preservation is exercised only by
    JSON-Resume-style inputs and tests. Bullet-evidence grounding still applies
    in all cases.
    """
    if not isinstance(resume, dict):
        return None
    skills = resume.get("skills")
    if not isinstance(skills, list):
        return None
    names = {normalize_skill_text(skill_name(s)) for s in skills}
    names.discard("")
    return names or None


def ground_resume_skills(
    generated_resume: dict,
    known_skills: Optional[Iterable[str]] = None,
) -> dict:
    """Intercept a Writer Agent's JSON output and strip ungrounded skills.

    Skills already present in the candidate's original resume (``known_skills``)
    are preserved — they are facts, not JD hallucination. Any *new* proposed
    skill that is not grounded in the generated bullet points is removed and
    logged. The resume is mutated in place and returned.

    An internal ``_skills_grounding`` audit key is added for observability; it
    should be popped before the resume is serialized to clients (see main.py).
    """
    if not isinstance(generated_resume, dict):
        return generated_resume

    skills = generated_resume.get("skills")
    if not isinstance(skills, list):
        return generated_resume

    bullets = _extract_bullets(generated_resume)
    grounded = validate_skills_grounding(bullets, skills)
    known = {normalize_skill_text(k) for k in (known_skills or [])}

    kept: List = []
    removed: List[str] = []
    for skill in skills:
        name = skill_name(skill)
        if skill in grounded:
            kept.append(skill)
        elif known and normalize_skill_text(name) in known:
            kept.append(skill)
        else:
            removed.append(name)

    if removed:
        logger.warning(
            "[validator] Stripped ungrounded skills (not proven in bullets): %s",
            removed,
        )

    generated_resume["skills"] = kept
    generated_resume["_skills_grounding"] = {
        "removed": removed,
        "kept": [skill_name(s) for s in kept],
    }
    return generated_resume


def _extract_bullets(resume: dict) -> List[str]:
    """Collect the generated narrative text used to prove skill claims."""
    bullets: List[str] = []
    for section_key in ("work", "projects"):
        entries = resume.get(section_key) or []
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            description = entry.get("description")
            if description:
                bullets.append(str(description))
            entry_bullets = entry.get("bullets") or []
            if isinstance(entry_bullets, list):
                bullets.extend(str(b) for b in entry_bullets if b)
    return bullets


def generated_bullet_text(resume: dict) -> str:
    """Joined text of the generated work/project bullets (for fact-checking)."""
    if not isinstance(resume, dict):
        return ""
    return " ".join(_extract_bullets(resume))


# ── Metric / fact-check enforcement ──────────────────────────────────────────
# Number extraction for the zero-tolerance fabrication rule. Catches integers,
# decimals, percentages ("30%"), "2x"-style multipliers, K/M/L-suffixed counts
# ("5K", "10M", "12L"), comma-grouped amounts ("2,000") and ordinals ("1st").
# Numbers glued to letters ("10pt", "a4paper", "MySQL", "v2.0") are NOT matched.
_NUMBER_RE = re.compile(
    r"\b(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:%|x|×|X|[kKmMlL])?(?:st|nd|rd|th)?"
    r"(?![a-zA-Z0-9])"
)
_SAFE_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
_CLAUSE_SPLIT_RE = re.compile(r"(?<=[,;.])\s+")
_CONJUNCTION_RE = re.compile(r"\s+(?:and|but|also|then|while|plus)\s+", re.IGNORECASE)
# LaTeX artifacts that wrap or glue metric tokens in the source .tex: control
# sequences ("\sim", "\textbf", ...) with an optional trailing space, the bare
# backslash of non-alpha escapes ("\%"), math-mode markers ("$"), tildes /
# non-breaking spaces ("~") and plus/minus signs. Control words are replaced
# with a space FIRST so a number glued directly to one ("\sim60") still extracts
# as a standalone token; the remaining single-character artifacts are then
# replaced with spaces so ranges like "5-10" still read as two numbers.
_LATEX_CONTROL_WORD_RE = re.compile(r"\\[a-zA-Z]+\s*")
_LATEX_ARTIFACT_RE = re.compile(r"[\\~$+\-]")


def normalize_metric_text(text: str) -> str:
    """Normalize metric text so equivalent number representations compare equal.

    Strips LaTeX artifacts (control sequences like ``\\sim`` and ``\\textbf``,
    math-mode ``$`` markers, tildes and plus/minus signs) from BOTH sides before
    extraction, so a metric written ``60\\%``, ``$\\sim$60\\%`` or ``\\sim60``
    in the original source LaTeX compares equal to the LLM's clean ``60%``.
    "30 percent" collapses to "30%" and the Unicode multiply sign "×" becomes
    "x". Character case is preserved so reported tokens keep their original
    spelling ("15L", "5K"); :func:`_canonical_number` lowercases internally
    for comparison.
    """
    t = text or ""
    t = _LATEX_CONTROL_WORD_RE.sub(" ", t)
    t = _LATEX_ARTIFACT_RE.sub(" ", t)
    t = re.sub(r"\s*per\s*cent\b", "%", t, flags=re.IGNORECASE)
    t = t.replace("×", "x")
    return t


def extract_numbers(text: str) -> List[str]:
    """Return every number/percentage/decimal token in ``text``, in order."""
    return [match.group(0) for match in _NUMBER_RE.finditer(text or "")]


def _canonical_number(token: str) -> str:
    """Canonical form so equivalent representations of a number compare equal.

    Comparison is on the pure numeric value: the percent and multiplier
    qualifiers ("30%", "1.5x") are dropped, so a LaTeX ``60\\%`` (extracted as
    "60") and the LLM's clean ``60%`` both reduce to "60". Comma grouping is
    stripped ("50,000" -> "50000"), "k"/"K" scales to thousands, uppercase "M"
    to millions and "l"/"L" to lakhs, decimals trim trailing zeros ("3.50" ->
    "3.5") and ordinals fold ("1st" -> "1"). Lowercase "m" is left as-is — it is
    ambiguous (minutes vs meters vs million).
    """
    t = token.replace(",", "").replace("×", "x")
    original = t  # keep case for the M/m disambiguation below
    t = t.lower()
    if t.endswith("%"):
        t = t[:-1]
    elif t.endswith("x"):
        t = t[:-1]
    if t.endswith(("st", "nd", "rd", "th")):
        t = t[:-2]
    elif t.endswith("k"):
        t = str(int(float(t[:-1]) * 1_000))
    elif t.endswith("l"):
        t = str(int(float(t[:-1]) * 100_000))
    elif t.endswith("m") and original.endswith("M"):
        t = str(int(float(t[:-1]) * 1_000_000))
    if "." in t:
        t = t.rstrip("0").rstrip(".") or "0"
    return t


def _is_safe_generic(number: str) -> bool:
    """True for numbers that are not fabricated metrics.

    Two categories are treated as safe generic numbers: calendar years
    (1900-2099) and phone-like digit runs (10-15 digits), so a reformatted
    contact number is never mistaken for a hallucinated metric.

    Note: the year rule is intentionally broad. A four-digit metric that
    happens to fall in the year range would be missed — accepted as a
    documented limitation per the zero-tolerance design's "safe generic
    numbers" allowance.
    """
    if _SAFE_YEAR_RE.fullmatch(number):
        return True
    digits = re.sub(r"\D", "", number)
    return 10 <= len(digits) <= 15


def verify_metrics_integrity(original_text: str, generated_text: str) -> List[str]:
    """Return numbers in ``generated_text`` that are absent from ``original_text``.

    Years (1900-2099) are treated as safe generic numbers and ignored. Any
    returned number is a potentially fabricated metric — e.g. a "30%" latency
    reduction that never appeared in the candidate's real resume. Comparison is
    on the pure numeric value (:func:`_canonical_number` drops the "%"/"x"
    qualifiers), so LaTeX ``60\\%`` in the original and the LLM's clean ``60%``
    compare equal, and "50,000" / "50k" are the same fact. Only a genuinely new
    numeric value (e.g. "45%" when the original has "30") is flagged.
    """
    orig_norm = normalize_metric_text(original_text)
    gen_norm = normalize_metric_text(generated_text)
    allowed = {
        _canonical_number(n)
        for n in extract_numbers(orig_norm)
        if not _is_safe_generic(n)
    }
    generated = extract_numbers(gen_norm)
    return sorted(
        {
            n
            for n in generated
            if _canonical_number(n) not in allowed and not _is_safe_generic(n)
        },
        key=lambda n: (len(n), n),
    )


def _clause_numbers(clause: str) -> Set[str]:
    """Canonical numbers present in a single clause."""
    return {
        _canonical_number(n)
        for n in extract_numbers(normalize_metric_text(clause))
    }


def strip_hallucinated_metrics(
    bullets: Sequence[str],
    hallucinated: Sequence[str],
) -> List[str]:
    """Remove clauses containing hallucinated numbers from ``bullets``.

    A clause is dropped only when it contains an exact (canonical) fabricated
    number — so a real "2.5" is never matched by a hallucinated "5" and "9:00"
    is never matched by a hallucinated "00". When a clause mixes a fabricated
    number with real claims, it is split on conjunctions and only the fabricated
    sub-clause is removed, preserving the legitimate content. A bullet reduced
    to nothing is removed entirely.
    """
    if not hallucinated:
        return list(bullets)
    hall = {_canonical_number(h) for h in hallucinated}

    cleaned: List[str] = []
    for bullet in bullets:
        clauses = [
            c.strip().rstrip(",;.")
            for c in _CLAUSE_SPLIT_RE.split(bullet)
            if c.strip()
        ]
        kept_clauses: List[str] = []
        for clause in clauses:
            if not _clause_numbers(clause) & hall:
                kept_clauses.append(clause)
                continue
            # Keep the sub-clauses of a mixed clause that are clean.
            clean_parts = [
                part.strip()
                for part in _CONJUNCTION_RE.split(clause)
                if part.strip() and not _clause_numbers(part) & hall
            ]
            if clean_parts:
                kept_clauses.append(" ".join(clean_parts))
        if kept_clauses:
            cleaned.append(", ".join(kept_clauses))
    return cleaned


def enforce_metrics_integrity(
    generated_resume: dict,
    original_text: str,
) -> Tuple[dict, List[str]]:
    """Strip any hallucinated metric clauses from the generated resume.

    Compares every generated work/project bullet against ``original_text`` (the
    candidate's real resume — the only permitted source of numbers). Clauses
    containing numbers absent from it (and not safe years) are removed. Returns
    ``(resume, hallucinated_numbers)``; the resume is returned unchanged if no
    hallucinated numbers were found.
    """
    if not isinstance(generated_resume, dict):
        return generated_resume, []
    bullets = _extract_bullets(generated_resume)
    if not bullets:
        return generated_resume, []

    hallucinated = verify_metrics_integrity(original_text, " ".join(bullets))
    if not hallucinated:
        return generated_resume, []

    logger.warning(
        "[validator] Stripped hallucinated metric clauses containing: %s",
        hallucinated,
    )
    for section_key in ("work", "projects"):
        entries = generated_resume.get(section_key) or []
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if isinstance(entry, dict) and isinstance(entry.get("bullets"), list):
                entry["bullets"] = strip_hallucinated_metrics(
                    entry["bullets"], hallucinated
                )
    return generated_resume, hallucinated


def extract_original_text(resume: dict) -> str:
    """Concatenate the candidate's original resume text (metric source of truth).

    Handles every ingestion shape: the LaTeX ``extracted_data`` dict
    (``raw_tex`` / ``sections``), the PDF ``extract_resume_data`` dict
    (``raw_text`` / ``chunks``), and a JSON-Resume dict (``work`` / ``projects``
    / ``skills``). The Writer may only reuse numbers present here.
    """
    if not isinstance(resume, dict):
        return ""
    parts: List[str] = []
    for key in ("raw_tex", "raw_text"):
        raw = resume.get(key)
        if isinstance(raw, str):
            parts.append(raw)
    sections = resume.get("sections")
    if isinstance(sections, dict):
        parts.extend(str(v) for v in sections.values() if v)
    chunks = resume.get("chunks")
    if isinstance(chunks, list):
        parts.extend(str(c) for c in chunks if c)
    for section_key in ("work", "projects"):
        entries = resume.get(section_key) or []
        if isinstance(entries, list):
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                if entry.get("summary"):
                    parts.append(str(entry["summary"]))
                for bullet in entry.get("bullets") or []:
                    if bullet:
                        parts.append(str(bullet))
    skills = resume.get("skills")
    if isinstance(skills, list):
        parts.extend(str(s) for s in skills if s)
    return " ".join(parts)
