// Run with Node: node test.cjs. No Herdr window or processes are changed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let live = [];
let coreTerminals = [];
const actions = [];
const persisted = new Map();
let currentFocus = null;
let sharedWrites = 0;
const mockInput = () => ({on(){}, focus(){}, value(){return ''}, set_value(){}, set_selected_range(){}});
const context = {
  View: class {}, agents: () => live, terminals: () => coreTerminals,
  focused: () => currentFocus,
  shared: key => persisted.get(key),
  setShared: (key, value) => {persisted.set(key, value); sharedWrites++},
  InputState: {new: mockInput},
  div: () => ({size(){return this}}),
  props: () => ({overlay: 'test-overlay'}),
  closeOverlay: id => actions.push(['close', id]),
  run: (...args) => actions.push(args),
};
vm.createContext(context);
const source = fs.readFileSync(`${__dirname}/main.js`, 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/export default class AgentPicker/, 'class AgentPicker')
  .replace(/export function /g, 'function ');
vm.runInContext(source + '\nthis.api = { parseQuery, filterAgents, collectAgents, readVisits, moveToFront, sortByMru, AgentPicker };', context);
const { filterAgents, AgentPicker } = context.api;
const a = (address, status, title, space_name = 'API') => ({address, status, title, space_name, tab_name:'login', program:{name:'Pi'}});
live = [a('t1','working','Fix Login'), a('vps/t2','blocked','Schema'), a('t3','idle','Review'), a('t4','done','Docs')];
const matches = query => Array.from(filterAgents(live, query), a => a.address);
assert.deepEqual(matches(''), ['t1','vps/t2','t3','t4']);
assert.deepEqual(matches('  WORKING login '), ['t1']);
assert.deepEqual(matches('status:blocked API'), ['vps/t2']);
assert.deepEqual(matches('done idle'), ['t3','t4']);
assert.deepEqual(matches('vps/t2'), ['vps/t2']);
assert.deepEqual(matches('no-match'), []);
assert.deepEqual(matches('status:invalid'), []);
assert.deepEqual(matches('pi api schema'), ['vps/t2']);
const picker = new AgentPicker();
picker.query=''; picker.index=1; picker.selected='vps/t2';
picker.reconcile([live[1], live[0]]);
assert.equal(picker.index,0);
picker.reconcile([live[0]]);
assert.equal(picker.selected,'t1');
picker.choose();
assert.equal(actions[0][0],'close');
assert.equal(actions[1][0],'agent.focus');
assert.equal(actions[1][1].terminal,'t1');
picker.query='no-match';
picker.choose();
assert.equal(actions.length,2);
let inputValue;
let inputRange;
picker.input={set_value: value => {inputValue=value}, set_selected_range: range => {inputRange=range}, focus: () => {}};
picker.query='blocked login';
picker.setStatus('working',{notify(){}});
assert.equal(inputValue,'working login');
picker.setStatus('all',{notify(){}});
assert.equal(inputValue,'login');
picker.query='';
picker.setStatus('blocked',{notify(){}});
assert.equal(inputValue,'blocked ');
assert.equal(inputRange.start,inputValue.length);
assert.equal(inputRange.end,inputValue.length);
assert.deepEqual(matches(inputValue + 'schema'), ['vps/t2']);
picker.setStatus('done',{notify(){}});
assert.equal(inputValue,'done ');
picker.setStatus('all',{notify(){}});
assert.equal(inputValue,'');
assert.ok(source.includes('.h(PAGE * 54 + (PAGE - 1) * 4).flex_none()'));
assert.deepEqual(matches('d '), ['t4']);
assert.deepEqual(matches('D '), ['t4']);
assert.deepEqual(matches('d docs'), ['t4']);
assert.deepEqual(matches('d schema'), []);
assert.equal(context.api.parseQuery('d').statuses.length, 0);
picker.query='d docs';
picker.setStatus('working',{notify(){}});
assert.equal(inputValue,'working docs');
for (const [short, address, search] of [['w','t1','login'], ['b','vps/t2','schema'], ['i','t3','review']]) {
  assert.deepEqual(matches(short + ' '), [address]);
  assert.deepEqual(matches(short.toUpperCase() + ' '), [address]);
  assert.deepEqual(matches(short + ' ' + search), [address]);
  assert.equal(context.api.parseQuery(short).statuses.length, 0);
  picker.query=short + ' ' + search;
  picker.setStatus('done',{notify(){}});
  assert.equal(inputValue,'done ' + search);
}
const { collectAgents } = context.api;
const parent = {...live[0], space:'s1', tab:'tab1', tab_index:1};
const child = {address:'t5', parent:'t1', state:'live', status:'working', name:'zielgruppen-review', program:{name:'Pi'}};
const grandchild = {address:'vps/t6', parent:'t5', state:'live', status:'error', name:'nested-review'};
const exited = {address:'t7', parent:'t1', state:'finished', status:'working'};
const orphan = {address:'t8', parent:'not-in-herdr', state:'live', status:'working'};
const cycle = [{address:'c1', parent:'c2',state:'live'}, {address:'c2',parent:'c1',state:'live'}];
const combined = collectAgents([parent], [grandchild, child, exited, orphan, ...cycle]);
assert.equal(combined.length,3);
assert.equal(combined[1].address,'t5');
assert.equal(combined[1].title,'zielgruppen-review');
assert.equal(combined[1].space_name,'API');
assert.equal(combined[1].tab,'tab1');
assert.equal(combined[1].subagent,true);
assert.equal(combined[2].status,'blocked');
assert.deepEqual(Array.from(filterAgents(combined,'w review'), a=>a.address),['t5']);
assert.deepEqual(Array.from(filterAgents(combined,'b nested'), a=>a.address),['vps/t6']);
assert.equal(collectAgents([parent, {...child, pane:'p5'}],[child]).length,2);
assert.equal(collectAgents([parent],[{...child,status:'done'}])[1].status,'idle');
assert.equal(collectAgents([parent],[{...child,status:null}])[1].status,'unknown');
const remote = collectAgents([{...parent,address:'vps/t1'}],[{...child,address:'vps/t5',parent:'vps/t1'}]);
assert.equal(remote[1].address,'vps/t5');
coreTerminals=[{...child,parent:'t1'}];
picker.query='w zielgruppen'; picker.index=0; picker.selected=null;
picker.choose();
assert.equal(actions.at(-1)[0],'terminal.peek');
assert.equal(actions.at(-1)[1].terminal,'t5');
coreTerminals=[];
const {readVisits, moveToFront, sortByMru} = context.api;
const addresses = list => Array.from(list, a => a.address);
assert.equal(readVisits(null).length,0);
assert.deepEqual(addresses(readVisits([null,{}, {address:'t1'}, {address:'t1'}])),['t1']);
assert.deepEqual(addresses(moveToFront([{address:'t1'},{address:'t2'}],'t2',20)),['t2','t1']);
assert.equal(moveToFront([], 't1', 10)[0].created_ms,10);
assert.equal(moveToFront(Array.from({length:300},(_,i)=>({address:`old${i}`})),'new',1).length,256);
coreTerminals=[{address:'t1',created_ms:10}, {...child,created_ms:50}];
assert.deepEqual(addresses(sortByMru(live,[{address:'t4'},{address:'t1',created_ms:10}],coreTerminals)),['t4','t1','vps/t2','t3']);
assert.deepEqual(addresses(sortByMru(live,[{address:'t4'},{address:'t1',created_ms:999}],coreTerminals)),['t4','t1','vps/t2','t3']);
assert.deepEqual(addresses(sortByMru(live,[{address:'t1',created_ms:999}],coreTerminals)),addresses(live));
const cx={focus_handle(){return {}}, notify(){}};
const tracker=new AgentPicker();
currentFocus={terminal:'t1'};
tracker.init({tracker:true},cx);
const key='agent-picker.mru.v1';
assert.equal(persisted.get(key)[0].address,'t1');
const writesBefore=sharedWrites;
tracker.render(); tracker.render();
assert.equal(sharedWrites,writesBefore); // status/data redraws are not visits
currentFocus={terminal:'vps/t2'}; tracker.render();
assert.deepEqual(addresses(persisted.get(key)),['vps/t2','t1']);
currentFocus={terminal:'t1'}; tracker.render();
assert.deepEqual(addresses(persisted.get(key)),['t1','vps/t2']);
currentFocus={terminal:'shell',agent:'t3'}; tracker.render();
assert.equal(persisted.get(key)[0].address,'t1'); // ignore stale agent-block choice
currentFocus={terminal:'t5'}; tracker.render();
assert.equal(persisted.get(key)[0].address,'t5'); // pane-less subagent visits
assert.equal(persisted.get(key)[0].created_ms,50);
currentFocus=null;
const opening=new AgentPicker(); opening.init({},cx);
assert.deepEqual(addresses(opening.allAgents()).slice(0,3),['t5','t1','vps/t2']);
opening.query='w ';
assert.deepEqual(addresses(opening.rows()),['t5','t1']); // filtering preserves MRU
const frozen=addresses(opening.allAgents());
persisted.set(key,[{address:'t3'}]);
live=[live[3],live[2],live[1],live[0]];
assert.deepEqual(addresses(opening.allAgents()),frozen); // live model/MRU changes do not jump
live.push(a('new-agent','working','New'));
assert.equal(opening.allAgents().at(-1).address,'new-agent');
const reopened=new AgentPicker(); reopened.init({},cx);
assert.equal(reopened.allAgents()[0].address,'t3'); // saved history applies next opening
currentFocus={terminal:'t3'};
const restart=new AgentPicker(); restart.init({tracker:true},cx);
assert.equal(persisted.get(key)[0].address,'t3');
assert.ok(source.includes('if (this.tracker) return;')); // tracker never creates/focuses an input
console.log('PASS: picker regressions and MRU sorting, persistence, focus, snapshot and subagent tests');
