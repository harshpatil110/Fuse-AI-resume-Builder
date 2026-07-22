"""
Agent orchestration module for Fuse AI Engine.

Houses the multi-agent workflow: Critic Agent, Writer Agent, etc.
"""

import json
import logging
from prompts.template_manager import TemplateManager
from llm_utils import generate_json_completion
from resume_evaluator import evaluate_resume

logger = logging.getLogger(__name__)

template_manager = TemplateManager()

QA_SCORE_THRESHOLD = 85
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
        "Never include markdown formatting, code fences, or conversational text."
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
        "Never include markdown formatting, code fences, or conversational text."
    )

    prompt = template_manager.render_template(
        "writer_agent",
        parsed_resume=json.dumps(parsed_resume, indent=2),
        jd_text=jd_text,
        selected_github_projects=json.dumps(selected_github_projects, indent=2),
    )

    if prompt is None:
        raise ValueError("Failed to render writer_agent template.")

    logger.info("Running Writer Agent...")
    result = generate_json_completion(prompt, system_message)
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
        "Never include markdown formatting, code fences, or conversational text."
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

    prompt = template_manager.render_template(
        "writer_agent",
        parsed_resume=json.dumps(parsed_resume, indent=2),
        jd_text=jd_text,
        selected_github_projects=json.dumps(selected_github_projects, indent=2),
    )

    if prompt is None:
        raise ValueError("Failed to render writer_agent template.")

    # Append feedback block after the template content
    prompt += feedback_block

    logger.info(f"Running Writer Agent {'(with feedback)' if previous_feedback else '(initial attempt)'}...")
    result = generate_json_completion(prompt, system_message)
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

        logger.info(f"QA Loop — Attempt {attempt} scored {score}/100")

        # Track the best result
        if score > best_score:
            best_score = score
            best_resume = generated_resume
            best_feedback = feedback

        # If score meets threshold, return immediately
        if score >= QA_SCORE_THRESHOLD:
            logger.info(f"QA Loop — Score {score} meets threshold ({QA_SCORE_THRESHOLD}). Returning.")
            return {
                "resume": generated_resume,
                "score": score,
                "feedback": feedback,
                "attempts": attempt,
                "passed_qa": True,
            }

        # Otherwise, set feedback for next iteration
        missing = evaluation.get("missing_keywords", [])
        previous_feedback = feedback
        if missing:
            previous_feedback += f" Missing keywords: {', '.join(missing)}."

        logger.warning(f"QA Loop — Score {score} below threshold. Feedback: {feedback}")

    # All retries exhausted — return the best attempt
    logger.warning(
        f"QA Loop — Max retries exhausted. Returning best resume (score: {best_score})."
    )
    return {
        "resume": best_resume,
        "score": best_score,
        "feedback": best_feedback,
        "attempts": total_attempts,
        "passed_qa": False,
    }
