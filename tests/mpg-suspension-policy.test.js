const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const backend = fs.readFileSync(path.join(root, 'gas', '80_MpgSuspension.gs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'gas', '99_Main.gs'), 'utf8');
const page = fs.readFileSync(path.join(root, 'mpg-suspension', 'index.html'), 'utf8');

test('MPG suspension routes are registered', () => {
  assert.match(main, /case "verifyMpgSuspensionMember"/);
  assert.match(main, /case "submitMpgSuspension"/);
});

test('MPG suspension policy matches agreed rules', () => {
  assert.match(backend, /DEADLINE_DAY:\s*9/);
  assert.match(backend, /DEADLINE_HOUR:\s*20/);
  assert.match(backend, /MIN_MONTHS:\s*1/);
  assert.match(backend, /MAX_MONTHS:\s*6/);
  assert.match(backend, /SUSPENSION_FEE_MONTHLY:\s*550/);
});

test('member verification uses six digits and email', () => {
  assert.match(backend, /\^\\d\{6\}\$/);
  assert.match(backend, /メールアドレス/);
  assert.match(page, /maxlength="6"/);
  assert.match(page, /登録メールアドレス/);
});

test('admin notifications include both recipients', () => {
  assert.match(backend, /9round\.ariosoga@gmail\.com/);
  assert.match(backend, /info@theforestgym\.com/);
});
