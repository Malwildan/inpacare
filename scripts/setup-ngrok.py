"""Extract ngrok from its signed official APT repository without sudo."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.request

root = Path(__file__).resolve().parent.parent
runtime = root / '.runtime/ngrok'
runtime.mkdir(parents=True, exist_ok=True)
base = 'https://ngrok-agent.s3.amazonaws.com/'


def download(relative, destination, digest=None):
    with urllib.request.urlopen(base + relative, timeout=40) as response:
        data = response.read()
    if digest and hashlib.sha256(data).hexdigest() != digest:
        raise SystemExit('ngrok repository checksum mismatch: ' + relative)
    destination.write_bytes(data)
    return data


download('ngrok.asc', runtime / 'ngrok.asc')
download('dists/bookworm/InRelease', runtime / 'InRelease')
keyring = runtime / 'gpg'
keyring.mkdir(mode=0o700, exist_ok=True)
keyring.chmod(0o700)
commands = [
    ['gpg', '--homedir', str(keyring), '--batch', '--import', str(runtime / 'ngrok.asc')],
    ['gpg', '--homedir', str(keyring), '--batch', '--yes', '--output', str(runtime / 'Release'), '--decrypt', str(runtime / 'InRelease')]
]
for command in commands:
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit('ngrok repository signature verification failed: ' + result.stderr[-1200:])
release = (runtime / 'Release').read_text().split('SHA256:\n', 1)[1]
match = re.search(r'^ ([0-9a-f]{64})\s+\d+\s+main/binary-amd64/Packages$', release, re.M)
if not match:
    raise SystemExit('Signed ngrok package index was not found')
packages = download('dists/bookworm/main/binary-amd64/Packages', runtime / 'Packages', match[1]).decode()
entries = [dict(line.split(': ', 1) for line in block.splitlines() if ': ' in line and not line.startswith(' ')) for block in packages.split('\n\n')]
package = next(entry for entry in entries if entry.get('Package') == 'ngrok' and entry.get('Architecture') == 'amd64')
if not package['Filename'].startswith('pool/') or '..' in Path(package['Filename']).parts:
    raise SystemExit('Unexpected ngrok package path')
download(package['Filename'], runtime / 'ngrok.deb', package['SHA256'])
subprocess.run(['dpkg-deb', '-x', str(runtime / 'ngrok.deb'), str(runtime)], check=True)
binary = runtime / 'usr/local/bin/ngrok'
if not binary.is_file():
    binary = runtime / 'usr/bin/ngrok'
if not binary.is_file():
    raise SystemExit('ngrok executable missing from package')
binary.chmod(0o755)
link = runtime / 'ngrok'
if link.is_symlink():
    link.unlink()
elif link.exists():
    raise SystemExit('Existing ngrok path is not a managed symlink')
link.symlink_to(binary.relative_to(runtime))
version = subprocess.run([str(binary), 'version'], capture_output=True, text=True, check=True).stdout.strip()
report = {'version': version, 'repository': base, 'signedReleaseVerified': True, 'packageVersion': package['Version'], 'packageSha256': package['SHA256'], 'binarySha256': hashlib.sha256(binary.read_bytes()).hexdigest()}
(runtime / 'provenance.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
