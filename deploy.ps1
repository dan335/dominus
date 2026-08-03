# Registry-free deploy for Windows.
# The image tag still says registry.gitlab.com but nothing contacts GitLab —
# the image is streamed to the server over SSH instead of pushed to a registry.
$ErrorActionPreference = "Stop"

$SERVER = "dan@104.236.39.83"
$IMAGE = "registry.gitlab.com/danphi/dominus:latest"

function Assert-LastExitCode($step) {
    if ($LASTEXITCODE -ne 0) {
        Write-Error "FAILED: $step (exit code $LASTEXITCODE)"
        exit 1
    }
}

if (Test-Path .build) { Remove-Item -Recurse -Force .build }

# Known Windows quirk: meteor-tool can keep spinning after writing a complete
# .build/dominus.tar.gz. If this step seems stuck long after the tarball stops
# changing, verify it with `tar -tzf .build\dominus.tar.gz` and kill meteor.
meteor build .build --architecture os.linux.x86_64 --allow-superuser
Assert-LastExitCode "meteor build"

docker build -t $IMAGE --platform linux/x86_64 .
Assert-LastExitCode "docker build"

# The save|load pipeline runs through cmd so the pipe carries raw bytes —
# PowerShell before 7.4 corrupts binary data piped between native commands.
Write-Host "Streaming image to $SERVER (ssh -C compresses in transit)..."
cmd /c "docker save $IMAGE | ssh -C $SERVER ""docker load"""
Assert-LastExitCode "docker save | ssh | docker load"

# No `docker compose pull` — there is no upstream registry anymore.
#
# --force-recreate is required. `up -d` alone does NOT reliably recreate: the
# build produces a multi-arch manifest list and compose's up-to-date check does
# not resolve through it, so it prints "Container server-dominus-web-1  Running"
# and keeps the old container even though docker load just replaced the image.
# That is how this deploy silently no-opped for four months.
ssh $SERVER "cd ~/server && docker compose up -d --force-recreate dominus-web dominus-worker"
Assert-LastExitCode "docker compose up"

# The app can take a while to boot (Mongo Atlas connection etc.) — traefik
# returns 502 until then, so poll instead of a single check.
Write-Host "Waiting for app to come up..."
$deadline = (Get-Date).AddMinutes(3)
while ($true) {
    Start-Sleep -Seconds 10
    curl.exe -sf -o NUL https://dominusgame.net/
    if ($LASTEXITCODE -eq 0) { break }
    if ((Get-Date) -gt $deadline) {
        Write-Error "FAILED: dominusgame.net not responding after 3 minutes"
        exit 1
    }
    Write-Host "  not up yet, retrying..."
}

# "Site responds" is NOT proof the deploy landed — the OLD container answers 200
# just as happily. Compare the commit baked into the served bundle against the
# commit we just built. This is the check that would have caught the
# four-month-stale deploy on day one.
$expected = (git rev-parse HEAD).Trim()
$html = curl.exe -s https://dominusgame.net/
$live = ""
if ($html -match '%22gitCommitHash%22%3A%22([a-f0-9]+)%22') { $live = $matches[1] }
Write-Host "  expected commit: $expected"
Write-Host "  live commit:     $live"
if ($expected -ne $live) {
    Write-Error "FAILED: dominusgame.net is NOT running the current commit"
    exit 1
}
Write-Host "OK: dominusgame.net is up and running the current commit"

# Prune only after a verified deploy, so a failed one leaves the old image
# recoverable. Note this clears dangling images for every project on the host.
ssh $SERVER "docker image prune -f"
