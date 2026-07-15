import os
from pathlib import Path
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parent
IMPORT_PREAMBLE = """
import sys
import types

dotenv = types.ModuleType("dotenv")
dotenv.load_dotenv = lambda: None
sys.modules["dotenv"] = dotenv
"""


class ServiceKeyConfigurationTests(unittest.TestCase):
    def run_python(self, code: str, **env_overrides: str) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env.update(
            {
                "ANTHROPIC_API_KEY": "test-anthropic",
                "SUPABASE_URL": "https://example.supabase.co",
                "SUPABASE_KEY": "test-anon-key",
            }
        )
        env.pop("SUPABASE_SERVICE_KEY", None)
        env.pop("SUPABASE_SERVICE_ROLE_KEY", None)
        env.update(env_overrides)
        return subprocess.run(
            [sys.executable, "-c", IMPORT_PREAMBLE + code],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_config_imports_without_service_key(self) -> None:
        result = self.run_python(
            """
import config
assert config.SUPABASE_SERVICE_KEY is None
"""
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_documented_service_role_key_alias_is_supported(self) -> None:
        result = self.run_python(
            """
import config
assert config.SUPABASE_SERVICE_KEY == "test-service-role"
""",
            SUPABASE_SERVICE_ROLE_KEY="test-service-role",
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_service_client_fails_only_when_requested(self) -> None:
        result = self.run_python(
            """
supabase = types.ModuleType("supabase")
supabase.Client = object
supabase.create_client = lambda *_args: (_ for _ in ()).throw(
    AssertionError("create_client should not be called without a service key")
)
sys.modules["supabase"] = supabase

import db

try:
    db.get_service_client()
except RuntimeError as error:
    assert "SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY" in str(error)
else:
    raise AssertionError("missing service key should fail when service access is requested")
"""
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
