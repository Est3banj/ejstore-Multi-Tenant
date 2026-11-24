"""Offline contract check; requires existing Python + PyYAML, never installs tools."""
import json
from pathlib import Path
import re
import subprocess

import yaml

root = Path(__file__).resolve().parents[2]
path = root / ".github/workflows/security-compatibility.yml"
text = path.read_text()
# BaseLoader preserves the literal key `on` (YAML 1.1 SafeLoader makes it True).
workflow = yaml.load(text, Loader=yaml.BaseLoader)
assert set(workflow) == {"name", "on", "permissions", "concurrency", "jobs"}
assert workflow["on"] == {"workflow_dispatch": ""}
assert workflow["permissions"] == {"contents": "read"}
assert workflow["concurrency"]["cancel-in-progress"] == "false"
assert set(workflow["jobs"]) == {"validation"}
job = workflow["jobs"]["validation"]
assert set(job) == {"name", "runs-on", "timeout-minutes", "defaults", "env", "steps"}
assert job["runs-on"] == "ubuntu-24.04"
assert 1 <= int(job["timeout-minutes"]) <= 30
assert job["defaults"] == {"run": {"shell": "bash"}}
assert not re.search(r"secrets\s*\.|id-token|service.account|environment:|continue-on-error|workflow_run|workflow_call", text, re.I)
assert not re.search(r"\b(build|deploy|publish)\b", "\n".join(step.get("run", "") for step in job["steps"]), re.I)
assert not re.search(r"\|\|\s*true|\bnpx\b", text)
uses = {step["uses"]: step.get("with", {}) for step in job["steps"] if "uses" in step}
assert set(uses) == {"actions/checkout@v4", "actions/setup-node@v4", "actions/setup-java@v4"}
assert uses["actions/checkout@v4"] == {"persist-credentials": "false"}
assert uses["actions/setup-node@v4"] == {"node-version": "22"}
assert uses["actions/setup-java@v4"] == {"distribution": "temurin", "java-version": "21"}
gates = []
installs = []
for step in job["steps"]:
    assert set(step) <= {"name", "uses", "with", "run"}
    if "run" not in step:
        continue
    script = step["run"]
    subprocess.run(["bash", "-n"], input=script, text=True, check=True)
    gates.extend(re.findall(r"^node tests/security-rules/manual-validation.mjs (\w+)$", script, re.M))
    for line in script.splitlines():
        if line.startswith("npm "):
            assert re.fullmatch(r"npm ci --prefix tests/security-(tools|rules|frontend) --ignore-scripts --no-audit --no-fund", line)
            installs.append(line.split()[3])
assert gates == ["candidate", "handlers", "frontend", "runtime", "readiness"]
assert installs == ["tests/security-tools", "tests/security-rules", "tests/security-frontend"]
assert (root / "tests/security-rules/manual-validation.mjs").is_file()
for package in installs:
    descriptor = json.loads((root / package / "package.json").read_text())
    lock = json.loads((root / package / "package-lock.json").read_text())
    assert descriptor["devDependencies"] == lock["packages"][""]["devDependencies"]
    for name, entry in lock["packages"].items():
        if "resolved" in entry:
            assert entry["resolved"].startswith("https://registry.npmjs.org/"), name
            assert entry.get("integrity"), name
tools = json.loads((root / "tests/security-tools/package-lock.json").read_text())
assert tools["packages"]["node_modules/firebase-tools"]["version"] == "15.15.0"
assert "test:baseline" not in text and "diagnostic:denial" not in text
print("PASS: manual-only YAML, read-only permissions, isolated locks, five gates, no release commands, Bash syntax")
