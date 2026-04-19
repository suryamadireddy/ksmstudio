from typing import Optional

from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY

_client: Optional[Client] = None
_service_client: Optional[Client] = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


def get_service_client() -> Client:
    """Service role client — bypasses RLS. Use only in trusted internal pipelines."""
    global _service_client
    if _service_client is None:
        _service_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _service_client
