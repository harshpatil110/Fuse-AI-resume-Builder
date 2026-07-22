"""
LLM utility module for Fuse AI Engine.

Handles communication with Nvidia NIM GLM model via the OpenAI-compatible API.
Includes defensive JSON parsing, retry logic, and markdown stripping.
"""

import json
import re
import logging
from fastapi import HTTPException
from openai import OpenAI
import config

logger = logging.getLogger(__name__)

client = OpenAI(
    base_url=config.NVIDIA_BASE_URL,
    api_key=config.NVIDIA_NIM_API_KEY
)

MAX_RETRIES = 3


def clean_json_string(raw_string: str) -> str:
    """
    Strip markdown code blocks and common formatting artifacts from LLM output.

    Handles patterns like:
      ```json\n{...}\n```
      ```\n{...}\n```
      Leading/trailing whitespace
      Trailing commas before closing braces/brackets
    """
    if not raw_string:
        return raw_string

    cleaned = raw_string.strip()

    # Remove ```json ... ``` or ``` ... ``` wrappers
    cleaned = re.sub(r'^```(?:json)?\s*\n?', '', cleaned)
    cleaned = re.sub(r'\n?```\s*$', '', cleaned)
    cleaned = cleaned.strip()

    # Fix trailing commas before } or ] (common LLM mistake)
    cleaned = re.sub(r',\s*([}\]])', r'\1', cleaned)

    return cleaned


def generate_completion(prompt: str, system_message: str) -> dict:
    """
    Generate a single LLM completion. Returns parsed JSON if possible,
    otherwise returns the raw response wrapped in a dict.
    """
    try:
        response = client.chat.completions.create(
            model=config.MODEL_NAME,
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            top_p=0.9
        )

        content = response.choices[0].message.content
        cleaned = clean_json_string(content)

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return {"raw_response": cleaned}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Nvidia API Error: {str(e)}")


def generate_json_completion(prompt: str, system_message: str) -> dict:
    """
    Generate an LLM completion with retry logic, guaranteeing valid JSON output.

    Attempts up to MAX_RETRIES times. On each attempt:
      1. Calls the LLM.
      2. Strips markdown artifacts via clean_json_string.
      3. Parses with json.loads().
      4. Returns the dict on success.

    Raises HTTPException(500) if all retries are exhausted.
    """
    last_error = None
    last_raw = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.chat.completions.create(
                model=config.MODEL_NAME,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                top_p=0.9
            )

            raw_content = response.choices[0].message.content
            last_raw = raw_content
            cleaned = clean_json_string(raw_content)
            parsed = json.loads(cleaned)

            if isinstance(parsed, dict):
                logger.info(f"JSON parsed successfully on attempt {attempt}.")
                return parsed
            else:
                logger.warning(f"Attempt {attempt}: Parsed result is not a dict, retrying...")
                last_error = "Parsed JSON is not a dictionary."
                continue

        except json.JSONDecodeError as e:
            logger.warning(f"Attempt {attempt}/{MAX_RETRIES}: JSON decode failed — {e}")
            last_error = str(e)
            continue

        except Exception as e:
            logger.error(f"Attempt {attempt}/{MAX_RETRIES}: LLM API call failed — {e}")
            last_error = str(e)
            continue

    logger.error(
        f"All {MAX_RETRIES} attempts exhausted. Last error: {last_error}. "
        f"Last raw output (truncated): {str(last_raw)[:500]}"
    )
    raise HTTPException(
        status_code=500,
        detail="AI generation failed formatting validation after multiple retries."
    )
