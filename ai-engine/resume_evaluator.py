"""
Resume Quality Evaluator for Fuse AI Engine.

Refactored from the legacy evaluator.py and score.py to accept
JSON resume dictionaries instead of parsing PDFs.

Scores a generated resume against a JD on keyword matching,
action verb strength, and overall alignment.
"""

import json
import logging
from llm_utils import generate_json_completion

logger = logging.getLogger(__name__)


EVALUATOR_SYSTEM_MESSAGE = (
    "You are a Senior ATS (Applicant Tracking System) Analyst. "
    "You score resumes against job descriptions with surgical precision. "
    "You return ONLY valid JSON. Never include markdown formatting, code fences, or conversational text."
)

EVALUATOR_PROMPT_TEMPLATE = """You are evaluating a generated resume against a specific Job Description.

<GENERATED_RESUME>
{resume_json}
</GENERATED_RESUME>

<JOB_DESCRIPTION>
{jd_text}
</JOB_DESCRIPTION>

SCORING CRITERIA (100 points total):
1. **Keyword Coverage (40 points):** What percentage of the JD's required technical skills, tools, frameworks, and qualifications are explicitly present in the resume? Deduct heavily for each missing critical keyword.
2. **Action Verb Strength (20 points):** Are the bullet points led by strong, ownership-driven action verbs (e.g., "Architected", "Spearheaded", "Optimized")? Deduct for weak verbs like "helped", "assisted", "worked on".
3. **Quantifiable Impact (20 points):** Do the bullet points contain concrete metrics, percentages, or measurable outcomes? Deduct for vague statements lacking numbers.
4. **JD Alignment & Relevance (20 points):** Does every section of the resume directly map to the JD requirements? Deduct for irrelevant experience that wastes space.

OUTPUT MANDATE:
Your response MUST be ONLY a valid JSON object. Use this exact structure:
{{
  "score": 85,
  "keyword_coverage": 38,
  "action_verb_strength": 18,
  "quantifiable_impact": 15,
  "jd_alignment": 14,
  "feedback": "Concise 2-3 sentence summary of what needs improvement. Be specific about missing keywords or weak sections.",
  "missing_keywords": ["keyword1", "keyword2"]
}}"""


def evaluate_resume(resume_dict: dict, jd_text: str) -> dict:
    """
    Evaluate a generated resume (as a dict) against a Job Description.

    Args:
        resume_dict: The generated resume as a Python dictionary.
        jd_text: The raw Job Description text.

    Returns:
        A dictionary with score (0-100), detailed sub-scores, and actionable feedback.
    """
    prompt = EVALUATOR_PROMPT_TEMPLATE.format(
        resume_json=json.dumps(resume_dict, indent=2),
        jd_text=jd_text,
    )

    logger.info("Running Resume Evaluator...")
    result = generate_json_completion(prompt, EVALUATOR_SYSTEM_MESSAGE)

    # Ensure score is clamped to 0-100
    if "score" in result:
        result["score"] = max(0, min(100, result["score"]))

    logger.info(f"Evaluation complete. Score: {result.get('score', 'N/A')}/100")
    return result
