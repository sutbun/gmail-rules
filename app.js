import {VERSION, emptyDraft, toList, buildFilter, parseFilter, summarizeFilter} from './rules.js';
import {GmailApi} from './gmail.js';

const $ = id => document.getElementById(id);
const ids = {senders:'senders',subjects:'subjects',words:'words',excludeSubjects:'exclude-subjects',excludeWords:'exclude-words',labelId:'label-id'};
const SCOPE = 'https://www.googleapis.com/auth/gmail.settings.basic https://www.googleapis.com/auth/gmail.labels';
const ID_STORAGE = 'gmail-rules-client-id';
let accessToken = '';
let oauthClient;
let editingId = '';
let labels = [];
let filters = [];
let busy = false;
const api = new GmailApi(() => accessToken);

$('version').textContent = VERSION;
$('client-id').value = localStorage.getItem(ID_STORAGE) || '';

function showNotice(message, type = '') {
  const el = $('notice');
  el.textContent = message;
  el.className = `notice ${type}`;
  el.hidden = false;
  el.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function clearNotice() { $('notice').hidden = true; }
function setBusy(value) {
  busy = value;
  for (const id of ['connect','disconnect','save-rule','create-label','refresh']) $(id).disabled = value;
}
function getDraft() {
  const draft = emptyDraft();
  Object.entries(ids).forEach(([key, id]) => { draft[key] = $(id).value; });
  draft.action = document.querySelector('input[name="action"]:checked')?.value || 'archive';
  draft.markRead = $('mark-read').checked;
  return draft;
}
function applyDraft(draft) {
  Object.entries(ids).forEach(([key,id]) => {$(id).value = draft[key] || '';});
  const radio = document.querySelector(`input[name="action"][value="${draft.action}"]`);
  (radio || document.querySelector('input[name="action"][value="archive"]')).checked = true;
  $('mark-read').checked = Boolean(draft.markRead);
  updatePreview();
}
function updatePreview() {
  const draft = getDraft();
  try {
    const filter = buildFilter(draft);
    const dest = draft.action === 'archive' ? 'アーカイブ（受信トレイから除外）' : draft.action === 'trash' ? 'ゴミ箱に移動' : 'ラベル付け';
    $('preview').textContent = `Gmail検索条件: ${filter.criteria.query}${filter.criteria.negatedQuery ? ` ／ 除外: ${filter.criteria.negatedQuery}` : ''}\n処理: ${dest}${draft.markRead?' ＋ 既読':''}`;
  } catch {
    $('preview').textContent = '送信元・件名・メール全体のいずれかを入力すると、ルールの条件を確認できます。';
  }
}

function showTab(tab) {
  const editing = tab === 'create';
  $('editor-panel').hidden = !editing;
  $('list-panel').hidden = editing;
  $('tab-create').classList.toggle('active',editing);
  $('tab-list').classList.toggle('active',!editing);
  $('tab-create').setAttribute('aria-current',editing ? 'page' : 'false');
  $('tab-list').setAttribute('aria-current',!editing ? 'page' : 'false');
}
function resetEditor() {
  editingId = '';
  $('editor-title').textContent = '新しい振り分け';
  $('save-rule').textContent = 'Gmailにルールを登録';
  $('cancel-edit').hidden = true;
  $('rule-form').reset();
  applyDraft(emptyDraft());
}

function selectOptions() {
  const select = $('label-id');
  const current = select.value;
  select.replaceChildren();
  select.add(new Option('ラベルなし',''));
  labels.filter(l => l.type === 'user').sort((a,b)=>a.name.localeCompare(b.name,'ja')).forEach(l => select.add(new Option(l.name,l.id)));
  if ([...select.options].some(o => o.value === current)) select.value = current;
}
function createButton(label, cssClass, callback) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button ${cssClass}`;
  button.textContent = label;
  button.addEventListener('click', callback);
  return button;
}

function renderFilters() {
  const list = $('rule-list');
  list.replaceChildren();
  $('rule-count').textContent = `(${filters.length})`;
  if (!filters.length) {
    const el = document.createElement('p'); el.className = 'empty';
    el.textContent = 'まだルールはありません。最初のルールを登録しましょう。';
    list.append(el); return;
  }
  for (const filter of filters) {
    const wrapper = document.createElement('article'); wrapper.className = 'rule-card';
    const heading = document.createElement('h3');
    heading.textContent = summarizeFilter(filter,labels);
    wrapper.append(heading);
    const match = parseFilter(filter);
    const meta = document.createElement('p'); meta.className = 'meta';
    meta.textContent = match ? 'このアプリで編集できる形式' : 'Gmailの既存フィルタ（削除可能・編集はGmailで）';
    wrapper.append(meta);
    const actionRow = document.createElement('div'); actionRow.className = 'rule-actions';
    if (match) {
      actionRow.append(createButton('編集','outline',()=>{
        editingId = filter.id;
        applyDraft(match);
        $('editor-title').textContent = 'ルールを編集';
        $('save-rule').textContent = '変更を保存';
        $('cancel-edit').hidden = false;
        showTab('create');
        window.scrollTo({top:0,behavior:'smooth'});
      }));
    }
    actionRow.append(createButton('削除','danger',()=>deleteExistingFilter(filter)));
    wrapper.append(actionRow);
    list.append(wrapper);
  }
}
async function loadState() {
  const [labelData, filterData] = await Promise.all([api.listLabels(),api.listFilters()]);
  labels = labelData?.labels || [];
  filters = filterData?.filter || [];
  selectOptions();
  renderFilters();
}
async function connect() {
  if (busy) return;
  const clientId = $('client-id').value.trim();
  if (!/^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    showNotice('有効なGoogle OAuthクライアントIDを入力してください。','error');return;
  }
  if (!window.google?.accounts?.oauth2) {
    showNotice('Google認証画面を読み込めませんでした。通信環境を確認し、Safariで開いて試してください。','error');return;
  }
  localStorage.setItem(ID_STORAGE,clientId);
  clearNotice();
  oauthClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId, scope:SCOPE,
    callback:async response => {
      if (response.error || !response.access_token) {
        showNotice(`Google認証に失敗しました: ${response.error || '応答が不正です'}`,'error'); return;
      }
      accessToken = response.access_token;
      setBusy(true);
      try {
        await loadState();
        $('workspace').hidden = false;
        $('initial-setup').hidden = true;
        $('connect').hidden = false;
        $('connect').textContent = 'Googleに再接続';
        $('disconnect').hidden = false;
        $('connection-status').textContent = '接続済み（この画面を開いている間だけ）';
        showTab('create');
        showNotice('Gmailに接続しました。登録したルールはGmail側に保存されます。','success');
      } catch(e) {
        accessToken = '';
        showNotice(e.message,'error');
      } finally {setBusy(false);}
    },
    error_callback: error => showNotice(`Google認証を開けませんでした: ${error.type || '不明なエラー'}。iPhoneではSafari本体から開いてお試しください。`,'error')
  });
  // Must be directly user initiated for browsers that block popups.
  oauthClient.requestAccessToken({prompt:'consent'});
}
function disconnect() {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken,()=>{});
  }
  accessToken = '';
  oauthClient = undefined;
  filters = []; labels = [];
  $('workspace').hidden = true;
  $('initial-setup').hidden = false;
  $('connect').hidden = false;
  $('connect').textContent = 'Googleアカウントに接続';
  $('disconnect').hidden = true;
  $('connection-status').textContent = '未接続';
  resetEditor();
  showNotice('接続を解除しました。Gmailに登録済みのフィルタはそのまま残ります。','success');
}

async function saveRule(event) {
  event.preventDefault();
  if (busy) return;
  let filter;
  try { filter = buildFilter(getDraft()); }
  catch(e) {showNotice(e.message,'error');return;}
  if (getDraft().action === 'trash' && !window.confirm('一致する新着メールはゴミ箱へ移動します。重要なお知らせが含まれないことを確認しましたか？')) return;
  setBusy(true); clearNotice();
  try {
    const created = await api.createFilter(filter);
    const previous = editingId;
    if (previous) {
      try { await api.deleteFilter(previous); }
      catch(e) {
        await loadState();
        showTab('list');
        showNotice(`新しいルール(${created.id})は作成されましたが、古いルールの削除に失敗しました。両方のルールが残っています。古いルールを一覧から削除してください。詳細: ${e.message}`,'error');
        return;
      }
    }
    resetEditor();
    await loadState();
    showTab('list');
    showNotice(previous ? 'Gmailのルールを更新しました。' : 'Gmailに新しいルールを登録しました。','success');
  } catch(e) {showNotice(e.message,'error');}
  finally {setBusy(false);}
}
async function deleteExistingFilter(filter) {
  if (busy) return;
  if (!window.confirm('このフィルタをGmailから削除しますか？ 過去に整理済みのメールは元に戻りません。')) return;
  setBusy(true);
  try {
    await api.deleteFilter(filter.id);
    await loadState();
    showNotice('Gmailからフィルタを削除しました。','success');
  } catch(e) {showNotice(e.message,'error');}
  finally {setBusy(false);}
}
async function createNewLabel() {
  if (busy) return;
  const name = $('new-label').value.trim();
  if (!name || name.length > 100) {showNotice('新しいラベル名は1～100文字で入力してください。','error');return;}
  const existing = labels.find(l=>l.name === name);
  if (existing) {$('label-id').value=existing.id; showNotice('既存のラベルを選択しました。');return;}
  setBusy(true);
  try {
    const created = await api.createLabel(name);
    labels.push(created);
    selectOptions();
    $('label-id').value=created.id;
    $('new-label').value='';
    showNotice('Gmailにラベルを作成して選択しました。','success');
  } catch(e) {showNotice(e.message,'error');}
  finally {setBusy(false);}
}

$('connect').addEventListener('click',connect);
$('disconnect').addEventListener('click',disconnect);
$('rule-form').addEventListener('submit',saveRule);
$('create-label').addEventListener('click',createNewLabel);
$('cancel-edit').addEventListener('click',resetEditor);
$('tab-create').addEventListener('click',()=>showTab('create'));
$('tab-list').addEventListener('click',()=>showTab('list'));
$('refresh').addEventListener('click',async()=>{
  if(busy)return;
  setBusy(true);
  try {await loadState();showNotice('Gmailのルール一覧を更新しました。','success');}
  catch(e) {showNotice(e.message,'error');}
  finally {setBusy(false);}
});
$('rule-form').addEventListener('input',updatePreview);
updatePreview();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});