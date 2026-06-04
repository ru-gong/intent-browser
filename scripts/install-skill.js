#!/usr/bin/env node

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const SKILL_NAME = 'intent-browser';

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(buildHelp());
    return;
  }

  const plan = resolveInstallPlan(options);
  if (options.dryRun) {
    printResult({ ok: true, dryRun: true, ...plan }, options);
    return;
  }

  await installSkill(plan);
  printResult({ ok: true, dryRun: false, ...plan }, options);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--target') {
      options.target = readValue();
    } else if (arg === '--dest') {
      options.dest = readValue();
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (options.target && options.dest) {
    throw new Error('Use either --target or --dest, not both.');
  }
  return options;
}

function resolveInstallPlan(options = {}, context = {}) {
  const repoRoot = context.repoRoot || path.resolve(__dirname, '..');
  const source = path.join(repoRoot, 'skills', SKILL_NAME);
  const targetRoot = path.resolve(expandHome(options.target || defaultSkillsRoot(context.env || process.env, context.homeDir)));
  const destination = path.resolve(expandHome(options.dest || path.join(targetRoot, SKILL_NAME)));
  return {
    skillName: SKILL_NAME,
    source,
    targetRoot: options.dest ? path.dirname(destination) : targetRoot,
    destination
  };
}

function defaultSkillsRoot(env = process.env, homeDir = os.homedir()) {
  if (env.CODEX_HOME) {
    return path.join(env.CODEX_HOME, 'skills');
  }
  return path.join(homeDir, '.codex', 'skills');
}

function expandHome(value) {
  if (!value || value === '~') {
    return os.homedir();
  }
  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

async function installSkill(plan) {
  await assertSkillSource(plan.source);
  if (path.resolve(plan.source) === path.resolve(plan.destination)) {
    throw new Error('Source and destination are the same directory.');
  }
  await fs.mkdir(path.dirname(plan.destination), { recursive: true });
  await fs.rm(plan.destination, { recursive: true, force: true });
  await fs.cp(plan.source, plan.destination, { recursive: true });
}

async function assertSkillSource(source) {
  const skillFile = path.join(source, 'SKILL.md');
  const metadataFile = path.join(source, 'agents', 'openai.yaml');
  await fs.access(skillFile);
  await fs.access(metadataFile);
}

function printResult(result, options = {}) {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Installed ${result.skillName} skill`);
  console.log(`Source: ${result.source}`);
  console.log(`Destination: ${result.destination}`);
  if (result.dryRun) {
    console.log('Dry run only; no files were copied.');
  } else {
    console.log('Restart or reload your agent so it can discover $intent-browser.');
  }
}

function buildHelp() {
  return `Install the bundled Intent Browser skill into an agent skill directory.

Usage:
  node scripts/install-skill.js [--target <skills-root>]
  node scripts/install-skill.js --dest <skill-destination>

Options:
  --target <dir>   Skills root. Installs to <dir>/intent-browser.
  --dest <dir>     Exact skill destination directory.
  --dry-run        Print the planned copy without writing files.
  --json           Print machine-readable install result.
  --help           Show this help.

Defaults:
  Uses $CODEX_HOME/skills when CODEX_HOME is set.
  Otherwise uses ~/.codex/skills.
`;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  SKILL_NAME,
  buildHelp,
  defaultSkillsRoot,
  installSkill,
  parseArgs,
  resolveInstallPlan
};
