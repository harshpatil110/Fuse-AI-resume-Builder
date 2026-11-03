"""
github_fetch.py — GitHub repository enrichment and LaTeX project injection.

The GitHub integration in Fuse works in three steps:

1. :func:`enrich_repos` normalizes selected repositories, fetching missing
   metadata (description, language, topics, stars) from the public GitHub API.
   Public repos work unauthenticated; on any network/auth failure it falls back
   to curated mock data so the pipeline stays testable.
2. :func:`generate_github_bullets` turns each repo into 1-3 resume bullet
   points via the Writer LLM (falling back to a deterministic description-based
   bullet if the model call fails).
3. :func:`inject_github_projects` builds the classic Jake's-Resume syntax
   ``\\resumeProjectHeading{\\textbf{Name} $|$ \\href{URL}{\\myuline{URL}}}{}``
   followed by ``\\resumeItemListStart`` / ``\\resumeItem{...}`` /
   ``\\resumeItemListEnd`` and appends the blocks into a Projects section body.
"""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.request
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com/repos"
GITHUB_USER_API = "https://api.github.com/users"
_UA = {"User-Agent": "Fuse-AI-Engine", "Accept": "application/vnd.github+json"}
token = os.getenv("GITHUB_TOKEN")
if token:
    _UA["Authorization"] = f"Bearer {token}"

# Characters that are special in LaTeX and must be escaped when injecting
# free-text (e.g. GitHub descriptions) into a .tex document.
_LATEX_SPECIAL_CHARS = {
    "&": r"\&",
    "%": r"\%",
    "#": r"\#",
    "_": r"\_",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


def escape_latex(text: str) -> str:
    """Escape characters that are special in LaTeX so *text* is safe to inject.

    Handles ``& % # _ ~ ^`` — the most common offenders in GitHub
    descriptions, topic tags, and README snippets.  Braces and backslashes
    are left untouched because they may be intentional LaTeX commands in
    content that has already been through the template pipeline.
    """
    for char, replacement in _LATEX_SPECIAL_CHARS.items():
        text = text.replace(char, replacement)
    return text


# ── GitHub URL extraction from LaTeX bodies ──────────────────────────────────

_GITHUB_URL_RE = re.compile(
    r"https?://github\.com/([A-Za-z0-9\-_.]+)/([A-Za-z0-9\-_.]+)",
)


def extract_github_urls(section_body: str) -> List[Dict[str, str]]:
    """Extract all ``github.com/{owner}/{repo}`` URLs from a LaTeX section body.

    Returns a list of ``{"owner": ..., "repo": ..., "url": ...}`` dicts,
    deduplicated by ``(owner, repo)`` (case-insensitive).
    """
    seen: set = set()
    results: List[Dict[str, str]] = []
    for match in _GITHUB_URL_RE.finditer(section_body):
        owner = match.group(1)
        repo = match.group(2).removesuffix(".git")
        key = (owner.lower(), repo.lower())
        if key not in seen:
            seen.add(key)
            results.append({
                "owner": owner,
                "repo": repo,
                "url": match.group(0),
            })
    return results


def fetch_github_repo_context(section_body: str) -> str:
    """Extract GitHub URLs from *section_body*, fetch their metadata, and
    return a structured context string for the LLM prompt.

    Each repo block includes description, primary language, topics, and
    star count — all sourced from the public GitHub API.  On any failure
    (network, rate-limit 403, 404) the repo is logged and skipped so the
    pipeline never crashes.

    Returns an empty string if no GitHub URLs are found or all fetches fail.
    """
    urls = extract_github_urls(section_body)
    if not urls:
        return ""

    context_blocks: List[str] = []
    for entry in urls:
        owner, repo_name, url = entry["owner"], entry["repo"], entry["url"]
        try:
            data = _fetch_one(owner, repo_name)
            desc = (data.get("description") or "No description.").strip()
            lang = (data.get("language") or "Not specified").strip()
            topics = data.get("topics") or []
            stars = data.get("stargazers_count", 0)
            readme_snippet = _fetch_readme_snippet(owner, repo_name)

            block = (
                f"Repository: {repo_name}\n"
                f"  URL: {url}\n"
                f"  Description: {desc}\n"
                f"  Primary Language: {lang}\n"
                f"  Topics/Tags: {', '.join(topics) if topics else 'None'}\n"
                f"  Stars: {stars}\n"
            )
            if readme_snippet:
                block += f"  README Snippet: {readme_snippet}\n"

            context_blocks.append(block)
            logger.info("[github] Fetched context for %s/%s", owner, repo_name)

        except Exception as error:
            logger.warning(
                "[github] Failed to fetch %s/%s (%s); skipping.",
                owner, repo_name, error,
            )
            # Graceful fallback: use mock data if available
            for mock in MOCK_GITHUB_REPOS:
                if repo_name.lower() in mock["name"].lower() or mock["name"].lower() in repo_name.lower():
                    block = (
                        f"Repository: {mock['name']}\n"
                        f"  URL: {mock['url']}\n"
                        f"  Description: {mock['description']}\n"
                        f"  Primary Language: {mock['language']}\n"
                        f"  Topics/Tags: {', '.join(mock['topics'])}\n"
                        f"  Stars: {mock['stars']}\n"
                    )
                    context_blocks.append(block)
                    break

    if not context_blocks:
        return ""

    return (
        "The following GitHub repository data was fetched from the GitHub API. "
        "Use this FACTUAL data to enrich the project bullet points. "
        "Only reference technologies and facts that appear in this data or in "
        "the original resume. Do NOT hallucinate or invent any data.\n\n"
        + "\n".join(context_blocks)
    )


def _fetch_readme_snippet(owner: str, name: str, max_chars: int = 300) -> str:
    """Fetch the first *max_chars* of a repo's README (best-effort).

    Returns an empty string on any failure (404, rate-limit, etc.).
    """
    try:
        request = urllib.request.Request(
            f"{GITHUB_API}/{owner}/{name}/readme",
            headers={**_UA, "Accept": "application/vnd.github.raw+json"},
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read().decode("utf-8", errors="replace")
            # Strip markdown headers and blank lines for a clean snippet
            lines = [
                line.strip()
                for line in raw.splitlines()
                if line.strip() and not line.strip().startswith("#")
            ]
            snippet = " ".join(lines)[:max_chars]
            return snippet.strip()
    except Exception:
        return ""

def fetch_user_portfolio(username: str) -> str:
    """Fetch the user's entire public portfolio from GitHub.

    Queries ``https://api.github.com/users/{username}/repos`` to get all public
    repositories sorted by updated date (handles pagination up to 100 repos).
    Extracts repo name, description, language, and topics for each. Excludes
    repos that match the username (i.e. profile READMEs).

    Returns a JSON string mapping repo names to their metadata with LaTeX-safe
    escaped strings. On failure (403, 404, network), returns an empty string.
    """
    if not username:
        return ""
    try:
        all_repos = []
        page = 1
        per_page = 100
        max_repos = 100  # Cap to avoid excessive API calls

        while len(all_repos) < max_repos:
            request = urllib.request.Request(
                f"{GITHUB_USER_API}/{username}/repos?sort=updated&per_page={per_page}&page={page}",
                headers=_UA,
            )
            with urllib.request.urlopen(request, timeout=10) as response:
                data = json.loads(response.read().decode("utf-8"))

            if not data:
                break

            all_repos.extend(data)
            if len(data) < per_page:
                break
            page += 1

        # Limit to max_repos
        all_repos = all_repos[:max_repos]

        portfolio = {}
        for repo in all_repos:
            repo_name = repo.get("name", "")
            # Skip profile README repositories
            if repo_name.lower() == username.lower():
                continue

            # Escape LaTeX special characters in all text fields
            desc = escape_latex((repo.get("description") or "").strip())
            lang = escape_latex((repo.get("language") or "").strip())
            topics = [escape_latex(t) for t in (repo.get("topics") or [])]
            url = repo.get("html_url") or ""

            portfolio[repo_name] = {
                "description": desc,
                "language": lang,
                "topics": topics,
                "url": url,
            }
        return json.dumps(portfolio, indent=2)
    except Exception as error:
        logger.warning(
            "[github] Failed to fetch portfolio for user %s (%s); falling back.",
            username, error
        )
        return ""

# Curated mock repositories used when the GitHub API is unreachable or the
# request is unauthenticated. Keep descriptions realistic so generated bullets
# sound like real project experience.
MOCK_GITHUB_REPOS: List[Dict] = [
    {
        "name": "O.N.E.",
        "url": "https://github.com/harshpatil110/one",
        "description": "AI-powered note-taking app with retrieval-augmented "
                       "generation over personal documents.",
        "language": "Python",
        "topics": ["rag", "llm", "fastapi"],
        "stars": 12,
    },
    {
        "name": "NeuroNet",
        "url": "https://github.com/harshpatil110/neuronet",
        "description": "Neural network training and inference library with "
                       "hand-written CUDA kernels for GPU speedups.",
        "language": "C++",
        "topics": ["deep-learning", "cuda", "cpp"],
        "stars": 8,
    },
    {
        "name": "Fuse",
        "url": "https://github.com/harshpatil110/fuse",
        "description": "Career optimization web app that recompiles custom "
                       "LaTeX resumes to PDF while preserving ATS formatting.",
        "language": "TypeScript",
        "topics": ["react", "nodejs", "fastapi", "latex"],
        "stars": 3,
    },
]


def _owner_repo(url_or_name: str) -> Optional[tuple]:
    """Best-effort extraction of ``(owner, repo)`` from a GitHub URL or name."""
    match = re.search(r"github\.com[/:]([^/]+)/([^/?#]+)", url_or_name or "")
    if match:
        return match.group(1), match.group(2).removesuffix(".git")
    parts = (url_or_name or "").strip("/").split("/")
    if len(parts) >= 2 and parts[-1]:
        return parts[-2], parts[-1]
    return None


def _fetch_one(owner: str, name: str) -> Dict:
    request = urllib.request.Request(
        f"{GITHUB_API}/{owner}/{name}", headers=_UA
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def enrich_repo(repo: Dict) -> Dict:
    """Return a normalized repo dict, fetching missing fields from GitHub.

    Fields already present (e.g. from the gateway's authenticated sync) are
    kept as-is; only missing descriptions trigger a public API call. On failure
    a best-effort mock fallback is applied so tests and unauthenticated flows
    still produce useful bullets.
    """
    name = repo.get("name")
    url = repo.get("url") or (
        f"https://github.com/{name}" if name else ""
    )
    if not name and url:
        name = url.rstrip("/").split("/")[-1]

    out = {
        "name": name or "Project",
        "url": url or f"https://github.com/{name or 'project'}",
        "description": (repo.get("description") or "").strip(),
        "language": (repo.get("language") or "").strip(),
        "topics": list(repo.get("topics") or []),
        "stars": repo.get("stars") or 0,
    }

    if not out["description"]:
        try:
            parsed = _owner_repo(out["url"])
            if parsed:
                data = _fetch_one(*parsed)
                out["description"] = (data.get("description") or "").strip()
                out["language"] = out["language"] or (data.get("language") or "")
                out["topics"] = out["topics"] or (data.get("topics") or [])
                out["stars"] = out["stars"] or (data.get("stargazers_count") or 0)
        except Exception as error:  # network / auth / rate-limit — mock fallback
            logger.warning(
                "[github] fetch failed for %s (%s); using mock data",
                out["url"], error,
            )
            for mock in MOCK_GITHUB_REPOS:
                if (
                    mock["name"].lower() in out["name"].lower()
                    or out["name"].lower() in mock["name"].lower()
                ):
                    out["description"] = mock["description"]
                    out["language"] = out["language"] or mock["language"]
                    out["topics"] = out["topics"] or mock["topics"]
                    break
    return out


def enrich_repos(repos) -> List[Dict]:
    """Normalize a list of selected repositories (see :func:`enrich_repo`)."""
    if not isinstance(repos, list):
        return []
    return [enrich_repo(repo) for repo in repos if isinstance(repo, dict)]


def generate_github_bullets(
    repos: List[Dict],
    jd_text: str,
    generate_completion,
) -> Dict[str, List[str]]:
    """Generate 1-3 resume bullet points per repo via the LLM.

    ``generate_completion(prompt, system_message)`` is injected so the caller
    controls the LLM client (and tests can mock it). Falls back to a single
    deterministic bullet from the description when the model output is unusable.
    """
    bullets: Dict[str, List[str]] = {}
    for repo in repos:
        description = repo.get("description") or repo.get("name")
        # Pre-generated bullets (e.g. supplied by the frontend or a prior Writer
        # pass) are used verbatim, skipping the LLM call entirely.
        prewritten = repo.get("bullets") or []
        if (
            isinstance(prewritten, list)
            and prewritten
            and all(isinstance(b, str) and b.strip() for b in prewritten)
        ):
            bullets[repo["name"]] = [str(b).strip() for b in prewritten][:3]
            continue
        fallback = [f"{repo.get('name')} — {description}."]
        try:
            prompt = (
                "Write 1-3 concise, high-impact resume bullet points for the "
                "project described below, tailored to the job description. "
                "Return ONLY a JSON array of strings. Never invent metrics, "
                "percentages, or numbers.\n\n"
                f"Project: {repo.get('name')}\n"
                f"Description: {description}\n"
                f"Language: {repo.get('language', '')}\n"
                f"Topics: {', '.join(repo.get('topics', []))}\n\n"
                f"Job Description:\n{jd_text}\n"
            )
            system_message = (
                "You write resume bullet points. Return ONLY valid JSON — an "
                "array of strings. Do not fabricate metrics. Do not wrap in "
                "markdown code fences."
            )
            result = generate_completion(prompt, system_message)
            if isinstance(result, list):
                parsed = result
            elif isinstance(result, dict):
                parsed = result.get("response") or result.get("bullets")
            else:
                parsed = None
            if isinstance(parsed, list):
                cleaned = [str(b).strip() for b in parsed if str(b).strip()]
                bullets[repo["name"]] = cleaned[:3] or fallback
            else:
                bullets[repo["name"]] = fallback
        except Exception as error:  # LLM unavailable — deterministic fallback
            logger.warning("[github] bullet generation failed (%s); using description", error)
            bullets[repo["name"]] = fallback
    return bullets


def build_project_heading(repo: Dict, bullets: List[str]) -> str:
    """Build a Jake's-Resume project block from a repo and its bullets.

    Produces::

        \\resumeProjectHeading
        {\\textbf{Name} $|$ \\href{URL}{\\myuline{URL}}}{}
        \\resumeItemListStart
        \\resumeItem{bullet}
        \\resumeItemListEnd

    """
    display_url = repo.get("url", "")
    heading = (
        "\\resumeProjectHeading\n"
        f"{{\\textbf{{{repo.get('name', 'Project')}}} $|$ "
        f"\\href{{{display_url}}}{{\\myuline{{{display_url}}}}}}}{{}}\n"
    )
    items = "\n".join(f"\\resumeItem{{{bullet}}}" for bullet in bullets)
    block = f"{heading}\\resumeItemListStart\n{items}\n\\resumeItemListEnd\n"
    return block


def inject_github_projects(
    projects_body: str,
    bullets: Dict[str, List[str]],
    repos: List[Dict],
) -> str:
    """Append GitHub project blocks to an existing Projects section body.

    Existing editable content is preserved; the new blocks are appended so the
    user's original project entries are never overwritten.
    """
    if not repos:
        return projects_body
    blocks = []
    for repo in repos:
        repo_bullets = bullets.get(repo["name"]) or [repo["description"]]
        blocks.append(build_project_heading(repo, repo_bullets))
    extra = "\n".join(blocks)
    stripped = projects_body.rstrip()
    return f"{stripped}\n\n{extra}" if stripped else extra
