r"""
compiler.py — LaTeX recompilation engine for Fuse.

Takes a merged LaTeX string (original template + AI-rewritten section bodies),
compiles it to a PDF with the local ``pdflatex`` binary, and returns the PDF as
a byte buffer. All scratch files are created inside a per-invocation ``temp/``
subdirectory and removed before the function returns.

Flow:
    1. Reject dangerous file-access commands (defense-in-depth; ``-no-shell-escape``
       alone does not stop ``\input`` / ``\openout`` / ``\lstinputlisting``).
    2. Save the merged .tex string to ``temp/fuse_compile_<uuid>/resume.tex``.
    3. Run ``pdflatex -interaction=nonstopmode -halt-on-error -no-shell-escape``.
    4. Read the produced ``.pdf`` into a buffer.
    5. Delete every generated file (.tex/.aux/.log/.pdf/...) from the temp dir.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path

from latex_parser import pre_compile_fixups


class LatexCompileError(Exception):
    """Raised when pdflatex runs but rejects the supplied LaTeX document.

    Distinct from ``RuntimeError`` (pdflatex binary missing / not runnable) so
    callers can classify client-content failures separately from server faults.
    """


# TeX primitives that can read or write files outside the scratch dir. Resumes
# never need these; blocking them stops a malicious or LLM-injected document
# from reading (e.g. ``\lstinputlisting{/home/user/.env}``) or writing arbitrary
# host files. ``-no-shell-escape`` covers ``\write18`` only — TeX's own file
# operations are unaffected by that flag, hence this denylist.
_BLOCKED_COMMAND_RE = re.compile(
    r"""
    \\write18 | \\shellescape\b |
    \\input\b | \\include\b |
    \\openin\b | \\openout\b | \\closein\b | \\closeout\b |
    \\readline\b | \\read\b |
    \\lstinputlisting\b | \\verbatiminput\b |
    \\includegraphics\b | \\includepdf\b | \\includesvg\b |
    \\graphicspath\b | \\bibliography\b | \\nocite\b | \\addbibresource\b
    """,
    re.IGNORECASE | re.VERBOSE,
)


def _resolve_pdflatex() -> str:
    """Return the pdflatex executable path.

    Honors a ``PDFLATEX`` env var (e.g. a full path to MiKTeX's pdflatex.exe),
    otherwise falls back to ``pdflatex`` on PATH.
    """
    override = os.environ.get("PDFLATEX")
    if override:
        return override
    found = shutil.which("pdflatex")
    if not found:
        raise RuntimeError(
            "pdflatex not found on PATH. Install a TeX distribution (e.g. MiKTeX "
            "or TeX Live) or point the PDFLATEX environment variable at it."
        )
    return found


def _assert_safe(tex_string: str) -> None:
    """Reject LaTeX that tries to touch the filesystem beyond the scratch dir."""
    match = _BLOCKED_COMMAND_RE.search(tex_string)
    if match:
        raise LatexCompileError(
            f"LaTeX contains the disallowed file-access command "
            f"'{match.group(0).strip()}' at character {match.start()}. For "
            "security, the compiler blocks commands that read or write files "
            "outside the temporary build directory."
        )


def compile_tex_to_pdf(tex_string: str, output_name: str = "resume") -> bytes:
    """Compile a LaTeX string into a PDF byte buffer.

    Args:
        tex_string: The merged LaTeX document (template + rewritten sections).
        output_name: Base filename for the scratch .tex/.pdf (default "resume").

    Returns:
        The compiled PDF as ``bytes``.

    Raises:
        LatexCompileError: if the document is rejected by the denylist or by
            pdflatex (message includes the tail of the LaTeX log).
        RuntimeError: if no pdflatex binary is available.
    """
    temp_root = Path("temp")
    temp_root.mkdir(exist_ok=True)

    workdir = temp_root / f"fuse_compile_{uuid.uuid4().hex}"
    workdir.mkdir(parents=True)

    tex_path = workdir / f"{output_name}.tex"
    pdf_path = workdir / f"{output_name}.pdf"

    try:
        tex_string = pre_compile_fixups(tex_string)
        _assert_safe(tex_string)
        tex_path.write_text(tex_string, encoding="utf-8")

        result = subprocess.run(
            [
                _resolve_pdflatex(),
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-no-shell-escape",
                tex_path.name,
            ],
            cwd=str(workdir),
            capture_output=True,
            text=True,
            # Generous timeout: MiKTeX may auto-install a missing package (e.g.
            # hyperref + dependencies) on the first compile of a given template.
            timeout=300,
        )

        if result.returncode != 0 or not pdf_path.exists():
            log_tail = ""
            log_path = workdir / f"{output_name}.log"
            if log_path.exists():
                log_tail = log_path.read_text(
                    encoding="utf-8", errors="replace"
                )[-2000:]
            raise LatexCompileError(
                "pdflatex rejected the LaTeX document "
                f"(exit code {result.returncode}).\n"
                f"--- log tail ---\n{log_tail}"
            )

        return pdf_path.read_bytes()

    finally:
        # Remove every generated artifact (.tex/.aux/.log/.pdf/...) and the
        # scratch directory itself, even if compilation threw.
        shutil.rmtree(workdir, ignore_errors=True)
