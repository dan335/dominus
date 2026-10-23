// Reads what a soak run left in its results folder and writes report.md and
// summary.json there. Exits 1 when the soak fails. Run by tests/soak/run.sh:
//
//   node report.js <results folder> [baseline summary.json]
//
// It fails on: a job that failed for good or threw, an unhandled promise rejection, a
// web or worker restart, an invariant broken for three samples in a row (but
// for the known bugs below), an internal server error or unanswered call from
// the bots, memory that keeps growing, a monitor that stopped reporting, or a
// soak in which the game was never played. Logged exceptions only warn, since
// the game logs some today; with a baseline (the summary.json of an earlier
// soak, of master) a kind of exception the baseline didn't have fails.

const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const baselinePath = process.argv[3];
const mode = process.env.MODE || 'soak';

const read = (name) => {
  try {
    return fs.readFileSync(path.join(dir, name), 'utf8');
  } catch (e) {
    return '';
  }
};
const lines = (name) => read(name).split('\n');

// Invariant problems the game has today (the "known bug" tests in
// server/simulationTests.js). The nightly rebuild puts this one right.
const KNOWN_PROBLEMS = [
  /^num_allies_above counts the list: /
];

// --- the monitor's samples ---

const samples = {web: [], worker: []};
const monitorErrors = [];
const rejections = [];
for (const role of ['web', 'worker']) {
  let current = null;
  for (const line of lines(role + '.log')) {
    if (line.startsWith('SOAK_SAMPLE ')) {
      try {
        samples[role].push(JSON.parse(line.slice('SOAK_SAMPLE '.length)));
      } catch (e) {
        monitorErrors.push(role + ': unreadable sample');
      }
    } else if (line.startsWith('SOAK_MONITOR_ERROR')) {
      monitorErrors.push(role + ': ' + line);
    }
    if (/SOAK_UNHANDLED_REJECTION|UnhandledPromiseRejectionWarning|^Unhandled rejection/.test(line)) {
      current = {role, lines: [line]};
      rejections.push(current);
    } else if (current && /^\s+at /.test(line) && current.lines.length < 8) {
      current.lines.push(line);
    } else {
      current = null;
    }
  }
}

// --- exceptions in the logs, grouped by kind ---

const normalise = (line) => line
  .replace(/[A-Za-z0-9]{17}/g, '<id>')
  .replace(/\b[0-9a-f]{24}\b/g, '<oid>')
  .replace(/\d+(\.\d+)?/g, '<n>')
  .slice(0, 200);
const exceptions = {};
// A job handler that throws doesn't fail its Bull job today: the handlers are
// wrapped in Meteor.bindEnvironment, which catches the error, logs it as
// "Exception in callback of async function" and lets Bull mark the job
// completed. So a logged exception whose stack runs through the queue's
// handler wrapper (dominus-queue/queue.js) is a job that failed, named here by
// the file that registered the handler.
const jobExceptions = {};
for (const role of ['web', 'worker']) {
  const all = lines(role + '.log');
  all.forEach((line, i) => {
    if (!/^(Exception (in|while|from)|\w*Error\b|MongoServerError|Error:)/.test(line.trim()) || /^SOAK_/.test(line)) return;
    const kind = role + ': ' + normalise(line.trim());
    exceptions[kind] = (exceptions[kind] || 0) + 1;
    const stack = [];
    for (let j = i + 1; j < all.length && j < i + 40 && /^\s+at /.test(all[j]); j++) stack.push(all[j]);
    if (stack.some((frame) => frame.includes('packages/dominus-queue/queue.js'))) {
      const files = stack.map((frame) => /packages\/(dominus-[\w-]+\/server\/[\w.]+\.js)/.exec(frame)).filter(Boolean);
      const job = (files.length ? files[files.length - 1][1] : 'unknown job') + ': ' + normalise(line.trim());
      jobExceptions[job] = (jobExceptions[job] || 0) + 1;
    }
  });
}

// --- restarts, bots, docker ---

const restarts = {};
for (const line of lines('restarts.txt')) {
  const [role, count] = line.split(' ');
  if (role) restarts[role] = count;
}

let bots = null;
try {
  bots = JSON.parse(read('bots.json'));
} catch (e) {
  bots = null;
}

const dockerMemory = {};
const toMb = (s) => {
  const m = /([\d.]+)\s*([KMG]i?B)/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2][0] == 'G' ? n * 1024 : m[2][0] == 'K' ? n / 1024 : n;
};
for (const line of lines('docker-stats.csv').slice(1)) {
  const [t, name, memory] = line.split(',');
  if (!name) continue;
  const mb = toMb(memory.split('/')[0]);
  const container = name.replace(/^.*-(web|worker|mongo|redis)$/, '$1');
  if (mb !== null) (dockerMemory[container] = dockerMemory[container] || []).push({t, mb});
}

// the baseline summary.json, when there is one
let baselineCache;
const baselineFile = () => {
  if (baselineCache === undefined) {
    baselineCache = null;
    if (baselinePath) {
      try {
        baselineCache = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      } catch (e) {
        baselineCache = {unreadable: String(e.message)};
      }
    }
  }
  return baselineCache;
};

// --- verdicts ---

const checks = [];
const check = (name, status, detail) => checks.push({name, status, detail});
const mb = (bytes) => Math.round(bytes / 1048576);
const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const minutesBetween = (a, b) => (new Date(b) - new Date(a)) / 60000;

const workerSamples = samples.worker;
const webSamples = samples.web;
const first = workerSamples[0];
const last = workerSamples[workerSamples.length - 1];
const minutes = first && last ? Math.round(minutesBetween(first.t, last.t)) : 0;

// the monitor kept reporting
const gaps = [];
for (const role of ['web', 'worker']) {
  const s = samples[role];
  if (!s.length) {
    gaps.push(role + ' sent no samples');
    continue;
  }
  const step = s.length > 1 ? median(s.slice(1).map((x, i) => minutesBetween(s[i].t, x.t))) : 1;
  for (let i = 1; i < s.length; i++) {
    if (minutesBetween(s[i - 1].t, s[i].t) > Math.max(5, step * 5)) gaps.push(role + ' silent from ' + s[i - 1].t + ' to ' + s[i].t);
  }
}
check('The monitor reported all along', gaps.length || monitorErrors.length ? 'fail' : 'pass',
  gaps.concat(monitorErrors).slice(0, 10).join('; ') || (webSamples.length + ' web and ' + workerSamples.length + ' worker samples over ' + minutes + ' minutes'));

// restarts
const restarted = Object.entries(restarts).filter(([, n]) => n != '0');
check('No web or worker restarts', restarted.length ? 'fail' : 'pass',
  restarted.length ? restarted.map(([r, n]) => r + ' restarted ' + n + ' times').join(', ') : 'none');

// unhandled rejections
check('No unhandled promise rejections', rejections.length ? 'fail' : 'pass',
  rejections.length ? rejections.length + ', first: ' + rejections[0].lines.join(' | ').slice(0, 400) : 'none');

// failed jobs
const failedForGood = {};
const failedAttempts = {};
const failedReasons = {};
for (const s of workerSamples) {
  for (const [queue, counts] of Object.entries(s.queues || {})) {
    if (counts.failed) failedForGood[queue] = Math.max(failedForGood[queue] || 0, counts.failed);
  }
  for (const [queue, n] of Object.entries(s.failedAttempts || {})) failedAttempts[queue] = (failedAttempts[queue] || 0) + n;
  for (const r of s.failedReasons || []) {
    const key = r.queue + ': ' + normalise(r.error);
    failedReasons[key] = (failedReasons[key] || 0) + 1;
  }
}
const failedTotal = Object.values(failedForGood).reduce((a, b) => a + b, 0);
check('No job failed for good', failedTotal ? 'fail' : 'pass',
  failedTotal ? Object.entries(failedForGood).map(([q, n]) => q + ' ' + n).join(', ') : 'none');
const jobKinds = Object.keys(jobExceptions);
const jobKindsOld = (baselineFile() || {}).jobExceptions || {};
const jobKindsNew = jobKinds.filter((k) => !jobKindsOld[k]);
check('No job threw (caught and logged by bindEnvironment)', jobKindsNew.length ? 'fail' : jobKinds.length ? 'warn' : 'pass',
  jobKinds.length ? jobKinds.slice(0, 3).map((k) => jobExceptions[k] + '× ' + k).join('; ') + (jobKindsNew.length < jobKinds.length ? ' (' + (jobKinds.length - jobKindsNew.length) + ' kind(s) also in the baseline)' : '') : 'none');
const attemptsTotal = Object.values(failedAttempts).reduce((a, b) => a + b, 0);
check('No failed job attempts (retried or not)', attemptsTotal ? 'warn' : 'pass',
  attemptsTotal ? Object.entries(failedAttempts).map(([q, n]) => q + ' ' + n).join(', ') : 'none');

// invariants: a problem counts once it is there in three samples in a row
const persistent = {};
const streaks = {};
workerSamples.forEach((s, index) => {
  const now = {};
  for (const game of s.games || []) {
    for (const p of game.problems || []) {
      const key = game.name + ': ' + p;
      now[key] = true;
      streaks[key] = (streaks[key] || 0) + 1;
      if (streaks[key] >= 3 && !persistent[key]) persistent[key] = {first: s.t, fromStart: index < 3, known: KNOWN_PROBLEMS.some((k) => k.test(p))};
    }
  }
  for (const key of Object.keys(streaks)) if (!now[key]) streaks[key] = 0;
});
const broken = Object.entries(persistent).filter(([, v]) => !v.known && !(mode == 'replay' && v.fromStart));
const known = Object.entries(persistent).filter(([, v]) => v.known);
const inherited = Object.entries(persistent).filter(([, v]) => !v.known && mode == 'replay' && v.fromStart);
check('The invariants hold', broken.length ? 'fail' : 'pass',
  broken.length ? broken.length + ' broken, first: ' + broken.slice(0, 3).map(([k]) => k).join('; ') :
    'none broken' + (known.length ? ', ' + known.length + ' known bug(s)' : '') + (inherited.length ? ', ' + inherited.length + ' already in the dump' : ''));

// memory: the last tenth of the run against the stretch after the warm-up
const memoryTrend = {};
for (const role of ['web', 'worker']) {
  const s = samples[role];
  if (s.length < 10) continue;
  const warm = Math.max(1, Math.floor(s.length * 0.1));
  const early = s.slice(warm, warm * 2 + 1);
  const late = s.slice(-warm);
  const trend = {
    heapEarlyMb: mb(median(early.map((x) => x.heapUsed))),
    heapLateMb: mb(median(late.map((x) => x.heapUsed))),
    rssEarlyMb: mb(median(early.map((x) => x.rss))),
    rssLateMb: mb(median(late.map((x) => x.rss))),
    rssMaxMb: mb(Math.max(...s.map((x) => x.rss))),
    loopDelayP99MaxMs: Math.max(...s.map((x) => x.loopDelayMs.p99)),
    loopDelayMaxMs: Math.max(...s.map((x) => x.loopDelayMs.max)),
    sessionsMax: Math.max(...s.map((x) => x.sessions || 0))
  };
  trend.heapGrowth = trend.heapLateMb / Math.max(1, trend.heapEarlyMb);
  memoryTrend[role] = trend;
}
// growth only fails a run this long (MEMORY_MIN_MINUTES, 120): a short one is mostly warm-up
const memoryMinutes = Number(process.env.MEMORY_MIN_MINUTES || 120);
const long = minutes >= memoryMinutes;
const grew = Object.entries(memoryTrend).filter(([, t]) => t.heapGrowth > 1.5 && t.heapLateMb - t.heapEarlyMb > 50);
const growing = Object.entries(memoryTrend).filter(([, t]) => t.heapGrowth > 1.2 && t.heapLateMb - t.heapEarlyMb > 20);
check('Memory is stable', !Object.keys(memoryTrend).length ? 'warn' : grew.length ? (long ? 'fail' : 'warn') : growing.length ? 'warn' : 'pass',
  Object.entries(memoryTrend).map(([r, t]) => r + ' heap ' + t.heapEarlyMb + ' → ' + t.heapLateMb + ' MB, rss ' + t.rssEarlyMb + ' → ' + t.rssLateMb + ' MB').join('; ') +
    (long ? '' : ' (under ' + memoryMinutes + ' minutes: growth only warns)'));
const slow = Object.entries(memoryTrend).filter(([, t]) => t.loopDelayP99MaxMs > 1000);
check('The event loop keeps up', slow.length ? 'warn' : 'pass',
  Object.entries(memoryTrend).map(([r, t]) => r + ' worst p99 ' + t.loopDelayP99MaxMs + ' ms, worst ' + t.loopDelayMaxMs + ' ms').join('; '));

// the bots
let calls = 0;
let okCalls = 0;
if (mode == 'soak') {
  if (!bots) {
    check('The bots finished', 'fail', 'no bots.json');
  } else {
    for (const m of Object.values(bots.methods)) {
      okCalls += m.ok;
      calls += m.ok + Object.values(m.refused).reduce((a, b) => a + b, 0);
    }
    check('No internal server errors or unanswered calls', bots.serverErrorCount ? 'fail' : 'pass',
      bots.serverErrorCount ? bots.serverErrorCount + ', first: ' + bots.serverErrors.slice(0, 3).map((e) => e.method + ' ' + e.error + ' ' + e.reason).join('; ') : 'none in ' + calls + ' calls');
    const started = bots.games.filter((g) => g.startedAt).length;
    const battles = Math.max(0, ...workerSamples.map((s) => Math.max(0, ...(s.games || []).map((g) => g.battlesOver))));
    check('The game was played', started && okCalls >= 100 ? 'pass' : 'fail',
      started + ' game(s) started, ' + okCalls + ' calls went through, ' + battles + ' battles fought in the busiest game');
    if (bots.adminError) check('The admin bot kept going', 'fail', bots.adminError);
  }
}

// exceptions, against the baseline when there is one
const baseline = baselineFile();
if (baseline && baseline.unreadable) check('Baseline read', 'fail', baseline.unreadable);
const kinds = Object.keys(exceptions);
if (baseline) {
  const fresh = kinds.filter((k) => !(baseline.exceptions || {})[k]);
  check('No new kinds of logged exceptions (against the baseline)', fresh.length ? 'fail' : 'pass',
    fresh.length ? fresh.slice(0, 5).join('; ') : kinds.length + ' kinds, all also in the baseline');
} else {
  check('No logged exceptions', kinds.length ? 'warn' : 'pass', kinds.length ? kinds.length + ' kinds, see below' : 'none');
}

const failed = checks.some((c) => c.status == 'fail');

// --- what the game did ---

const gamesSeen = {};
for (const s of workerSamples) {
  for (const g of s.games || []) {
    const seen = gamesSeen[g.name] || (gamesSeen[g.name] = {first: s.t, max: {}});
    seen.last = s.t;
    seen.latest = g;
    for (const f of ['players', 'castles', 'villages', 'armies', 'moves', 'battles', 'battlesOver']) seen.max[f] = Math.max(seen.max[f] || 0, g[f] || 0);
  }
}

// --- the report ---

const mark = {pass: 'pass', warn: 'warn', fail: '**FAIL**'};
const out = [];
out.push('# Soak test report', '');
out.push((failed ? '**The soak failed.**' : 'The soak passed.') + ' ' + (mode == 'replay' ? 'A production-data replay' : 'A bot soak') +
  ' of `' + read('image.txt').trim() + '`, ' + minutes + ' minutes of samples' + (first ? ', from ' + first.t + ' to ' + last.t : '') + '.', '');
out.push('| Check | Result | Detail |', '|---|---|---|');
for (const c of checks) out.push('| ' + c.name + ' | ' + mark[c.status] + ' | ' + String(c.detail).replace(/\|/g, '\\|').replace(/\n/g, ' ') + ' |');
out.push('');

out.push('## The games', '');
if (!Object.keys(gamesSeen).length) out.push('No running game was seen.', '');
for (const [name, g] of Object.entries(gamesSeen)) {
  const l = g.latest;
  out.push('- **' + name + '**: seen from ' + g.first + ' to ' + g.last + '. At the end: ' + l.players + ' players, ' + l.kings + ' kings, ' +
    l.castles + ' castles, ' + l.villages + ' villages, ' + l.armies + ' armies, ' + l.battles + ' battles running' +
    (l.dominusAchieved ? ', dominus achieved' : '') + (l.hasEnded ? ', ended' : '') + '. Most at once: ' + g.max.armies + ' armies, ' +
    g.max.moves + ' moves, ' + g.max.battles + ' battles; ' + g.max.battlesOver + ' battles over.');
}
if (bots) {
  out.push('');
  for (const g of bots.games) {
    out.push('- ' + g.name + ': made ' + g.createdAt + (g.startedAt ? ', started ' + g.startedAt : '') + (g.dominusAt ? ', dominus ' + g.dominusAt : '') +
      (g.endedAt ? ', ended ' + g.endedAt + (g.winner ? ', won by ' + g.winner : '') : ''));
  }
}
out.push('');

if (bots) {
  out.push('## The bots\' calls', '');
  out.push(calls + ' method calls, ' + okCalls + ' went through. ' + bots.subscriptions.ok + ' subscriptions became ready. ' +
    bots.reconnects + ' times a bot closed the game and came back; ' + bots.connectFailures + ' failed connection attempts.', '');
  out.push('| Method | Went through | Refused by the game (reason: times) |', '|---|---|---|');
  for (const [name, m] of Object.entries(bots.methods).sort()) {
    const refused = Object.entries(m.refused).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([r, n]) => r + ': ' + n).join('; ');
    out.push('| ' + name + ' | ' + m.ok + ' | ' + refused.replace(/\|/g, '\\|') + ' |');
  }
  const subRefused = Object.entries(bots.subscriptions.refused);
  if (subRefused.length) out.push('', 'Subscriptions refused: ' + subRefused.map(([r, n]) => r + ' (' + n + ')').join('; ') + '.');
  if (bots.serverErrors.length) {
    out.push('', '### Internal server errors and unanswered calls', '');
    for (const e of bots.serverErrors.slice(0, 30)) out.push('- ' + e.t + ' `' + e.method + '` ' + e.error + ': ' + e.reason + ' — args `' + JSON.stringify(e.params).slice(0, 200) + '`');
  }
  out.push('');
}

if (broken.length || known.length || inherited.length) {
  out.push('## Invariants', '');
  for (const [k, v] of broken) out.push('- **broken** from ' + v.first + ': ' + k);
  for (const [k, v] of inherited) out.push('- already in the dump: ' + k);
  for (const [k, v] of known) out.push('- known bug, from ' + v.first + ': ' + k);
  out.push('');
}

if (attemptsTotal) {
  out.push('## Failed job attempts', '');
  for (const [k, n] of Object.entries(failedReasons).sort((a, b) => b[1] - a[1]).slice(0, 20)) out.push('- ' + n + '× ' + k);
  out.push('');
}

if (kinds.length) {
  out.push('## Logged exceptions', '', 'Grouped by their first line, with ids and numbers taken out.', '');
  for (const k of kinds.sort((a, b) => exceptions[b] - exceptions[a]).slice(0, 40)) {
    const isNew = baseline && !(baseline.exceptions || {})[k];
    out.push('- ' + exceptions[k] + '× `' + k.replace(/`/g, "'") + '`' + (isNew ? ' **(new)**' : ''));
  }
  out.push('');
}

if (rejections.length) {
  out.push('## Unhandled rejections', '');
  for (const r of rejections.slice(0, 10)) out.push('```', r.role + ': ' + r.lines.join('\n'), '```');
  out.push('');
}

out.push('## Memory', '');
out.push('From the processes themselves (heap and rss, in MB, the stretch after the first tenth of the run against the last tenth):', '');
out.push('| Process | Heap | RSS | RSS max | Event loop p99, worst | DDP sessions, most |', '|---|---|---|---|---|---|');
for (const [r, t] of Object.entries(memoryTrend)) {
  out.push('| ' + r + ' | ' + t.heapEarlyMb + ' → ' + t.heapLateMb + ' | ' + t.rssEarlyMb + ' → ' + t.rssLateMb + ' | ' + t.rssMaxMb + ' | ' + t.loopDelayP99MaxMs + ' ms | ' + t.sessionsMax + ' |');
}
const containers = Object.entries(dockerMemory);
if (containers.length) {
  out.push('', 'From docker (MB, first sample → last, and the most):', '');
  for (const [name, s] of containers) {
    out.push('- ' + name + ': ' + Math.round(s[0].mb) + ' → ' + Math.round(s[s.length - 1].mb) + ', most ' + Math.round(Math.max(...s.map((x) => x.mb))));
  }
}
out.push('');

fs.writeFileSync(path.join(dir, 'report.md'), out.join('\n'));
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({
  mode, image: read('image.txt').trim(), failed, minutes, checks, exceptions, jobExceptions, failedForGood, failedAttempts,
  persistentProblems: persistent, memoryTrend,
  bots: bots && {calls, okCalls, serverErrorCount: bots.serverErrorCount, games: bots.games}
}, null, 2));
console.log(out.slice(0, checks.length + 6).join('\n'));
process.exit(failed ? 1 : 0);
