const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const suspension = fs.readFileSync(path.join(root, 'gas', '80_MpgSuspension.gs'), 'utf8');
const token = fs.readFileSync(path.join(root, 'gas', '81_MpgSuspensionToken.gs'), 'utf8');
const withdrawal = fs.readFileSync(path.join(root, 'gas', '83_MpgWithdrawal.gs'), 'utf8');

test('member master outstanding-balance checkbox is read', () => {
  assert.match(suspension, /index\["未払金"\]/);
  assert.match(suspension, /hasOutstandingBalance/);
});

test('the existing gender eligibility implementation remains untouched', () => {
  const genderPolicy = fs.readFileSync(path.join(root, 'gas', '59_YoshimaruGender.gs'), 'utf8');
  assert.match(genderPolicy, /MASTER_FEMALE:\s*"F"/);
  assert.match(genderPolicy, /member\.gender/);
});

test('suspension is blocked during verification and token resolution', () => {
  assert.match(suspension, /code:\s*"OUTSTANDING_BALANCE"/);
  assert.match(token, /balanceError\.code\s*=\s*"OUTSTANDING_BALANCE"/);
});

test('withdrawal is blocked during verification and final submission', () => {
  const occurrences = withdrawal.match(/hasMpgOutstandingBalance_\(member\)/g) || [];
  assert.equal(occurrences.length, 2);
  assert.match(withdrawal, /MPG_OUTSTANDING_BALANCE_MESSAGE/);
});

test('the requested message is returned unchanged', () => {
  assert.match(suspension, /未払金の会費があるため申請できません。/);
});
