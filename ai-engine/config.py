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
# "deepseek-ai/deepseek-v4-flash" responded in ~1s but is a small/fast model.
# The user explicitly chose "nvidia/nemotron-3-ultra-550b-a55b" (Nvidia
# Nemotron 3 Ultra) for higher-quality output — slower, but quality over speed.
MODEL_NAME = "nvidia/nemotron-3-ultra-550b-a55b"

