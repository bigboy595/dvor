"""Prepare pedestrian paths for the fixed collection; visitors use local data only."""
import itertools
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(tempfile.gettempdir()) / 'dvor-pedestrian-paths-v1'
CACHE.mkdir(parents=True, exist_ok=True)
places = json.loads(subprocess.check_output(['node', '-e', "global.window={};require('./data.js');console.log(JSON.stringify(window.DVOR_PLACES))"], cwd=ROOT))
result = {'version': 1, 'prepared': datetime.date.today().isoformat(), 'source': 'Valhalla / OpenStreetMap', 'sourceUrl': 'https://valhalla.openstreetmap.de', 'license': 'ODbL 1.0', 'licenseUrl': 'https://www.openstreetmap.org/copyright', 'locations': {p['id']: [p['lat'], p['lng']] for p in places}, 'paths': {}}
for a, b in itertools.permutations(places, 2):
    key = a['id'] + '>' + b['id']
    payload = {'locations': [{'lat': p['lat'], 'lon': p['lng'], 'type': 'break'} for p in [a, b]], 'costing': 'pedestrian', 'costing_options': {'pedestrian': {'exclude_tolls': True, 'exclude_ferries': True}}, 'directions_options': {'language': 'ru-RU', 'units': 'kilometers'}, 'shape_format': 'polyline6'}
    encoded = json.dumps(payload, separators=(',', ':'))
    fingerprint = hashlib.sha256(encoded.encode()).hexdigest()[:12]
    cache = CACHE / (a['id'] + '-' + b['id'] + '-' + fingerprint + '.json')
    if cache.exists():
        data = json.loads(cache.read_text())
    else:
        url = 'https://valhalla1.openstreetmap.de/route?json=' + urllib.parse.quote(encoded)
        request = urllib.request.Request(url, headers={'User-Agent': 'DvorMemory path preparation (https://github.com/bigboy595/dvor)', 'X-Client-Id': 'bigboy595.github.io/dvor'})
        data = json.load(urllib.request.urlopen(request, timeout=35))
        cache.write_text(json.dumps(data, ensure_ascii=False))
        time.sleep(1)
    trip = data['trip']
    assert trip['status'] == 0 and len(trip['legs']) == 1, key
    leg = trip['legs'][0]
    assert not trip['summary'].get('has_ferry'), key
    result['paths'][key] = {'shape': leg['shape'], 'length': leg['summary']['length'], 'time': leg['summary']['time']}
    print(key, leg['summary']['length'], 'km', flush=True)
assert len(result['paths']) == len(places) * (len(places) - 1)
(ROOT / 'assets/walking-paths.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print('Prepared', len(result['paths']), 'directed paths', flush=True)
