"""Entry point for the frozen single-file executable (PyInstaller/Nuitka).

The wheel installs a `flexitracker` console script; the frozen exe needs a plain
top-level script to freeze. Build (see release.yml):

    uv run --group build pyinstaller --onefile --name flexitracker \
        --paths src --console pyinstaller_entry.py
"""

import sys

from flexitracker.cli import main

if __name__ == "__main__":
    sys.exit(main())
