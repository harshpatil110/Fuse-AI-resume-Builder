import json
from fastapi import HTTPException
from openai import OpenAI
import config

client = OpenAI(
    base_url=config.NVIDIA_BASE_URL,
    api_key=config.NVIDIA_NIM_API_KEY
)

def extract_json_from_response(response_text: str) -> str:
    """Extract JSON string from the LLM response if it is wrapped in markdown blocks."""
    if response_text.startswith("```json"):
        response_text = response_text[7:]
    if response_text.endswith("```"):
        response_text = response_text[:-3]
    return response_text.strip()

def generate_completion(prompt: str, system_message: str) -> dict:
    """Generate completion using Nvidia NIM GLM model."""
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
        extracted_content = extract_json_from_response(content)
        
        try:
            return json.loads(extracted_content)
        except json.JSONDecodeError:
            return {"raw_response": extracted_content}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Nvidia API Error: {str(e)}")
