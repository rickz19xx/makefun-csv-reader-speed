// The harness runs `node /bot/main.ts` (node22). It reads every case from /input/cases.json (a JSON array of
// {id, input}), answers each one alone with solve.js, and writes /output/answers.json: a JSON array of the answers,
// one per case and in the cases' order. Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for
// /input and /output.

import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off, set before solve.js is imported so all of its work runs under it (the rules: the house
// baseline runs with --no-incremental-marking, and an entry may tune V8's flags too).
setFlagsFromString('--no-incremental-marking');

/**
 * solve.js, imported by its URL (a .js module carries no types) and typed by its contract. answer() is run()'s answer
 * as its JSON text (run() is answer() read back), so a case is answered once and written as it stands.
 */
const { answer, warm } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  answer: (input: unknown) => string;
  warm: (bytes: number, reps: number) => number;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as { id: string; input: unknown }[];
// The reader's own paths are exercised once on synthetic text so that no case pays for the first-time JIT work;
// nothing of any case's answer is kept.
warm(32768, 2);

// The answers are written as they are read: '[' + answer ',' answer ... + ']', which is the array of the answers.
const out = join(OUTPUT_DIR, 'answers.json');
const fd = openSync(out, 'w');
writeSync(fd, '[');
for (let i = 0; i < cases.length; i++) {
  if (i > 0) writeSync(fd, ',');
  writeSync(fd, answer(cases[i].input));
}
writeSync(fd, ']');
closeSync(fd);
