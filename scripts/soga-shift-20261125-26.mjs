const expectedScriptId = '1ut7-MxLbw1mmyGFZkIRnJZz0RhXZUAhVxyIyLRwLT8LhVdr-YJbtaEjG';
const dates = new Set(['2026-11-25', '2026-11-26']);
function stop(message) {
  console.error('::error title=9ROUND connection diagnosis::' + message);
  process.exit(1);
}
const config = JSON.parse(process.env.CLASP_JSON || '{}');
const claspAuth = JSON.parse(process.env.CLASPRC_JSON || '{}');
if (config.scriptId !== expectedScriptId) stop('Expected existing A-nauts project does not match; no changes made');
const credential = claspAuth.tokens?.default || claspAuth;
if (!credential.refresh_token || !credential.client_id || !credential.client_secret) stop('Existing owner credential is unavailable; no changes made');
const refresh = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: credential.refresh_token, client_id: credential.client_id, client_secret: credential.client_secret}),
  signal: AbortSignal.timeout(30000)
});
const refreshed = await refresh.json();
if (!refresh.ok || !refreshed.access_token) stop('Owner Google login failed: ' + String(refreshed.error || refresh.status));
const accessToken = refreshed.access_token;
async function get(url, label) {
  const response = await fetch(url, {headers: {Authorization: 'Bearer ' + accessToken}, signal: AbortSignal.timeout(45000)});
  const body = await response.json();
  if (!response.ok) stop(label + ': HTTP ' + response.status + '; reason=' + (body.error?.status || body.error?.errors?.[0]?.reason || 'unknown') + '; no changes made');
  return body;
}
const project = await get('https://script.googleapis.com/v1/projects/' + expectedScriptId, 'Existing project metadata');
if (!project.parentId) stop('Existing project has no bound spreadsheet; no changes made');
const metadata = await get('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(project.parentId) + '?fields=properties.timeZone,sheets.properties', 'Shift spreadsheet permission');
const titles = new Set((metadata.sheets || []).map(row => row.properties.title));
for (const name of ['staff', 'staff_shifts', 'soga_shift_assignments']) if (!titles.has(name)) stop('Expected sheet missing: ' + name + '; no changes made');
const names = ['staff', 'staff_shifts', 'soga_shift_assignments', 'staff_shift_publications'].filter(name => titles.has(name));
const valuesUrl = new URL('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(project.parentId) + '/values:batchGet');
for (const name of names) valuesUrl.searchParams.append('ranges', "'" + name + "'!A1:AZ50000");
valuesUrl.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');
const values = await get(valuesUrl.href, 'Requested shift data');
const data = {};
for (let index = 0; index < names.length; index++) {
  const rows = values.valueRanges?.[index]?.values || [];
  const headers = (rows[0] || []).map(String);
  data[names[index]] = rows.slice(1).map((row, rowIndex) => Object.fromEntries([['_row', rowIndex + 2], ...headers.map((key, column) => [key, row[column] ?? ''])]));
}
function dateOf(value) {
  const match = String(value || '').match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  return match ? match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0') : String(value || '');
}
function active(row) { return ['TRUE', '1', 'YES', 'ON'].includes(String(row.active).toUpperCase()); }
const normalize = value => String(value || '').replace(/[\s　]/g, '').toLowerCase();
const people = [
  data.staff.filter(row => active(row) && /kevin/.test(normalize([row.staff_code,row.staff_name,row.display_name].join(' ')))),
  data.staff.filter(row => active(row) && /川上一郎/.test(normalize([row.staff_name,row.display_name].join(' ')))),
  data.staff.filter(row => active(row) && /榊/.test(normalize([row.staff_name,row.display_name].join(' '))))
];
if (people.some(rows => rows.length !== 1)) stop('Requested staff cannot be uniquely resolved; no data exported or changed');
const codes = new Set(people.map(rows => rows[0].staff_code));
const shifts = data.staff_shifts.filter(row => dates.has(dateOf(row.date)) && active(row) && (codes.has(row.staff_code) || row.store_code === 'SOGA'));
if (!shifts.length) stop('Requested shift scope not found; no data exported or changed');
console.log('::notice title=9ROUND safe inspection::Existing owner authentication and requested shift reads succeeded. Read-only inspection; no staff records, IDs, schedules, credentials, or source were logged or exported. No changes made.');
