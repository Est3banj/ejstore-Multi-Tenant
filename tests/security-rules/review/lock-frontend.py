"""Generate only the isolated frontend lock, never install workspace dependencies."""
from pathlib import Path
import subprocess
import tempfile
HERE = Path(__file__).resolve().parent
TEMP = Path('/var/folders/zq/6h6qz_616b371m8v3q93wklh0000gn/T/opencode')
assert TEMP.is_dir()
target = Path(tempfile.mkdtemp(prefix='frontend-lock-', dir=TEMP))
(target / 'package.json').write_bytes((HERE / 'sources/package.json').read_bytes())
subprocess.run(['npm', 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund',
                '--registry=https://registry.npmjs.org/'], cwd=target, check=True)
(HERE / 'sources/package-lock.json').write_bytes((target / 'package-lock.json').read_bytes())
print(target)
