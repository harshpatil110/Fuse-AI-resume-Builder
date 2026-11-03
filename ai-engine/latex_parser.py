"""
latex_parser.py — Lossless LaTeX ingestion utilities for Fuse.

The AI engine previously extracted resume text from PDFs (``pymupdf4llm``), which
flattens ATS-optimized layouts into plain markdown. For resumes that ship as raw
LaTeX source this module replaces that lossy path: it isolates the *editable
bodies* of sectioning commands (``\\section{...}`` / ``\\section*{...}``) so the
AI agents are fed only the content that should change — never the preamble,
packages, or styling definitions. Rewritten bodies can then be re-injected into
the untouched template with :func:`inject_editable_sections`.

The "preamble" (everything before ``\\begin{document}``) is deliberately ignored.

Read-only quarantine: contact details, education/degrees, and awards are treated
as immutable personal data. :func:`is_protected_title` classifies them,
:func:`extract_protected_sections` extracts them byte-for-byte, and
:func:`inject_editable_sections` refuses to overwrite them even if the LLM sends
modified content back. Hyperlinks (``\\href{url}{text}``) are additionally hidden
from the LLM behind ``[[LINK_N]]`` placeholder tokens via :func:`protect_links`
and restored verbatim with :func:`restore_links`, so the model cannot strip them.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

# Sectioning commands treated as editable blocks. \section and \section* cover
# the vast majority of resume templates; extend via the ``section_commands`` arg.
DEFAULT_SECTION_COMMANDS = ("section",)

_BEGIN_DOCUMENT_RE = re.compile(r"\\begin\s*\{document\}")
_END_DOCUMENT_RE = re.compile(r"\\end\s*\{document\}")

# ── Read-only quarantine ──────────────────────────────────────────────────────
# Section titles matching these keywords are treated as immutable personal data:
# contact details, education/degree info, and awards/achievements. They are
# extracted byte-for-byte, excluded from the LLM's editable view, and never
# overwritten on injection — even if the LLM returns modified content for them.
PROTECTED_TITLE_KEYWORDS = (
    "contact", "personal", "education", "degree",
    "achievement", "achievements", "award", "awards", "honor", "honors",
    "hackathon", "hackathons", "certification", "certifications",
    "scholarship", "scholarships",
)

_PROTECTED_TITLE_RE = re.compile(
    r"(?:^|[\s\-_/])(?:"
    + "|".join(re.escape(keyword) for keyword in PROTECTED_TITLE_KEYWORDS)
    + r")(?:$|[\s\-_/:])",
    re.IGNORECASE,
)

# Special key under which the contact header (top matter, before the first
# sectioning command) is returned by :func:`extract_protected_sections`.
CONTACT_HEADER_KEY = "__contact_header__"

# ── Hyperlink placeholders ────────────────────────────────────────────────────
# Real \\href commands are hidden behind tokens like [[LINK_1]] so the LLM cannot
# strip or mangle the URL/display-text syntax; restore_links swaps them back.
_LINK_CMD_RE = re.compile(r"\\href")
_LINK_TOKEN_RE = re.compile(r"\[\[LINK_(\d+)\]\]")


@dataclass
class SectionSpan:
    """A single sectioning block and its character offsets in the source."""

    command: str          # e.g. "section"
    starred: bool         # True for \section*
    title: str            # raw text inside the command's braces
    command_start: int    # index of the leading backslash
    title_arg_start: int  # index of the opening `{`
    body_start: int       # index just after the closing `}` of the title arg
    body_end: int         # index of the next sectioning command (or \end{document})
    body: str             # tex_string[body_start:body_end]


def _section_re(section_commands: Sequence[str]) -> re.Pattern:
    r"""Compile a matcher for ``\section`` / ``\section*`` / ``\section[Short]``.

    Also accepts the optional short-title argument (``\section[Short]{Long}``),
    which is discarded. The match ends exactly at the opening ``{`` of the
    (long) title argument.
    """
    alternation = "|".join(re.escape(cmd) for cmd in section_commands)
    return re.compile(
        rf"\\(?P<cmd>{alternation})\s*(?P<star>\*?)\s*(?:\[[^\]\n]*\])?\s*\{{"
    )


def _is_comment_start(text: str, index: int) -> bool:
    """Return True if ``index`` sits on a LaTeX ``%`` comment line.

    Scans from the start of the line for an unescaped ``%``. A percent with an
    odd number of preceding backslashes is escaped (e.g. ``\\%``) and ignored.
    """
    line_start = text.rfind("\n", 0, index) + 1
    i = line_start
    while i < index:
        if text[i] == "%":
            backslashes = 0
            j = i - 1
            while j >= 0 and text[j] == "\\":
                backslashes += 1
                j -= 1
            if backslashes % 2 == 0:
                return True
        i += 1
    return False


def _read_braced_argument(text: str, open_index: int) -> Tuple[Optional[str], int]:
    """Return ``(inner_content, index_after_closing_brace)`` for a balanced ``{...}``.

    ``open_index`` must point at the opening ``{``. Backslash-escaped braces are
    skipped. Returns ``(None, open_index)`` if the braces never close.
    """
    depth = 0
    i = open_index
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "\\" and i + 1 < n:
            i += 2  # skip escaped character, e.g. \{ or \}
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[open_index + 1 : i], i + 1
        i += 1
    return None, open_index


def find_sections(
    tex_string: str,
    section_commands: Sequence[str] = DEFAULT_SECTION_COMMANDS,
) -> List[SectionSpan]:
    """Locate every editable sectioning block in the document body.

    Skips the preamble (everything before ``\\begin{document}``), ignores
    anything after ``\\end{document}``, and skips ``\\section`` commands that
    appear on ``%`` comment lines. Raises ``ValueError`` when the document
    environment is missing or a section title has unbalanced braces.
    """
    begin_match = _BEGIN_DOCUMENT_RE.search(tex_string)
    if begin_match is None:
        raise ValueError("No \\begin{document} found — not a valid LaTeX document.")

    end_matches = list(_END_DOCUMENT_RE.finditer(tex_string))
    end_index = end_matches[-1].start() if end_matches else len(tex_string)

    pattern = _section_re(section_commands)
    spans: List[SectionSpan] = []

    # Drive the scan with a manual cursor instead of finditer over the whole
    # region, so a \section nested inside another section's title argument is
    # not revisited (and mis-parsed) after its braces are consumed.
    pos = begin_match.end()
    while pos < end_index:
        match = pattern.search(tex_string, pos, end_index)
        if match is None:
            break

        # A \section written on a % comment line is not a live section.
        if _is_comment_start(tex_string, match.start()):
            pos = match.end()
            continue

        open_index = match.end() - 1  # the `{` at the end of the match
        title, after_brace = _read_braced_argument(tex_string, open_index)
        if title is None:
            raise ValueError(
                f"Unbalanced braces in \\{match.group('cmd')} title "
                f"near character {open_index}."
            )

        if spans:
            spans[-1].body_end = match.start()
            spans[-1].body = tex_string[spans[-1].body_start : spans[-1].body_end]

        spans.append(
            SectionSpan(
                command=match.group("cmd"),
                starred=match.group("star") == "*",
                title=title,
                command_start=match.start(),
                title_arg_start=open_index,
                body_start=after_brace,
                body_end=end_index,
                body="",
            )
        )

        pos = after_brace

    if spans:
        spans[-1].body_end = end_index
        spans[-1].body = tex_string[spans[-1].body_start : spans[-1].body_end]

    return spans


def is_protected_title(title: str) -> bool:
    r"""Return True if a section title denotes immutable personal data.

    Matches contact / education / award / achievement style headings
    (case-insensitive, whole-word against separators). Examples that are
    protected: ``Education``, ``Education \& Certifications``,
    ``Achievements``, ``Awards \& Honors``, ``Contact``.
    """
    return bool(_PROTECTED_TITLE_RE.search(title.strip()))


def extract_editable_sections(
    tex_string: str,
    section_commands: Sequence[str] = DEFAULT_SECTION_COMMANDS,
    include_protected: bool = True,
) -> Dict[str, str]:
    """Return ``{section_title: body}`` for every editable sectioning block.

    Only the *body* of each section is returned (the content between the section
    title and the next sectioning command / ``\\end{document}``). The preamble,
    packages, styling definitions and the ``\\section{...}`` commands themselves
    are excluded, so downstream agents cannot corrupt them.

    Pass ``include_protected=False`` when building the LLM's editable view: it
    drops read-only sections (contact, education, awards — see
    :func:`is_protected_title`) so the model is never even shown that content.
    Note: duplicate section titles collapse to the last occurrence.
    """
    sections: Dict[str, str] = {}
    for span in find_sections(tex_string, section_commands):
        if not include_protected and is_protected_title(span.title):
            continue
        sections[span.title] = span.body.strip()
    return sections


def extract_protected_sections(
    tex_string: str,
    section_commands: Sequence[str] = DEFAULT_SECTION_COMMANDS,
) -> Dict[str, str]:
    """Return ``{title: body}`` for every immutable (read-only) block.

    These blocks — contact details, education/degrees, awards/achievements — are
    quarantined and stitched back into the final document exactly as parsed. The
    contact header (top matter, before the first sectioning command) is also
    returned under the special key :data:`CONTACT_HEADER_KEY` when present, so
    the phone / email / social-handle block (e.g. ``harshpatil110``) is captured.
    """
    protected: Dict[str, str] = {}
    for span in find_sections(tex_string, section_commands):
        if is_protected_title(span.title):
            protected[span.title] = span.body.strip()

    top_matter = extract_top_matter(tex_string, section_commands)
    if top_matter.strip():
        protected[CONTACT_HEADER_KEY] = top_matter
    return protected


def extract_section_body(
    tex_string: str,
    section_title: str,
    section_commands: Sequence[str] = DEFAULT_SECTION_COMMANDS,
) -> Optional[str]:
    """Return the stripped body of a single named section (case-insensitive)."""
    target = section_title.strip().lower()
    for span in find_sections(tex_string, section_commands):
        if span.title.strip().lower() == target:
            return span.body.strip()
    return None


def extract_top_matter(
    tex_string: str,
    section_commands: Sequence[str] = DEFAULT_SECTION_COMMANDS,
) -> str:
    """Return the document-body content before the first sectioning command.

    This is typically the name/contact header block of a resume. It is *not*
    included in :func:`extract_editable_sections` by default, but callers that
    also want the header edited can request it here. Bounded by
    ``\\end{document}`` so trailing junk after the document is never included.
    """
    begin_match = _BEGIN_DOCUMENT_RE.search(tex_string)
    if begin_match is None:
        raise ValueError("No \\begin{document} found — not a valid LaTeX document.")
    end_matches = list(_END_DOCUMENT_RE.finditer(tex_string))
    end_index = end_matches[-1].start() if end_matches else len(tex_string)
    body_start = begin_match.end()
    first = _section_re(section_commands).search(tex_string, body_start, end_index)
    end = first.start() if first else end_index
    return tex_string[body_start:end].strip()


def protect_links(tex_string: str) -> Tuple[str, Dict[str, str]]:
    """Replace every ``\\href{url}{text}`` with a ``[[LINK_N]]`` placeholder.

    Returns ``(safe_tex, link_map)`` where ``link_map[token]`` holds the exact
    original ``\\href{url}{text}`` command, ready for :func:`restore_links`.
    Apply this *before* the LLM sees editable section bodies so the model cannot
    strip or rewrite hyperlinks (e.g. the GitHub links for O.N.E. and NeuroNet
    inside the Projects section). Balanced-brace handling keeps URLs or display
    text that contain ``{...}`` intact.
    """
    link_map: Dict[str, str] = {}
    cursor = 0
    pieces: List[str] = []
    index = 0

    for match in _LINK_CMD_RE.finditer(tex_string):
        url_open = tex_string.find("{", match.end())
        if url_open == -1:
            continue
        url, after_url = _read_braced_argument(tex_string, url_open)
        text_open = tex_string.find("{", after_url)
        if url is None or text_open == -1:
            continue
        text, after_text = _read_braced_argument(tex_string, text_open)
        if text is None:
            continue

        index += 1
        token = f"[[LINK_{index}]]"
        link_map[token] = tex_string[match.start():after_text]

        pieces.append(tex_string[cursor:match.start()])
        pieces.append(token)
        cursor = after_text

    if not link_map:
        return tex_string, link_map

    pieces.append(tex_string[cursor:])
    return "".join(pieces), link_map


def restore_links(tex_string: str, link_map: Dict[str, str]) -> str:
    """Swap ``[[LINK_N]]`` placeholder tokens back to the original ``\\href`` commands.

    Any token present in ``link_map`` is replaced verbatim; tokens without a
    mapping are left untouched (defensive — the LLM may have dropped a link).
    """
    if not link_map:
        return tex_string

    def _replace(match: re.Match) -> str:
        return link_map.get(match.group(0), match.group(0))

    return _LINK_TOKEN_RE.sub(_replace, tex_string)


def restore_links_in_obj(obj: Any, link_map: Dict[str, str]) -> Any:
    """Recursively restore [[LINK_N]] tokens across strings, dicts, and lists."""
    if not link_map:
        return obj
    if isinstance(obj, str):
        return restore_links(obj, link_map)
    if isinstance(obj, dict):
        return {k: restore_links_in_obj(v, link_map) for k, v in obj.items()}
    if isinstance(obj, list):
        return [restore_links_in_obj(item, link_map) for item in obj]
    return obj


def protect_links_with_map(text: str, link_map: Dict[str, str]) -> str:
    """Replace occurrences of original \\href commands with their [[LINK_N]] tokens."""
    if not link_map or not isinstance(text, str):
        return text
    for token, original_cmd in link_map.items():
        text = text.replace(original_cmd, token)
    return text


def protect_links_in_obj(obj: Any, link_map: Dict[str, str]) -> Any:
    """Recursively swap original \\href commands to [[LINK_N]] tokens using link_map."""
    if not link_map:
        return obj
    if isinstance(obj, str):
        return protect_links_with_map(obj, link_map)
    if isinstance(obj, dict):
        return {k: protect_links_in_obj(v, link_map) for k, v in obj.items()}
    if isinstance(obj, list):
        return [protect_links_in_obj(item, link_map) for item in obj]
    return obj


def inject_editable_sections(
    tex_string: str,
    sections: Dict[str, str],
    section_commands: Sequence[str] = DEFAULT_SECTION_COMMANDS,
    allow_protected: bool = False,
) -> str:
    """Re-inject rewritten bodies into a LaTeX template.

    For each ``(title, new_body)`` in ``sections`` the body of the matching
    ``\\section{title}`` block is replaced (case-insensitive title match). The
    preamble, the section commands themselves and the whitespace surrounding
    each replaced body are preserved, so the compiled layout is untouched.

    Unknown titles are silently ignored, which lets callers pass back every
    section returned by :func:`extract_editable_sections` without bookkeeping.

    ``allow_protected=False`` (default) additionally refuses to overwrite any
    read-only section (contact / education / awards — see
    :func:`is_protected_title`) even if a matching key is present. This is the
    last line of defense: immutable personal data is stitched back exactly as it
    was parsed, regardless of what the LLM returns.

    Note: if the template repeats a section title, every occurrence whose title
    matches is replaced (while :func:`extract_editable_sections` collapses
    duplicates to the last body). Duplicate section titles are pathological in
    resumes; the dict-keyed API cannot express per-occurrence bodies.
    """
    spans = find_sections(tex_string, section_commands)
    by_title = {key.strip().lower(): value for key, value in sections.items()}

    # Apply back-to-front so earlier character offsets stay valid.
    replacements: List[Tuple[int, int, str]] = []
    for span in spans:
        new_body = by_title.get(span.title.strip().lower())
        if new_body is None:
            continue
        if not allow_protected and is_protected_title(span.title):
            # Immutable personal data — never overwritten by the LLM.
            continue

        original_span = tex_string[span.body_start : span.body_end]
        stripped = original_span.strip()
        if stripped:
            leading = original_span[: len(original_span) - len(original_span.lstrip())]
            trailing = original_span[len(original_span.rstrip()) :]
        else:
            leading, trailing = original_span, ""

        replacements.append(
            (span.body_start, span.body_end, leading + new_body.strip() + trailing)
        )

    for start, end, replacement in sorted(replacements, reverse=True):
        tex_string = tex_string[:start] + replacement + tex_string[end:]

    return tex_string


def append_to_section(
    tex_string: str,
    title: str,
    extra: str,
    section_commands: Sequence[str] = DEFAULT_SECTION_COMMANDS,
) -> str:
    """Append ``extra`` to the end of a named section's body (case-insensitive).

    Used to inject GitHub project blocks into the PROJECTS section without
    overwriting the user's existing content. If the section is absent (or is a
    protected read-only section), the template is returned unchanged.
    """
    spans = find_sections(tex_string, section_commands)
    for span in spans:
        if span.title.strip().lower() == title.strip().lower():
            if is_protected_title(span.title):
                return tex_string
            body = tex_string[span.body_start : span.body_end]
            insertion = f"\n{extra.strip()}\n" if body.strip() else f"\n{extra.strip()}\n"
            new_body = body.rstrip() + insertion
            return tex_string[: span.body_start] + new_body + tex_string[span.body_end :]
    return tex_string


# ── Surgical item-list replacement ────────────────────────────────────────────
# The LLM rewrites bullet points, but the original LaTeX also contains
# \resumeSubheading and \resumeProjectHeading lines that must NOT be touched.
# These helpers isolate the *item list blocks* (the region from
# \resumeItemListStart to \resumeItemListEnd inclusive) so only the bullets
# inside them are replaced, leaving headings byte-for-byte intact.

_ITEM_LIST_START_RE = re.compile(r"\\resumeItemListStart\b")
_ITEM_LIST_END_RE = re.compile(r"\\resumeItemListEnd\b")


@dataclass
class ItemListSpan:
    """Character offsets of one \\resumeItemListStart … \\resumeItemListEnd block."""
    start: int        # index of the `\` in \resumeItemListStart
    end: int          # index just *after* \resumeItemListEnd
    content: str      # the full text including the Start/End delimiters


def find_item_list_spans(section_body: str) -> List[ItemListSpan]:
    r"""Locate every \resumeItemListStart … \resumeItemListEnd block in *section_body*.

    Returns a list of ItemListSpan sorted by position. Blocks that are
    missing a closing \resumeItemListEnd are silently skipped (defensive).
    """
    spans: List[ItemListSpan] = []
    for m_start in _ITEM_LIST_START_RE.finditer(section_body):
        m_end = _ITEM_LIST_END_RE.search(section_body, m_start.end())
        if m_end is None:
            continue
        end_pos = m_end.end()
        spans.append(ItemListSpan(
            start=m_start.start(),
            end=end_pos,
            content=section_body[m_start.start():end_pos],
        ))
    return spans


def extract_item_list_bodies(section_body: str) -> List[str]:
    r"""Return the raw text inside each \resumeItemListStart … \resumeItemListEnd.

    The delimiters themselves are included in the returned strings so the
    LLM sees (and must reproduce) the exact environment boundaries.
    """
    return [span.content for span in find_item_list_spans(section_body)]


def replace_item_list_bodies(
    section_body: str,
    new_bodies: List[str],
) -> str:
    r"""Replace each \resumeItemListStart…\resumeItemListEnd block in *section_body*
    with the corresponding entry in *new_bodies*.

    If *new_bodies* has fewer entries than item-list blocks in the section,
    trailing blocks are left unchanged (defensive). Extra entries in
    *new_bodies* are ignored.

    This is the core of "surgical injection": headings (\resumeSubheading,
    \resumeProjectHeading) and any text outside the item-list environments
    are preserved byte-for-byte.
    """
    spans = find_item_list_spans(section_body)
    # Apply replacements back-to-front so earlier offsets stay valid.
    for i in range(min(len(spans), len(new_bodies)) - 1, -1, -1):
        span = spans[i]
        replacement = new_bodies[i].strip()
        # Ensure the replacement still has the delimiters.
        if not replacement.startswith("\\resumeItemListStart"):
            replacement = "\\resumeItemListStart\n" + replacement
        if not replacement.endswith("\\resumeItemListEnd"):
            replacement = replacement + "\n\\resumeItemListEnd"
        section_body = (
            section_body[: span.start] + replacement + section_body[span.end :]
        )
    return section_body


# ── Pre-compilation text fixups ───────────────────────────────────────────────
# Hardcoded corrections applied to the merged LaTeX string just before it is
# handed to pdflatex. These address known factual updates the user has
# requested (e.g. updated hackathon results from a new certificate).

_PRE_COMPILE_REPLACEMENTS: List[Tuple[str, str]] = [
    ("2nd Runner-Up", "1st Runner-Up"),
]


def pre_compile_fixups(tex_string: str) -> str:
    """Apply all hardcoded text corrections to *tex_string*.

    Called immediately before ``compile_tex_to_pdf`` so the compiled PDF
    reflects the user's updated records without requiring a full LLM
    round-trip.
    """
    for old, new in _PRE_COMPILE_REPLACEMENTS:
        tex_string = tex_string.replace(old, new)
    return tex_string


# ── In-Place Surgical Regex Replacement Architecture ─────────────────────────
SURGICAL_SECTION_KEYWORDS = ("experience", "project", "projects", "work")


def is_surgical_section(title: str) -> bool:
    r"""Return True if section title denotes Experience or Projects (and is not protected)."""
    if is_protected_title(title):
        return False
    lower = title.strip().lower()
    return any(keyword in lower for keyword in SURGICAL_SECTION_KEYWORDS)


@dataclass
class BulletBlock:
    """A single \\resumeItemListStart … \\resumeItemListEnd block inside Experience or Projects."""
    index: int
    section: str
    heading_context: str
    original_bullets: str
    start: int          # index of content start (just after \resumeItemListStart)
    end: int            # index of content end (just before \resumeItemListEnd)
    full_start: int     # index of \ in \resumeItemListStart
    full_end: int       # index just after \resumeItemListEnd


def extract_bullet_blocks(
    tex_string: str,
    section_commands: Sequence[str] = DEFAULT_SECTION_COMMANDS,
) -> List[BulletBlock]:
    r"""Locate all item list blocks inside the Experience and Projects sections.

    Extracts ONLY the blocks between \resumeItemListStart and \resumeItemListEnd
    under sections matching Experience or Projects. Protected sections
    (Education, Achievements, Awards, Contact) are completely excluded.
    """
    spans = find_sections(tex_string, section_commands)
    blocks: List[BulletBlock] = []
    block_index = 0

    for span in spans:
        if not is_surgical_section(span.title):
            continue

        item_spans = find_item_list_spans(span.body)
        last_offset = 0
        for item in item_spans:
            # Extract heading context before this item list
            heading_text = span.body[last_offset:item.start].strip()
            last_offset = item.end

            m_start = _ITEM_LIST_START_RE.search(item.content)
            m_end = _ITEM_LIST_END_RE.search(item.content)
            content_start_rel = m_start.end() if m_start else 0
            content_end_rel = m_end.start() if m_end else len(item.content)
            bullets_text = item.content[content_start_rel:content_end_rel].strip()

            abs_full_start = span.body_start + item.start
            abs_full_end = span.body_start + item.end
            abs_start = abs_full_start + content_start_rel
            abs_end = abs_full_start + content_end_rel

            blocks.append(
                BulletBlock(
                    index=block_index,
                    section=span.title.strip(),
                    heading_context=heading_text,
                    original_bullets=bullets_text,
                    start=abs_start,
                    end=abs_end,
                    full_start=abs_full_start,
                    full_end=abs_full_end,
                )
            )
            block_index += 1

    return blocks


def sanitize_latex_bullets(bullets_text: str) -> str:
    r"""Ensure unescaped LaTeX special characters (%, &, #) are safely escaped so pdflatex never fails."""
    # Escape unescaped % (e.g. 20% -> 20\%)
    bullets_text = re.sub(r"(?<!\\)%", r"\%", bullets_text)
    # Escape unescaped & (e.g. React & Node -> React \& Node)
    bullets_text = re.sub(r"(?<!\\)&", r"\&", bullets_text)
    # Escape unescaped # (e.g. C# -> C\#)
    bullets_text = re.sub(r"(?<!\\)#", r"\#", bullets_text)
    return bullets_text


def inject_bullet_blocks(
    master_template: str,
    new_blocks: Sequence[str],
    section_commands: Sequence[str] = DEFAULT_SECTION_COMMANDS,
) -> str:
    r"""Surgically replace the old item list blocks with new \resumeItem{...} blocks.

    In-place replacement: Modifies ONLY the contents within \resumeItemListStart
    and \resumeItemListEnd in the Experience and Projects sections. The preamble,
    custom macros, headings (\resumeSubheading, \resumeProjectHeading), header,
    education, and achievements remain 100% byte-for-byte untouched.
    """
    blocks = extract_bullet_blocks(master_template, section_commands)
    if not blocks or not new_blocks:
        return master_template

    # Apply replacements from back to front by full_start offset so earlier offsets remain valid
    tex_out = master_template
    for i in range(min(len(blocks), len(new_blocks)) - 1, -1, -1):
        block = blocks[i]
        new_content = sanitize_latex_bullets(new_blocks[i].strip())

        # Ensure \resumeItemListStart and \resumeItemListEnd delimiters are intact
        if not new_content.startswith(r"\resumeItemListStart"):
            new_content = r"\resumeItemListStart" + "\n" + new_content
        if not new_content.endswith(r"\resumeItemListEnd"):
            new_content = new_content + "\n" + r"\resumeItemListEnd"

        tex_out = tex_out[:block.full_start] + new_content + tex_out[block.full_end:]

    return tex_out

