import os
from dotenv import load_dotenv

load_dotenv()

NVIDIA_NIM_API_KEY = os.getenv("NVIDIA_NIM_API_KEY")
# Nvidia NIM OpenAI-compatible endpoint. The trailing "/v1" is required —
# the OpenAI SDK appends "/chat/completions" to this root.
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
# Must be an id from https://integrate.api.nvidia.com/v1/models.
# The prior value "THUDM/glm-4-9b-chat" is NOT in the NIM catalog and
# caused 404 "page not found" on every chat request.
# "z-ai/glm-5.2" (project's intended model) works but free-tier inference
# is extremely slow (minutes per call). "deepseek-ai/deepseek-v4-flash"
# responds in ~1s on this account. Swap back if you prefer GLM-5.2.
MODEL_NAME = "deepseek-ai/deepseek-v4-flash"

