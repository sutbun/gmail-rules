import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildFilter,parseFilter,emptyDraft,toList,summarizeFilter} from '../rules.js';

test('default rule safely archives matching sender',()=>{
 const result=buildFilter({...emptyDraft(),senders:'news@example.com'});
 assert.deepEqual(result,{criteria:{query:'from:news@example.com'},action:{addLabelIds:[],removeLabelIds:['INBOX']}});
});
test('multiple values OR, condition groups AND, and exclude OR',()=>{
 const draft={...emptyDraft(),senders:'a@example.com, b@example.com', subjects:'セール, クーポン',words:'期間限定',excludeSubjects:'重要, 訂正',excludeWords:'利用明細',labelId:'Label_1',markRead:true};
 const filter=buildFilter(draft);
 assert.equal(filter.criteria.query,'{from:a@example.com from:b@example.com} {subject:"セール" subject:"クーポン"} "期間限定"');
 assert.equal(filter.criteria.negatedQuery,'{subject:"重要" subject:"訂正" "利用明細"}');
 assert.deepEqual(filter.action,{addLabelIds:['Label_1'],removeLabelIds:['INBOX','UNREAD']});
 assert.deepEqual(parseFilter(filter),{...draft,senders:'a@example.com, b@example.com', subjects:'セール, クーポン',words:'期間限定',excludeSubjects:'重要, 訂正',excludeWords:'利用明細'});
});
test('single subject + label only',()=>{
 const data={...emptyDraft(),subjects:'お知らせ', action:'labelOnly',labelId:'Label_99'};
 assert.deepEqual(parseFilter(buildFilter(data)),data);
});
test('trash never silently combines with INBOX action',()=>{
 const result=buildFilter({...emptyDraft(),senders:'@shop.example.com',action:'trash'});
 assert.deepEqual(result.action,{addLabelIds:['TRASH'],removeLabelIds:[]});
});
test('rejects missing positive condition and label-only without label',()=>{
 assert.throws(()=>buildFilter(emptyDraft()),/いずれか/);
 assert.throws(()=>buildFilter({...emptyDraft(),senders:'a@example.com',action:'labelOnly'}),/ラベル/);
});
test('rejects operator injection and malformed senders',()=>{
 for(const input of ['abc','evil@example.com}', 'not an email']) {
  assert.throws(()=>buildFilter({...emptyDraft(),senders:input}));
 }
 assert.throws(()=>buildFilter({...emptyDraft(),subjects:'" OR from:boss@example.com'}));
});
test('recognizes external filters as noneditable when unsupported',()=>{
 assert.equal(parseFilter({criteria:{from:'someone@example.com'}, action:{removeLabelIds:['INBOX']}}),null);
 assert.equal(parseFilter({criteria:{query:'from:a@example.com'}, action:{forward:'x@y.com'}}),null);
 assert.equal(parseFilter({criteria:{query:'from:a@example.com'}, action:{addLabelIds:['INBOX']}}),null);
});
test('counts unique separated values and summarizes',()=>{
 assert.deepEqual(toList('A, B、A\nC'),['A','B','C']);
 assert.match(summarizeFilter(buildFilter({...emptyDraft(),senders:'a@example.com'})),/アーカイブ/);
});

test('never edits an existing filter whose OR/AND semantics would change', () => {
  const template = buildFilter({...emptyDraft(),senders:'a@example.com, b@example.com'});
  const misleading = structuredClone(template);
  misleading.criteria.query = 'from:a@example.com from:b@example.com';
  assert.equal(parseFilter(misleading), null);
  const mixed = structuredClone(template);
  mixed.criteria.query = 'subject:"限定" {from:a@example.com from:b@example.com}';
  assert.equal(parseFilter(mixed), null);
});

test('unrecognized action fields are never made silently editable', () => {
  const rule = buildFilter({...emptyDraft(),senders:'a@example.com'});
  rule.action.addLabelIds = ['IMPORTANT'];
  assert.equal(parseFilter(rule), null);
});