const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export class GmailApi {
  constructor(getToken) { this.getToken = getToken; }
  async request(path, method = 'GET', body = undefined) {
    const token = this.getToken();
    if (!token) throw new Error('Googleアカウントに接続してください。');
    let response;
    try {
      response = await fetch(BASE + path, {
        method,
        headers: {'Authorization': `Bearer ${token}`, ...(body ? {'Content-Type':'application/json'} : {})},
        ...(body ? {body:JSON.stringify(body)} : {}),
        cache: 'no-store'
      });
    } catch { throw new Error('ネットワーク接続を確認してください。'); }
    if (response.status === 401) throw new Error('認証の期限が切れました。もう一度接続してください。');
    if (!response.ok) {
      let info;
      try { info = (await response.json())?.error?.message; } catch { /* empty */ }
      throw new Error(`Gmail API (${response.status}): ${info || response.statusText}`);
    }
    if (response.status === 204) return null;
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  }
  listFilters() { return this.request('/settings/filters'); }
  createFilter(body) { return this.request('/settings/filters', 'POST', body); }
  deleteFilter(id) { return this.request(`/settings/filters/${encodeURIComponent(id)}`, 'DELETE'); }
  listLabels() { return this.request('/labels'); }
  createLabel(name) {
    return this.request('/labels', 'POST', {name, labelListVisibility:'labelShow', messageListVisibility:'show'});
  }
}