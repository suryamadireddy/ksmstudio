import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY: str = os.environ["ANTHROPIC_API_KEY"]
SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_KEY: str = os.environ["SUPABASE_KEY"]
SUPABASE_SERVICE_KEY: str = os.environ["SUPABASE_SERVICE_KEY"]

# Deep reasoning — triage, re-triage
REASONING_MODEL = "claude-opus-4-6"

# Synthesis, structured generation, web search pipelines — sharpen, artifacts
PIPELINE_MODEL = "claude-sonnet-4-6"

# Conversational — converse internal and public chat
CONVERSE_MODEL = "claude-sonnet-4-6"

# Backward-compatibility alias. Remove after all call sites are migrated.
MODEL = PIPELINE_MODEL
