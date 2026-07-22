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
