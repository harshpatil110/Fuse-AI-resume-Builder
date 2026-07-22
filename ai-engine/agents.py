"""
Agent orchestration module for Fuse AI Engine.

Houses the multi-agent workflow: Critic Agent, Writer Agent, etc.
"""

import json
import logging
from prompts.template_manager import TemplateManager
from llm_utils import generate_completion

logger = logging.getLogger(__name__)

template_manager = TemplateManager()


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
    result = generate_completion(prompt, system_message)
    logger.info(f"Critic Agent finished. Match score: {result.get('overall_match_score', 'N/A')}")

    return result
