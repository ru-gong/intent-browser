const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  defaultSkillsRoot,
  installSkill,
  parseArgs,
  resolveInstallPlan
} = require('../scripts/install-skill');

const root = path.join(__dirname, '..');
const skillDir = path.join(root, 'skills', 'intent-browser');

test('bundled intent-browser skill has trigger metadata and workflow sections', async () => {
  const skill = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: intent-browser\n/m);
  assert.match(skill, /description: .*Quick Edit.*Insert Annotation.*Diff Payload/s);
  assert.match(skill, /## When To Trigger/);
  assert.match(skill, /## What It Can Do/);
  assert.match(skill, /## Source Install For Agents/);
  assert.match(skill, /## How To Work With The User/);
  assert.match(skill, /npm run install:skill/);
  assert.match(skill, /node scripts\/install-skill\.js --target/);
});

test('bundled intent-browser skill includes agent UI metadata and references', async () => {
  const openaiYaml = await fs.readFile(path.join(skillDir, 'agents', 'openai.yaml'), 'utf8');
  const cliReference = await fs.readFile(path.join(skillDir, 'references', 'cli.md'), 'utf8');
  const protocolReference = await fs.readFile(path.join(skillDir, 'references', 'protocol.md'), 'utf8');

  assert.match(openaiYaml, /display_name: "Intent Browser"/);
  assert.match(openaiYaml, /default_prompt: "Use \$intent-browser/);
  assert.match(cliReference, /node bin\/intent-browser\.js read/);
  assert.match(protocolReference, /WebSocket JSON-RPC/);
});

test('install script resolves default and explicit skill destinations', () => {
  assert.equal(
    defaultSkillsRoot({ CODEX_HOME: '/tmp/codex-home' }, '/tmp/home'),
    '/tmp/codex-home/skills'
  );
  assert.equal(defaultSkillsRoot({}, '/tmp/home'), '/tmp/home/.codex/skills');

  const parsed = parseArgs(['--target', '/tmp/agent-skills']);
  const plan = resolveInstallPlan(parsed, { repoRoot: root, homeDir: '/tmp/home', env: {} });
  assert.equal(plan.destination, '/tmp/agent-skills/intent-browser');

  const exact = resolveInstallPlan(parseArgs(['--dest', '/tmp/custom/intent-browser']), {
    repoRoot: root,
    homeDir: '/tmp/home',
    env: {}
  });
  assert.equal(exact.destination, '/tmp/custom/intent-browser');
});

test('install script copies the skill package into a target skills root', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'intent-browser-skill-'));
  const plan = resolveInstallPlan(parseArgs(['--target', tmpRoot]), {
    repoRoot: root,
    homeDir: '/tmp/home',
    env: {}
  });

  await installSkill(plan);

  const installedSkill = await fs.readFile(path.join(plan.destination, 'SKILL.md'), 'utf8');
  const installedYaml = await fs.readFile(path.join(plan.destination, 'agents', 'openai.yaml'), 'utf8');
  assert.match(installedSkill, /name: intent-browser/);
  assert.match(installedYaml, /allow_implicit_invocation: true/);
});
