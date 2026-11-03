"""
Agent orchestration module for Fuse AI Engine.

Houses the multi-agent workflow: Critic Agent, Writer Agent, etc.
"""

import json
import logging
from typing import Dict, List, Sequence, Tuple

import latex_parser
import github_fetch
from prompt import (
    IMMUTABLE_CONTENT_CONSTRAINT,
    METRIC_FABRICATION_CONSTRAINT,
    SKILL_GROUNDING_CONSTRAINT,
    SURGICAL_WRITER_SYSTEM_INSTRUCTION,
)
from prompts.template_manager import TemplateManager
from llm_utils import generate_json_completion
from resume_evaluator import evaluate_resume
from validator import (
    enforce_metrics_integrity,
    extract_known_skills,
    extract_original_text,
    generated_bullet_text,
    ground_resume_skills,
    verify_metrics_integrity,
)

logger = logging.getLogger(__name__)

template_manager = TemplateManager()

# Hard directive for the Writer Agent: skills must be demonstrated inside
# Experience/Project bullet points, never just appended to the Skills list.
# The Grounding Validator (validator.ground_resume_skills) deletes any skill
# not present in the generated bullet text, so appending bare skills makes the
# draft fail evaluation and re-triggers the QA loop.
GROUNDING_VALIDATOR_RULE = (
    "CRITICAL RULE: The system utilizes a Grounding Validator. "
    "If the Critic Agent instructs you to add missing technical skills "
    "(e.g., Python, LangGraph), you CANNOT simply append them to the Skills "
    "section. You MUST organically rewrite an Experience or Project bullet "
    "point to demonstrate how that skill was used. Any skill listed in the "
    "Skills section that is not explicitly present in your bullet points will "
    "be automatically deleted, causing you to fail the evaluation."
)

QA_SCORE_THRESHOLD = 75
QA_MAX_RETRIES = 2


async def run_critic_agent(resume_json: dict, jd_text: str) -> dict:
    """
    Run the Critic Agent to analyze resume gaps against a Job Description.

    Args:
        resume_json: Parsed resume data as a dictionary.
        jd_text: The raw Job Description text.

    Returns:
        A dictionary containing the structured critique.
    """
    system_message = (
        "You are a Ruthless but Constructive Senior Technical Recruiter. "
        "You analyze resumes against job descriptions and return ONLY valid JSON. "
        "Never include markdown formatting, code fences, or conversational text. "
        f"{IMMUTABLE_CONTENT_CONSTRAINT}"
    )

    prompt = template_manager.render_template(
        "critic_agent",
        parsed_resume=json.dumps(resume_json, indent=2),
        jd_text=jd_text,
    )

    if prompt is None:
        raise ValueError("Failed to render critic_agent template.")

    logger.info("Running Critic Agent...")
    result = generate_json_completion(prompt, system_message)
    logger.info(f"Critic Agent finished. Match score: {result.get('overall_match_score', 'N/A')}")

    return result


async def run_github_matching_agent(github_repos: list, jd_text: str) -> dict:
    """
    Run the GitHub Matching Agent to select the most relevant repos for a JD.

    Args:
        github_repos: List of repository dicts (name, readme, commits, etc.).
        jd_text: The raw Job Description text.

    Returns:
        A dictionary containing the selected projects and match reasoning.
    """
    system_message = (
        "You are a Principal Engineering Manager at a top-tier tech company. "
        "You analyze GitHub portfolios against job descriptions and return ONLY valid JSON. "
        "Never include markdown formatting, code fences, or conversational text."
    )

    prompt = template_manager.render_template(
        "github_matching_agent",
        github_repos=json.dumps(github_repos, indent=2),
        jd_text=jd_text,
    )

    if prompt is None:
        raise ValueError("Failed to render github_matching_agent template.")

    logger.info("Running GitHub Matching Agent...")
    result = generate_json_completion(prompt, system_message)
    logger.info(f"GitHub Matching Agent selected {len(result.get('selected_projects', []))} projects.")

    return result


async def rewrite_latex_bullets(
    tex_string: str,
    jd_text: str,
    github_projects: list = None,
) -> Tuple[str, List[str]]:
    r"""In-Place Surgical Regex Replacement: Rewrite ONLY the bullet points in Experience and Projects.

    Extracts ONLY the blocks between \resumeItemListStart and \resumeItemListEnd,
    passes them to the Writer Agent with the strict surgical prompt, and injects
    the resulting \resumeItem{} blocks back into the exact positions in tex_string.
    All headings (\resumeSubheading, \resumeProjectHeading), preamble, header,
    education, and achievements remain 100% byte-for-byte untouched.
    """
    safe_tex, link_map = latex_parser.protect_links(tex_string)
    blocks = latex_parser.extract_bullet_blocks(safe_tex)
    if not blocks:
        logger.warning("No surgical bullet blocks found in LaTeX resume.")
        return tex_string, []

    formatted_blocks = []
    for b in blocks:
        formatted_blocks.append(
            f"<BLOCK index=\"{b.index}\" section=\"{b.section}\">\n"
            f"Context: {b.heading_context}\n"
            f"Current Bullets:\n{b.original_bullets}\n"
            f"</BLOCK>"
        )
    blocks_str = "\n\n".join(formatted_blocks)

    system_message = (
        f"{SURGICAL_WRITER_SYSTEM_INSTRUCTION} "
        f"{IMMUTABLE_CONTENT_CONSTRAINT} "
        f"{METRIC_FABRICATION_CONSTRAINT} "
        f"{SKILL_GROUNDING_CONSTRAINT}"
    )

    prompt = (
        "You are provided with existing resume bullet points and a target Job Description.\n"
        "Your task: rewrite and improve the impact of the bullet points, injecting missing keywords from the JD.\n\n"
        f"<JOB_DESCRIPTION>\n{jd_text}\n</JOB_DESCRIPTION>\n\n"
        f"<EXISTING_BULLET_BLOCKS>\n{blocks_str}\n</EXISTING_BULLET_BLOCKS>\n\n"
        "MANDATORY OUTPUT FORMAT:\n"
        "Return ONLY a valid JSON object with a 'blocks' key containing an array of strings (one string per block, matching the exact order of blocks above).\n"
        "Inside each block string, output ONLY the LaTeX bullet points wrapped in \\resumeItem{...}.\n"
        "Example output:\n"
        "{\n"
        '  "blocks": [\n'
        '    "\\\\resumeItem{Architected scalable microservices using FastAPI...}\\n\\\\resumeItem{Reduced latency by 20%...}",\n'
        '    "\\\\resumeItem{Engineered distributed vector search using FAISS...}"\n'
        "  ]\n"
        "}"
    )

    logger.info("Running Surgical LaTeX Bullet Writer Agent for %d block(s)...", len(blocks))
    result = generate_json_completion(prompt, system_message)

    # Robust parsing of returned blocks
    new_blocks = []
    if isinstance(result, dict) and "blocks" in result and isinstance(result["blocks"], list):
        new_blocks = [str(x) for x in result["blocks"]]
    elif isinstance(result, list):
        new_blocks = [str(x) for x in result]
    elif isinstance(result, dict):
        for i in range(len(blocks)):
            val = result.get(str(i)) or result.get(f"block_{i}") or result.get(f"block{i}")
            if val is not None:
                new_blocks.append(str(val))

    # If parsing produced fewer blocks, fallback remaining to original
    if len(new_blocks) < len(blocks):
        for i in range(len(new_blocks), len(blocks)):
            new_blocks.append(blocks[i].original_bullets)

    # In-place surgical injection
    injected_tex = latex_parser.inject_bullet_blocks(safe_tex, new_blocks)

    # Restore hyperlinks
    final_tex = latex_parser.restore_links(injected_tex, link_map)

    # Sanitize any raw % or & that might break pdflatex
    final_tex = latex_parser.sanitize_latex_bullets(final_tex)

    logger.info("Surgically injected %d bullet block(s) into master template.", len(new_blocks))
    return final_tex, new_blocks


async def rewrite_latex_sections(
    tex_string: str,
    jd_text: str,
    github_projects: list,
    section_titles: Sequence[str] = ("experience", "projects"),
) -> tuple:
    """Surgically rewrite the EXPERIENCE/PROJECTS LaTeX section bodies via the LLM.

    Only the extracted section bodies are sent to the model — never the preamble
    or any other section — so the user's custom formatting and immutable
    personal data cannot be corrupted. The LLM is instructed to mirror the exact
    custom macros (``\\resumeSubheading``, ``\\resumeItem``, ...) used in the
    original bodies.

    Returns ``(new_sections: {title: body}, link_map)``; ``new_sections`` only
    ever contains the requested section titles.
    """
    safe_tex, link_map = latex_parser.protect_links(tex_string)
    editable = latex_parser.extract_editable_sections(
        safe_tex, include_protected=False
    )
    wanted_titles = {t.lower() for t in section_titles}
    wanted = {
        title: body
        for title, body in editable.items()
        if title.strip().lower() in wanted_titles
    }
    if not wanted:
        return {}, link_map

    # ── Fetch User's Entire GitHub Portfolio ──
    # Parse the username from the resume (e.g., github.com/username)
    import re
    username_match = re.search(r"github\.com/([^\s}\\]+)", tex_string)
    fetched_context = ""
    if username_match:
        username = username_match.group(1).removesuffix("/").removesuffix("/")
        try:
            portfolio_json = github_fetch.fetch_user_portfolio(username)
            if portfolio_json:
                fetched_context = (
                    f"The candidate's complete GitHub portfolio (username: {username}):\n"
                    f"{portfolio_json}\n"
                )
                logger.info("Fetched live GitHub portfolio for user %s.", username)
        except Exception as e:
            logger.warning("GitHub portfolio fetch failed (%s); proceeding without.", e)
            
    # Merge explicit github_projects with auto-fetched context
    github_context_str = ""
    if github_projects:
        github_context_str = json.dumps(github_projects, indent=2)
    if fetched_context:
        if github_context_str:
            github_context_str += "\n\n" + fetched_context
        else:
            github_context_str = fetched_context
    if not github_context_str:
        github_context_str = "None"

    section_bodies = "\n\n".join(
        f"<SECTION: {title}>\n{body}\n</SECTION>"
        for title, body in wanted.items()
    )
    prompt = template_manager.render_template(
        "latex_writer_agent",
        section_bodies=section_bodies,
        jd_text=jd_text,
        github_projects=github_context_str,
    )
    if prompt is None:
        raise ValueError("Failed to render latex_writer_agent template.")

    system_message = (
        "You are an Elite Career Consultant and Senior Technical Resume Writer. "
        "You surgically rewrite LaTeX resume section bodies and return ONLY valid JSON. "
        "CRITICAL FORMATTING RULE: You are writing for a strict LaTeX document. "
        "You MUST wrap every single bullet point you generate inside the "
        "\\resumeItem{} command. Example: \\resumeItem{Architected a scalable "
        "FastAPI backend...}. Do not use standard markdown bullets (- or *). "
        "Failure to use \\resumeItem{} will break the compiler. "
        "Every group of \\resumeItem{} bullets MUST be enclosed between "
        "\\resumeItemListStart and \\resumeItemListEnd. "
        f"{IMMUTABLE_CONTENT_CONSTRAINT} {METRIC_FABRICATION_CONSTRAINT} "
        f"{SKILL_GROUNDING_CONSTRAINT}"
    )

    logger.info("Running LaTeX Section Writer Agent...")
    result = generate_json_completion(prompt, system_message)
    result_sections = result.get("sections", {}) if isinstance(result, dict) else {}
    cleaned: Dict[str, str] = {}
    for title, body in result_sections.items():
        if (
            title.strip().lower() in wanted_titles
            and isinstance(body, str)
            and body.strip()
        ):
            cleaned[title] = body.strip()
    logger.info("LaTeX Section Writer returned %s section(s).", len(cleaned))
    return cleaned, link_map


async def run_writer_agent(parsed_resume: dict, jd_text: str, selected_github_projects: dict) -> dict:
    """
    Run the Writer Agent to produce a fully rewritten, JD-optimized resume.

    Args:
        parsed_resume: The candidate's original parsed resume data.
        jd_text: The raw Job Description text.
        selected_github_projects: The output from the GitHub Matching Agent.

    Returns:
        A dictionary representing the final rewritten resume in JSON Resume format.
    """
    system_message = (
        "You are an Elite Career Consultant and Senior Technical Resume Writer. "
        "You rewrite resumes to perfectly align with job descriptions and return ONLY valid JSON. "
        "Never include markdown formatting, code fences, or conversational text. "
        f"{IMMUTABLE_CONTENT_CONSTRAINT} "
        f"{SKILL_GROUNDING_CONSTRAINT} "
        f"{METRIC_FABRICATION_CONSTRAINT} "
        f"{GROUNDING_VALIDATOR_RULE}"
    )

    link_map = (
        parsed_resume.get("link_placeholders")
        if isinstance(parsed_resume, dict)
        else None
    )
    safe_parsed_resume = (
        latex_parser.protect_links_in_obj(parsed_resume, link_map)
        if link_map
        else parsed_resume
    )

    prompt = template_manager.render_template(
        "writer_agent",
        parsed_resume=json.dumps(safe_parsed_resume, indent=2),
        jd_text=jd_text,
        selected_github_projects=json.dumps(selected_github_projects, indent=2),
    )

    if prompt is None:
        raise ValueError("Failed to render writer_agent template.")

    logger.info("Running Writer Agent...")
    result = generate_json_completion(prompt, system_message)
    # Anti-hallucination: strip any proposed skill not proven in the bullets.
    result = ground_resume_skills(result, extract_known_skills(parsed_resume))
    if link_map and isinstance(result, (dict, list, str)):
        result = latex_parser.restore_links_in_obj(result, link_map)
    logger.info("Writer Agent finished. Resume rewrite complete.")

    return result


async def run_writer_agent_with_feedback(
    parsed_resume: dict,
    jd_text: str,
    selected_github_projects: dict,
    previous_feedback: str = None
) -> dict:
    """
    Run the Writer Agent, optionally injecting evaluator feedback from a previous attempt.
    """
    system_message = (
        "You are an Elite Career Consultant and Senior Technical Resume Writer. "
        "You rewrite resumes to perfectly align with job descriptions and return ONLY valid JSON. "
        "Never include markdown formatting, code fences, or conversational text. "
        f"{IMMUTABLE_CONTENT_CONSTRAINT} "
        f"{SKILL_GROUNDING_CONSTRAINT} "
        f"{METRIC_FABRICATION_CONSTRAINT} "
        f"{GROUNDING_VALIDATOR_RULE}"
    )

    feedback_block = ""
    if previous_feedback:
        feedback_block = (
            f"\n\n<PREVIOUS_EVALUATION_FEEDBACK>\n"
            f"Your previous resume draft scored below the quality threshold. "
            f"The evaluator provided the following feedback. You MUST address every point:\n"
            f"{previous_feedback}\n"
            f"</PREVIOUS_EVALUATION_FEEDBACK>"
        )

    link_map = (
        parsed_resume.get("link_placeholders")
        if isinstance(parsed_resume, dict)
        else None
    )
    safe_parsed_resume = (
        latex_parser.protect_links_in_obj(parsed_resume, link_map)
        if link_map
        else parsed_resume
    )

    prompt = template_manager.render_template(
        "writer_agent",
        parsed_resume=json.dumps(safe_parsed_resume, indent=2),
        jd_text=jd_text,
        selected_github_projects=json.dumps(selected_github_projects, indent=2),
    )

    if prompt is None:
        raise ValueError("Failed to render writer_agent template.")

    # Append feedback block after the template content
    prompt += feedback_block

    logger.info(f"Running Writer Agent {'(with feedback)' if previous_feedback else '(initial attempt)'}...")
    result = generate_json_completion(prompt, system_message)
    # Anti-hallucination: strip any proposed skill not proven in the bullets.
    result = ground_resume_skills(result, extract_known_skills(parsed_resume))
    if link_map and isinstance(result, (dict, list, str)):
        result = latex_parser.restore_links_in_obj(result, link_map)
    logger.info("Writer Agent finished.")

    return result


async def generate_and_qa_resume(
    parsed_resume: dict,
    jd_text: str,
    selected_github_projects: dict
) -> dict:
    """
    Master orchestration function: Generate a resume and grade it in a QA loop.

    1. Calls the Writer Agent to produce a resume.
    2. Evaluates the resume against the JD.
    3. If score >= QA_SCORE_THRESHOLD, returns immediately.
    4. If score < threshold, feeds feedback back into Writer Agent and retries.
    5. Maximum of QA_MAX_RETRIES additional attempts (total = 1 initial + 2 retries).
    6. Returns the best resume generated across all attempts.

    Returns:
        Dictionary with 'resume', 'score', 'feedback', and 'attempts' keys.
    """
    best_resume = None
    best_score = -1
    best_feedback = ""
    previous_feedback = None

    # The candidate's real resume is the ONLY permitted source of numbers.
    original_text = extract_original_text(parsed_resume)

    def finalize(resume, score, feedback, attempts, passed_qa):
        """Hard gate: strip any hallucinated metric clauses before returning."""
        cleaned, hallucinated = enforce_metrics_integrity(resume, original_text)
        return {
            "resume": cleaned,
            "score": score,
            "feedback": feedback,
            "attempts": attempts,
            "passed_qa": passed_qa,
            "metric_fixes": len(hallucinated),
        }

    total_attempts = 1 + QA_MAX_RETRIES  # 1 initial + 2 retries = 3 max

    for attempt in range(1, total_attempts + 1):
        logger.info(f"QA Loop — Attempt {attempt}/{total_attempts}")

        # Generate resume (with feedback on retries)
        if attempt == 1:
            generated_resume = await run_writer_agent(
                parsed_resume, jd_text, selected_github_projects
            )
        else:
            generated_resume = await run_writer_agent_with_feedback(
                parsed_resume, jd_text, selected_github_projects, previous_feedback
            )

        # Evaluate the generated resume
        evaluation = evaluate_resume(generated_resume, jd_text)
        score = evaluation.get("score", 0)
        feedback = evaluation.get("feedback", "")

        # Metric-fabrication check: surface the invented number so the retry can
        # correct it explicitly (strict, one-time regeneration feedback).
        hallucinated = verify_metrics_integrity(
            original_text, generated_bullet_text(generated_resume)
        )
        if hallucinated:
            logger.warning(
                f"QA Loop — Attempt {attempt} fabricated metric(s): {hallucinated}"
            )
            feedback += (
                f" METRIC INTEGRITY: you invented number(s) {hallucinated}, which "
                "are absent from the original resume. Remove them; use ONLY numbers "
                "explicitly present in the candidate's original resume."
            )

        logger.info(f"QA Loop — Attempt {attempt} scored {score}/100")

        # Track the best result
        if score > best_score:
            best_score = score
            best_resume = generated_resume
            best_feedback = feedback

        # If score meets threshold, return immediately (final gate applies)
        if score >= QA_SCORE_THRESHOLD:
            logger.info(f"QA Loop — Score {score} meets threshold ({QA_SCORE_THRESHOLD}). Returning.")
            return finalize(generated_resume, score, feedback, attempt, True)

        # Otherwise, set feedback for next iteration
        missing = evaluation.get("missing_keywords", [])
        previous_feedback = feedback
        if missing:
            previous_feedback += f" Missing keywords: {', '.join(missing)}."

        logger.warning(f"QA Loop — Score {score} below threshold. Feedback: {feedback}")

    # All retries exhausted — return the best attempt (final gate applies)
    logger.warning(
        f"QA Loop — Max retries exhausted. Returning best resume (score: {best_score})."
    )
    return finalize(best_resume, best_score, best_feedback, total_attempts, False)
