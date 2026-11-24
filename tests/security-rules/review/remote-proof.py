"""GET-only metadata, filtered before persistence. Never refresh authentication.

Tokens are read only in memory from existing CLI sessions, never printed/copied.
No env values, deployment logs, business endpoints or production data are read.
"""
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.error
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
manifest = json.loads((HERE / 'manifest.json').read_text())
repo = 'repos/Est3banj/ejstore-Multi-Tenant'

def gh(path):
    result = subprocess.run(['gh', 'api', path], cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        # Do not persist raw server error bodies or retry authentication.
        return {'unavailable': True, 'exitCode': result.returncode}
    return json.loads(result.stdout)

proof = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'mode': 'GET metadata only'}
info = gh('repos/Est3banj/ejstore-Multi-Tenant')
proof['github'] = {'defaultBranch': info.get('default_branch')}
workflows = gh(repo + '/actions/workflows')
proof['github']['workflows'] = [{k: w.get(k) for k in ['id', 'name', 'path', 'state']}
                               for w in workflows.get('workflows', [])]
proof['github']['refs'] = {}
for ref in ['main', 'feature/landing-page']:
    branch = gh(repo + '/branches/' + urllib.parse.quote(ref, safe=''))
    listing = gh(repo + '/contents/.github/workflows?ref=' + urllib.parse.quote(ref, safe=''))
    entries = []
    if isinstance(listing, list):
        for entry in listing:
            content = gh(repo + '/contents/' + entry['path'] + '?ref=' + urllib.parse.quote(ref, safe=''))
            data = base64.b64decode(content.get('content', ''))
            # Keep only workflow hash and declared trigger block, not run env/secrets.
            text = data.decode()
            triggers = text[text.index('on:'):text.index('\njobs:')] if 'on:' in text and '\njobs:' in text else 'not parsed'
            entries.append({'path': entry['path'], 'gitBlob': entry['sha'],
                            'sha256': hashlib.sha256(data).hexdigest(), 'declaredTriggers': triggers.strip()})
    proof['github']['refs'][ref] = {'sha': branch.get('commit', {}).get('sha'),
                                    'protected': branch.get('protected'), 'workflows': entries}
hooks = gh(repo + '/hooks')
proof['github']['repositoryHooks'] = [{k: h.get(k) for k in ['id', 'name', 'active', 'events']}
                                      for h in hooks] if isinstance(hooks, list) else hooks
runs = gh(repo + '/actions/runs?per_page=3')
proof['github']['recentRuns'] = [{k: r.get(k) for k in ['event', 'head_branch', 'head_sha', 'status', 'conclusion', 'created_at']}
                               for r in runs.get('workflow_runs', [])]
proof['github']['appInventory'] = 'Not verified: installation endpoint already returned 401 (requires app authentication); not retried. Repository metadata GETs succeed.'

session = Path.home() / 'Library/Application Support/com.vercel.cli/auth.json'
project = ROOT / '.vercel/project.json'
if session.exists() and project.exists():
    auth = json.loads(session.read_text())
    local = json.loads(project.read_text())
    token = auth.get('token')
    team = urllib.parse.quote(local['orgId'])
    failed = False

    def get(path):
        global failed
        if failed:
            return {'unavailable': 'prior request failed; no retry'}
        req = urllib.request.Request('https://api.vercel.com' + path, method='GET',
                                     headers={'Authorization': 'Bearer ' + token})
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            failed = True
            return {'httpStatus': error.code}

    if token:
        remote = get('/v9/projects/' + local['projectId'] + '?teamId=' + team)
        proof['vercel'] = {k: remote.get(k) for k in ['id', 'name', 'gitProviderOptions',
                                                     'gitForkProtection', 'gitLFS', 'httpStatus'] if k in remote}
        proof['vercel']['link'] = {k: remote.get('link', {}).get(k) for k in ['type', 'productionBranch', 'repoId']}
        deployments = get('/v6/deployments?projectId=' + local['projectId'] + '&teamId=' + team + '&limit=3')
        proof['vercel']['last3'] = [{k: d.get(k) for k in ['uid', 'source', 'target', 'state', 'created']}
                                   for d in deployments.get('deployments', [])]
        proof['vercel']['automaticGitDeployment'] = remote.get('gitProviderOptions', {}).get('createDeployments')
        proof['vercel']['scope'] = 'ejstore-api project only; no claim about other projects/apps'
    else:
        proof['vercel'] = {'unavailable': 'No cached token; no interactive auth'}
else:
    proof['vercel'] = {'unavailable': 'No existing session/project metadata'}
proof['firebase'] = {'status': 'not re-requested',
    'reason': 'Prior cached-session metadata GET returned 401 in STAGE3; no refresh/retry. Effective remote Hosting/Functions pipeline inventory remains unverified.',
    'localPipeline': 'HEAD ci-cd.yml declares Hosting build/deploy; local untracked ci.yml/cd.yml excluded from units.'}
proof['publication'] = 'NO push/PR/dispatch: local feature ref misses declared push filters, but remote failed push runs exist on feature refs; third-party/app inventory is incomplete.'
manifest['remoteReadOnly'] = proof
(HERE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(proof, indent=2))
