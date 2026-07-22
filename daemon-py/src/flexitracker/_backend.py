"""Backend URL baked into the release build.

Mirrors the Rust `option_env!("FLEXITRACKER_BACKEND_URL")`: the release pipeline
rewrites `BAKED_BACKEND_URL` (from the PROD_BASE_URL variable) so a user runs only
`flexitracker configure --key <KEY>`. The `FLEXITRACKER_BACKEND_URL` environment
variable overrides it, and `--backend-url` overrides both.
"""

import os

# Rewritten at release time. Empty in source so self-hosters must pass --backend-url.
BAKED_BACKEND_URL = ""


def default_backend_url() -> str:
    return os.environ.get("FLEXITRACKER_BACKEND_URL") or BAKED_BACKEND_URL
