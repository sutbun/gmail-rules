// Gmail Rules: pure Gmail search/filter mapping. No message content is read here.
export const VERSION = 'DEV-10.09-2';

const invalid = /["{}\\\r\n\x00-\x1f]/;
const emailPattern = /^[A-Z0-9.!#$%&'*+/=?^_`|~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}$/i;
const domainPattern = /^@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}$/i;

export function toList(text) {
  return [...new Set(String(text || '').split(/[\n,、，]+/).map(x => x.trim()).filter(Boolean))];
}

export function emptyDraft() {
  return {
    senders: '', subjects: '', words: '', excludeSubjects: '', excludeWords: '',
    action: 'archive', markRead: false, labelId: ''
  };
}

function assertSafeTerm(text, field) {
  if (invalid.test(text)) throw new Error(`${field}に引用符・波括弧・改行を含めることはできません。`);
  if (text.length > 150) throw new Error(`${field}が長すぎます（150文字以内）。`);
}

function group(parts) {
  if (parts.length === 0) return '';
  return parts.length === 1 ? parts[0] : `{${parts.join(' ')}}`;
}

export function validateDraft(draft) {
  const lists = {
    senders: toList(draft.senders), subjects: toList(draft.subjects),
    words: toList(draft.words), excludeSubjects: toList(draft.excludeSubjects),
    excludeWords: toList(draft.excludeWords)
  };
  if (!(lists.senders.length || lists.subjects.length || lists.words.length)) {
    throw new Error('送信元・件名・全文キーワードのいずれかを指定してください。');
  }
  if (Object.values(lists).some(items => items.length > 30)) {
    throw new Error('各項目は30件以内にしてください。');
  }
  Object.entries(lists).forEach(([field, items]) => items.forEach(v => assertSafeTerm(v, field)));
  lists.senders.forEach(address => {
    if (!emailPattern.test(address) && !domainPattern.test(address)) {
      throw new Error(`送信元はメールアドレスまたは @ドメイン で入力してください: ${address}`);
    }
  });
  if (!['archive', 'trash', 'labelOnly'].includes(draft.action)) {
    throw new Error('振り分け先が不正です。');
  }
  if (draft.action === 'labelOnly' && !draft.labelId) {
    throw new Error('ラベルのみを指定する場合は、ラベルを選んでください。');
  }
  return lists;
}

export function buildFilter(draft) {
  const lists = validateDraft(draft);
  // AND between condition groups, OR within each group.
  const positive = [
    group(lists.senders.map(v => `from:${v}`)),
    group(lists.subjects.map(v => `subject:"${v}"`)),
    group(lists.words.map(v => `"${v}"`))
  ].filter(Boolean).join(' ');
  const negative = group([
    ...lists.excludeSubjects.map(v => `subject:"${v}"`),
    ...lists.excludeWords.map(v => `"${v}"`)
  ]);
  const addLabelIds = [];
  const removeLabelIds = [];
  if (draft.action === 'archive') removeLabelIds.push('INBOX');
  if (draft.action === 'trash') addLabelIds.push('TRASH');
  if (draft.markRead) removeLabelIds.push('UNREAD');
  if (draft.labelId) addLabelIds.push(draft.labelId);
  const criteria = { query: positive };
  if (negative) criteria.negatedQuery = negative;
  return {criteria, action: {addLabelIds, removeLabelIds}};
}

function tokenizeFilterQuery(query) {
  // Only recognize the exact restricted syntax emitted by buildFilter.
  if (!query) return [];
  const pieces = query.match(/\{[^{}]*\}|from:[^\s{}]+|subject:"[^"]*"|"[^"]*"/g) || [];
  if (pieces.join(' ') !== query) return null;
  return pieces;
}

function decodePieces(query) {
  const pieces = tokenizeFilterQuery(query);
  if (!pieces) return null;
  const tokens = [];
  for (const piece of pieces) {
    const groupTokens = piece.startsWith('{') ? piece.slice(1, -1) : piece;
    const matches = groupTokens.match(/from:[^\s{}]+|subject:"[^"]*"|"[^"]*"/g) || [];
    if (matches.join(' ') !== groupTokens) return null;
    for (const match of matches) {
      if (match.startsWith('from:')) tokens.push(['senders', match.slice(5)]);
      else if (match.startsWith('subject:')) tokens.push(['subjects', match.slice(9, -1)]);
      else tokens.push(['words', match.slice(1, -1)]);
    }
  }
  return tokens;
}

export function parseFilter(filter) {
  const p = decodePieces(filter?.criteria?.query);
  const n = decodePieces(filter?.criteria?.negatedQuery || '');
  if (!p || !n || p.length === 0 || Object.keys(filter?.criteria || {}).some(x => !['query','negatedQuery'].includes(x))) return null;
  if (n.some(([field]) => field === 'senders')) return null;
  const add = filter?.action?.addLabelIds || [];
  const remove = filter?.action?.removeLabelIds || [];
  if (add.some(id => id !== 'TRASH' && !/^Label_[A-Za-z0-9_-]+$/.test(id))) return null;
  if (add.filter(id => id !== 'TRASH').length > 1) return null;
  if (add.includes('TRASH') && remove.includes('INBOX')) return null;
  if (remove.some(id => !['INBOX','UNREAD'].includes(id))) return null;
  if (filter?.action?.forward) return null;
  const action = add.includes('TRASH') ? 'trash' : remove.includes('INBOX') ? 'archive' : 'labelOnly';
  const labelId = add.find(x => x !== 'TRASH') || '';
  if (action === 'labelOnly' && !labelId) return null;
  const draft = emptyDraft();
  for (const [key, value] of p) draft[key] += (draft[key] ? ', ' : '') + value;
  for (const [key, value] of n) {
    const dest = key === 'subjects' ? 'excludeSubjects' : 'excludeWords';
    draft[dest] += (draft[dest] ? ', ' : '') + value;
  }
  draft.action = action;
  draft.labelId = labelId;
  draft.markRead = remove.includes('UNREAD');
  try {
    // Never interpret another Gmail filter as editable if round-trip encoding
    // would broaden/narrow its meaning. In particular, `from:a from:b`
    // (AND) must not become `{from:a from:b}` (OR).
    const rebuilt = buildFilter(draft);
    if (rebuilt.criteria.query !== filter.criteria.query) return null;
    if ((rebuilt.criteria.negatedQuery || '') !== (filter.criteria.negatedQuery || '')) return null;
    const canonical = items => JSON.stringify([...items].sort());
    if (canonical(rebuilt.action.addLabelIds) !== canonical(add)) return null;
    if (canonical(rebuilt.action.removeLabelIds) !== canonical(remove)) return null;
  } catch { return null; }
  return draft;
}

export function summarizeFilter(filter, labels = []) {
  const result = parseFilter(filter);
  if (!result) return filter.criteria?.query || filter.criteria?.from || filter.criteria?.subject || 'Gmailで作成されたフィルタ';
  const groups = [result.senders && `送信元: ${result.senders}`, result.subjects && `件名: ${result.subjects}`, result.words && `全文: ${result.words}`].filter(Boolean);
  if (result.excludeSubjects || result.excludeWords) groups.push('除外条件あり');
  const dest = result.action === 'trash' ? '自動削除' : result.action === 'archive' ? 'アーカイブ' : 'ラベル';
  const label = labels.find(l => l.id === result.labelId)?.name;
  return `${groups.join(' ／ ')} → ${dest}${label ? ` ＋ ${label}` : ''}`;
}