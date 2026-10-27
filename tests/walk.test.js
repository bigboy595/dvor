const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = {window: {}};
for (const file of ['data.js', 'walk.js']) vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
const {DVOR_PLACES: places, DVOR_STORIES: stories, DVOR_WALK: walk} = context.window;
const data = JSON.parse(fs.readFileSync(path.join(root, 'assets/walking-paths.json'), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
const distance = (a,b) => {
  const r = Math.PI / 180, h = Math.sin((b[0]-a[0])*r/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin((b[1]-a[1])*r/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
};

test('every pair has a pedestrian path near both locations, in both directions', () => {
  assert.equal(Object.keys(data.paths).length, 30);
  for (const a of places) for (const b of places) {
    if (a.id === b.id) continue;
    const result = walk.compose([a,b], data);
    assert.ok(result.coords.length > 2);
    assert.ok(distance(result.coords[0], [a.lat,a.lng]) < 100, a.id+' start');
    assert.ok(distance(result.coords.at(-1), [b.lat,b.lng]) < 100, b.id+' finish');
    assert.ok(result.length*1000 >= distance([a.lat,a.lng],[b.lat,b.lng])*0.95);
    for (let i=1;i<result.coords.length;i++) assert.ok(distance(result.coords[i-1],result.coords[i])<500, a.id+'>'+b.id+' disconnected segment');
  }
});

test('all 1,950 ordered combinations of two to six places compose without losing stops', () => {
  let checked = 0;
  function visit(selected, rest) {
    if (selected.length >= 2) {
      const result = walk.compose(selected, data);
      assert.equal(result.legs.length, selected.length-1);
      assert.deepEqual(plain(result.legs.map(l=>l.from)), selected.slice(0,-1).map(p=>p.id));
      assert.deepEqual(plain(result.legs.map(l=>l.to)), selected.slice(1).map(p=>p.id));
      const expected = selected.slice(1).reduce((sum,p,i)=>sum+data.paths[selected[i].id+'>'+p.id].length,0);
      assert.ok(Math.abs(result.length-expected)<1e-8);
      checked++;
    }
    rest.forEach((p,i)=>visit([...selected,p],rest.filter((_,n)=>n!==i)));
  }
  visit([], places);
  assert.equal(checked,1950);
});

test('a second story at the same place belongs to the existing stop, including saved links', () => {
  const groups = walk.group(['story-1','story-8','story-4','story-1','missing','story-9'], stories);
  assert.deepEqual(plain(groups), [{place:'entrance',ids:['story-1','story-4']},{place:'chistye',ids:['story-8']},{place:'presnya',ids:['story-9']}]);
  assert.equal(walk.compose(groups.map(g=>places.find(p=>p.id===g.place)),data).legs.length,2);
});

test('missing or stale data fails explicitly instead of drawing a straight walking path', () => {
  assert.throws(()=>walk.compose([places[0],places[3]],{...data,paths:{}}),/Path unavailable/);
  assert.throws(()=>walk.compose([{...places[0],lat:56},places[3]],data),/location changed/);
  assert.throws(()=>walk.decodePolyline('~'),/Invalid path/);
});

test('rapid route edits share one local download, and a failed download can be retried', async () => {
  let calls = 0;
  const c = {window: {}, AbortController, setTimeout, clearTimeout, fetch: async url => {
    assert.equal(url, 'assets/walking-paths.json?v=7');
    calls++;
    if (calls === 1) return {ok: false};
    return {ok: true, json: async () => data};
  }};
  vm.runInNewContext(fs.readFileSync(path.join(root,'walk.js'),'utf8'), c);
  await assert.rejects(c.window.DVOR_WALK.load([places[0],places[3]]), /Paths unavailable/);
  const results = await Promise.all([
    c.window.DVOR_WALK.load([places[0],places[3]]),
    c.window.DVOR_WALK.load([places[5],places[4],places[1]])
  ]);
  assert.equal(calls, 2);
  assert.equal(results[0].legs.length, 1);
  assert.equal(results[1].legs.length, 2);
});
