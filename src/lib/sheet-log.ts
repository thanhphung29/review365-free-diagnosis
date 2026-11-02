// Server-only: appends one row per finished diagnosis to a Google Sheet with the Sheets API,
// signed in as a service account. Off until the sheet id and the account are set in the env.

import { JWT } from 'google-auth-library';

export interface ReportLogRow {
  searchLink: string;
  reportUrl: string;
  createdAt: Date;
}

const env = (name: string) => process.env[name]?.trim() ?? '';

export const sheetLogEnabled = () =>
  !!(env('GOOGLE_SHEET_ID') && env('GOOGLE_SERVICE_ACCOUNT_EMAIL') && env('GOOGLE_PRIVATE_KEY'));

let client: JWT | null = null;
/** One client per server instance; it caches and refreshes its access token itself. */
function sheetsClient() {
  client ??= new JWT({
    email: env('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    // Env files keep the key on one line, with its line breaks written as \n.
    key: env('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return client;
}

/** "2026-11-02 14:05:09" in Vietnam time, which Sheets reads as a date-time (USER_ENTERED). */
const vnTime = (d: Date) => d.toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

const sheetUrl = () => `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env('GOOGLE_SHEET_ID'))}`;

let tabTitle: Promise<string> | null = null;
/**
 * The tab rows go to: the one whose sheet id is GOOGLE_SHEET_GID (#gid=… in its URL, unchanged by a rename),
 * else the tab named GOOGLE_SHEET_NAME. The gid is looked up once per server instance.
 */
function tab(): Promise<string> {
  const gid = env('GOOGLE_SHEET_GID');
  if (!gid) return Promise.resolve(env('GOOGLE_SHEET_NAME') || 'Sheet1');
  tabTitle ??= sheetsClient()
    .request<{ sheets?: { properties: { sheetId: number; title: string } }[] }>({ url: sheetUrl(), params: { fields: 'sheets.properties(sheetId,title)' }, timeout: 15_000 })
    .then(({ data }) => {
      const title = data.sheets?.find((t) => String(t.properties.sheetId) === gid)?.properties.title;
      if (!title) throw new Error(`No tab with gid ${gid} in the spreadsheet`);
      return title;
    })
    .catch((err) => { tabTitle = null; throw err; });
  return tabTitle;
}

/**
 * Appends the row after the last filled row of the tab, columns A–D: STT, input search, report URL, date created.
 * STT is a formula (row number less the header row), so it stays right without reading the sheet first.
 */
export async function appendReportLog(row: ReportLogRow): Promise<void> {
  const range = `'${(await tab()).replace(/'/g, "''")}'!A:D`;
  await sheetsClient().request({
    url: `${sheetUrl()}/values/${encodeURIComponent(range)}:append`,
    method: 'POST',
    params: { valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' },
    data: { values: [['=ROW()-1', row.searchLink, row.reportUrl, vnTime(row.createdAt)]] },
    timeout: 15_000,
  });
}
