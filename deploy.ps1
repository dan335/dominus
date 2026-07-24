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
# `up -d` recreates the containers because the image ID changed.
ssh $SERVER "cd ~/server && docker compose up -d dominus-web dominus-worker && docker image prune -f"
Assert-LastExitCode "docker compose up"

# The app can take a while to boot (Mongo Atlas connection etc.) — traefik
# returns 502 until then, so poll instead of a single check.
Write-Host "Waiting for app to come up..."
$deadline = (Get-Date).AddMinutes(3)
while ($true) {
    Start-Sleep -Seconds 10
    curl.exe -sf -o NUL https://dominusgame.net/
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: dominusgame.net is up"
        break
    }
    if ((Get-Date) -gt $deadline) {
        Write-Error "FAILED: dominusgame.net not responding after 3 minutes"
        exit 1
    }
    Write-Host "  not up yet, retrying..."
}
