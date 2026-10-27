(() => {
  'use strict';
  // Keep all stories at a place together: a stop is visited once, in the chosen order.
  function group(ids, stories) {
    const groups = [], seen = new Set();
    ids.forEach(id => {
      const story = stories.find(s => s.id === id);
      if (!story || seen.has(id)) return;
      seen.add(id);
      let stop = groups.find(g => g.place === story.place);
      if (!stop) {stop = {place: story.place, ids: []}; groups.push(stop);}
      stop.ids.push(id);
    });
    return groups;
  }
  function decodePolyline(str) {
    let index = 0, lat = 0, lng = 0; const coords = [];
    while (index < str.length) {
      const values = [];
      for (let axis = 0; axis < 2; axis++) {
        let shift = 0, value = 0, byte;
        do {
          if (index >= str.length || shift > 30) throw new Error('Invalid path');
          byte = str.charCodeAt(index++) - 63; value |= (byte & 31) << shift; shift += 5;
        } while (byte >= 32);
        values.push((value & 1) ? ~(value >> 1) : value >> 1);
      }
      lat += values[0]; lng += values[1]; coords.push([lat / 1e6, lng / 1e6]);
    }
    return coords;
  }
  function compose(points, data) {
    const coords = [], legs = []; let length = 0, time = 0;
    for (const p of points) {
      const at = data.locations?.[p.id];
      if (!at || Math.abs(at[0] - p.lat) > 1e-6 || Math.abs(at[1] - p.lng) > 1e-6) throw new Error('Path location changed');
    }
    for (let i = 1; i < points.length; i++) {
      if (points[i - 1].id === points[i].id) continue;
      const path = data.paths?.[points[i - 1].id + '>' + points[i].id];
      if (!path || !Number.isFinite(path.length) || !Number.isFinite(path.time) || path.length <= 0 || path.time <= 0) throw new Error('Path unavailable');
      const segment = decodePolyline(path.shape);
      if (segment.length < 2) throw new Error('Empty path');
      // Keep endpoints from each leg; nearby snaps can differ slightly by approach.
      coords.push(...segment); length += path.length; time += path.time;
      legs.push({from: points[i - 1].id, to: points[i].id, length: path.length, time: path.time});
    }
    return {status: 'ready', length, time, coords, legs};
  }
  let pathsPromise;
  async function load(points) {
    if (!pathsPromise) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
      pathsPromise = fetch('assets/walking-paths.json?v=7', {signal: controller.signal}).then(r => {
        if (!r.ok) throw new Error('Paths unavailable');
        return r.json();
      }).catch(error => {pathsPromise = null; throw error;}).finally(() => clearTimeout(timeout));
    }
    return compose(points, await pathsPromise);
  }
  window.DVOR_WALK = {group, compose, decodePolyline, load};
})();
