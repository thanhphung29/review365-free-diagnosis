// The Apify key lives only on the server (APIFY_TOKEN in .env.local) and is never sent to the browser.
export function apifyToken(): string | null {
  return process.env.APIFY_TOKEN?.trim() || null;
}

export const MISSING_TOKEN = 'Server chưa cấu hình Apify — đặt APIFY_TOKEN trong .env.local rồi khởi động lại server';
