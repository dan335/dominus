// Talks to the app under test from the test process: runs server code
// through `meteor shell` in the app's folder, which needs the app running
// there (tests/e2e/run.sh starts one). Used for fixtures
// (server/lib/testRunnerE2e.js) and for checking what a click changed.
const { spawnSync } = require('child_process');
const path = require('path');

const appDir = path.resolve(__dirname, '..', '..', '..');

// Runs code (an expression) on the server and returns its value, which must
// survive JSON. A thrown error comes back as an Error here.
function server(code) {
  const script = `(function() { try { return JSON.stringify({ok: (function() { return ${code}; })()}); }
    catch (e) { return JSON.stringify({error: e.stack || e.message}); } })()`;
  const args = ['shell'];
  if (process.getuid && process.getuid() === 0) args.push('--allow-superuser');
  const out = spawnSync('meteor', args, {cwd: appDir, input: script + '\n', encoding: 'utf8', timeout: 120000});
  const text = (out.stdout || '') + (out.stderr || '');
  const line = text.split('\n').reverse().find((l) => /^"\{.*\}"\s*$/.test(l));
  if (!line) throw new Error('no result from meteor shell for ' + code + ':\n' + text.slice(-2000));
  const result = JSON.parse(JSON.parse(line));
  if (result.error) throw new Error('server: ' + result.error);
  return result.ok === undefined ? undefined : result.ok;
}

module.exports = { server, appDir };
