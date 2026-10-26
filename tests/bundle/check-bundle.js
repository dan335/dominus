// Looks in a production build's client bundles for an assignment to an
// undeclared name in strict code (implicitGlobals.js), which throws in the
// browser. The development bundle isn't minified, so the e2e tests can't see
// this; see README.md.
//
//   node tests/bundle/check-bundle.js <build>
//
// <build> is the folder `meteor build --directory` made (it holds bundle/), a
// bundle/ folder, or the .tar.gz `meteor build` made. Exit 1 on a finding.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { implicitGlobals } = require('./implicitGlobals');

function programsDir(build) {
  if (fs.statSync(build).isFile()) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dominus-bundle-'));
    execFileSync('tar', ['-xzf', build, '-C', dir, 'bundle/programs']);
    build = dir;
  }
  for (const p of [path.join(build, 'bundle', 'programs'), path.join(build, 'programs')]) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('no programs/ folder in ' + build);
}

function main() {
  const build = process.argv[2];
  if (!build) {
    console.error('usage: node check-bundle.js <meteor build output>');
    process.exit(2);
  }
  const programs = programsDir(build);
  const arches = fs.readdirSync(programs).filter((a) => a.startsWith('web.'));
  if (!arches.length) throw new Error('no client programs in ' + programs);

  let strict = 0;
  for (const arch of arches) {
    const files = fs.readdirSync(path.join(programs, arch)).filter((f) => f.endsWith('.js'));
    for (const f of files) {
      const file = path.join(programs, arch, f);
      const source = fs.readFileSync(file, 'utf8');
      const found = implicitGlobals(source);
      const bad = found.filter((x) => x.strict);
      console.log(`${arch}/${f}: ${found.length} implicit globals, ${bad.length} in strict code`);
      for (const x of bad) {
        strict++;
        console.log(`  STRICT ${x.name}: ${JSON.stringify(source.slice(Math.max(0, x.start - 80), x.start + 60))}`);
      }
    }
  }
  if (strict) {
    console.log(`\n${strict} assignment(s) to an undeclared name in strict code: each throws in the browser. Declare the name with var in the library it comes from.`);
    process.exit(1);
  }
  console.log('\nOK: no assignment to an undeclared name in strict code.');
}

main();
