// Talks to the app under test from the test process: runs server code
// through `meteor shell` in the app's folder, which needs the app running
// there (tests/e2e/run.sh starts one). Used for fixtures
// (server/lib/testRunnerE2e.js) and for checking what a click changed.
const { spawnSync } = require('child_process');
const path = require('path');

const appDir = path.resolve(__dirname, '..', '..', '..');

// Runs code (an expression) on the server and returns its value, which must
// survive JSON. A promise is waited for. A thrown error or a rejection comes
// back as an Error here.
function server(code) {
  // Meteor 2.16's shell prints a promise as it is, so the script waits for it
  // in the shell's fiber with Promise.await; Meteor 3 has no fibers, and its
  // shell waits for a promise itself.
  const script = `(function() {
    var done = function(value) { return JSON.stringify({ok: value}); };
    var failed = function(e) { return JSON.stringify({error: (e && (e.stack || e.message)) || String(e)}); };
    try {
      var value = (function() { return ${code}; })();
      if (!value || typeof value.then !== 'function') return done(value);
      var result = Promise.resolve(value).then(done, failed);
      return typeof Promise.await === 'function' ? Promise.await(result) : result;
    } catch (e) { return failed(e); }
  })()`;
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
