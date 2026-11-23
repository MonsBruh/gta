#!/usr/bin/env python3
"""Convert an OpenStreetMap .osm extract of Lancaster University into data/campus.js.

Usage: python3 tools/osm2campus.py map.osm data/campus.js
Source bbox used: https://api.openstreetmap.org/api/0.6/map?bbox=-2.7990,53.9985,-2.7700,54.0180
Map data (c) OpenStreetMap contributors, ODbL.
"""
import sys, json, math, xml.etree.ElementTree as ET

SRC, OUT = sys.argv[1], sys.argv[2]
root = ET.parse(SRC).getroot()
b = root.find('bounds')
minlat, minlon, maxlat, maxlon = (float(b.get(k)) for k in ('minlat', 'minlon', 'maxlat', 'maxlon'))
LAT0, LON0 = (minlat + maxlat) / 2, (minlon + maxlon) / 2
KX = 111320 * math.cos(math.radians(LAT0)); KZ = 110574

def proj(lat, lon):
    return (round((lon - LON0) * KX, 1), round(-(lat - LAT0) * KZ, 1))

HALFW = (maxlon - minlon) / 2 * KX + 150
HALFH = (maxlat - minlat) / 2 * KZ + 150
def inside(p): return abs(p[0]) <= HALFW and abs(p[1]) <= HALFH

def tags(e): return {t.get('k'): t.get('v') for t in e.findall('tag')}

nodes, ntags = {}, {}
for n in root.findall('node'):
    nodes[n.get('id')] = proj(float(n.get('lat')), float(n.get('lon')))
    t = tags(n)
    if t: ntags[n.get('id')] = t
ways = {}
for w in root.findall('way'):
    refs = [nd.get('ref') for nd in w.findall('nd') if nd.get('ref') in nodes]
    ways[w.get('id')] = (refs, tags(w))

def coords(refs): return [nodes[r] for r in refs]

def assemble(member_ways):
    """join way node-lists into closed rings"""
    segs = [list(r) for r in member_ways if len(r) >= 2]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]: cur += s[1:]
                elif s[-1] == cur[-1]: cur += s[::-1][1:]
                elif s[-1] == cur[0]: cur = s[:-1] + cur
                elif s[0] == cur[0]: cur = s[::-1][:-1] + cur
                else: continue
                segs.pop(i); changed = True; break
        if cur[0] == cur[-1] and len(cur) >= 4: rings.append(cur)
    return rings

def area_of(ring):
    a = 0
    for i in range(len(ring) - 1):
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return a / 2

def flat(pts): return [v for p in pts for v in p]

polys = []  # (outer_refs_list, inner_list, tags, id)
for wid, (refs, t) in ways.items():
    if len(refs) >= 4 and refs[0] == refs[-1]:
        polys.append(([refs], [], t, 'w' + wid))
for r in root.findall('relation'):
    t = tags(r)
    if t.get('type') not in ('multipolygon', 'building'): continue
    outers, inners = [], []
    for m in r.findall('member'):
        if m.get('type') != 'way' or m.get('ref') not in ways: continue
        (inners if m.get('role') == 'inner' else outers).append(ways[m.get('ref')][0])
    if t.get('type') == 'building':
        continue  # parts are emitted on their own
    orings, irings = assemble(outers), assemble(inners)
    if orings: polys.append((orings, irings, t, 'r' + r.get('id')))
    # tags may live on the outer way for old-style multipolygons -> already handled as ways

def num(v, d):
    try: return float(str(v).split(';')[0].replace('m', '').strip())
    except Exception: return d

LEVEL_H = 3.3
DEFAULT_LEVELS = {'house': 2, 'residential': 4, 'semidetached_house': 2, 'detached': 2, 'university': 4,
    'shed': 1, 'garage': 1, 'garages': 1, 'barn': 2, 'farm_auxiliary': 1, 'greenhouse': 1, 'service': 1,
    'garbage_shed': 1, 'roof': 1, 'shelter': 1, 'hotel': 3, 'office': 3, 'kindergarten': 1, 'farm': 2,
    'yes': 2, 'commercial': 2, 'industrial': 2, 'church': 2}

def bbox(ring):
    xs = [p[0] for p in ring]; zs = [p[1] for p in ring]
    return min(xs), min(zs), max(xs), max(zs)

def pip(x, z, ring):
    c = False; j = len(ring) - 1
    for i in range(len(ring)):
        xi, zi = ring[i]; xj, zj = ring[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi: c = not c
        j = i
    return c

buildings, parts, areas, zones = [], [], [], []
AREA_KEYS = ('landuse', 'natural', 'leisure', 'amenity', 'highway', 'man_made', 'place', 'water')
for orings, irings, t, pid in polys:
    oc = [coords(r) for r in orings]; ic = [coords(r) for r in irings]
    if not any(inside(p) for ring in oc for p in ring): continue
    bb = bbox([p for ring in oc for p in ring])
    if bb[2] - bb[0] > 4000 or bb[3] - bb[1] > 4000: continue
    if 'building' in t or 'building:part' in t:
        ispart = 'building:part' in t and 'building' not in t
        kind = t.get('building') or t.get('building:part')
        if kind in ('no',): continue
        lv = num(t.get('building:levels'), DEFAULT_LEVELS.get(kind, 2))
        if kind == 'roof' or t.get('building:part') == 'roof':
            mh = num(t.get('min_height'), 3.0); h = mh + 0.6
        else:
            h = num(t.get('height'), lv * LEVEL_H + (1.2 if kind in ('house', 'barn', 'semidetached_house') else 0.4))
            mh = num(t.get('min_height'), num(t.get('building:min_level'), 0) * LEVEL_H)
        if t.get('name') == 'Bowland Tower': h = max(h, 30)
        for ring in oc:
            holes = [flat(r) for r in ic if pip(r[0][0], r[0][1], ring)]
            rec = {'p': flat(ring[:-1]), 'h': round(h, 1), 't': kind}
            if mh > 0: rec['mh'] = round(mh, 1)
            if holes: rec['hl'] = [hh[:-2] for hh in holes]
            if t.get('name'): rec['n'] = t['name']
            mat = t.get('building:material') or t.get('building:colour')
            if mat: rec['m'] = mat
            if t.get('roof:shape') in ('gabled', 'hipped', 'pyramidal') or kind in ('house', 'semidetached_house', 'barn', 'farm'):
                rec['r'] = 1
            (parts if ispart else buildings).append(rec)
        continue
    k = None
    if t.get('natural') == 'water' or t.get('water') or t.get('landuse') in ('reservoir', 'basin'): k = 'water'
    elif t.get('natural') in ('wood',) or t.get('landuse') == 'forest': k = 'wood'
    elif t.get('natural') in ('scrub', 'shrubbery', 'wetland', 'heath'): k = 'scrub'
    elif t.get('leisure') == 'pitch': k = 'pitch:' + t.get('surface', t.get('sport', 'grass'))
    elif t.get('leisure') in ('garden', 'park', 'playground', 'common'): k = 'park'
    elif t.get('amenity') in ('parking',) or t.get('parking'): k = 'parking'
    elif t.get('highway') in ('pedestrian', 'footway', 'service', 'living_street') and t.get('area') == 'yes': k = 'plaza'
    elif t.get('highway') == 'pedestrian': k = 'plaza'
    elif t.get('landuse') in ('grass', 'village_green', 'recreation_ground', 'flowerbed', 'cemetery'): k = 'grass'
    elif t.get('landuse') in ('meadow', 'farmland', 'orchard', 'allotments', 'apiary'): k = 'farm'
    elif t.get('landuse') in ('farmyard', 'construction', 'industrial', 'railway', 'highway', 'brownfield'): k = 'yard'
    elif t.get('man_made') in ('storage_tank',): k = 'tank'
    elif t.get('amenity') in ('bicycle_parking', 'shelter'): k = 'paved'
    if k:
        for ring in oc:
            holes = [flat(r[:-1]) for r in ic if pip(r[0][0], r[0][1], ring)]
            rec = {'k': k, 'p': flat(ring[:-1])}
            if holes: rec['hl'] = holes
            if t.get('name'): rec['n'] = t['name']
            areas.append(rec)
    nm = t.get('name')
    if nm and (t.get('place') == 'neighbourhood' or k in ('plaza', 'water', 'wood', 'park', 'parking') or t.get('landuse') in ('education', 'grass', 'farmyard', 'construction') or t.get('amenity') in ('university', 'kindergarten')):
        for ring in oc:
            zones.append({'n': nm, 'p': flat(ring[:-1]), 'a': round(abs(area_of(ring)))})

# parts: hide host building geometry (but keep it for collision)
for bld in buildings:
    ring = list(zip(bld['p'][0::2], bld['p'][1::2]))
    for pt in parts:
        cx = sum(pt['p'][0::2]) / (len(pt['p']) / 2); cz = sum(pt['p'][1::2]) / (len(pt['p']) / 2)
        if pip(cx, cz, ring):
            bld['hp'] = 1; break

ROADW = {'motorway': 15, 'motorway_link': 7, 'trunk': 11, 'primary': 9, 'primary_link': 6, 'secondary': 8,
    'tertiary': 7, 'unclassified': 6.5, 'residential': 6, 'living_street': 5.5, 'service': 4.5,
    'track': 3, 'pedestrian': 4, 'footway': 2.2, 'cycleway': 2.6, 'path': 1.6, 'steps': 2.4, 'bridleway': 2}
roads, lines = [], []
def split_inside(pts):
    out, cur = [], []
    for p in pts:
        if inside(p): cur.append(p)
        else:
            if len(cur) >= 2: out.append(cur)
            cur = []
    if len(cur) >= 2: out.append(cur)
    return out

for wid, (refs, t) in ways.items():
    pts = coords(refs)
    hw = t.get('highway')
    if hw in ROADW and not (refs[0] == refs[-1] and t.get('area') == 'yes'):
        w = num(t.get('width'), ROADW[hw]) if hw not in ('footway', 'path', 'cycleway', 'steps') else ROADW[hw]
        w = max(1.4, min(w, 20))
        if t.get('lanes') and hw in ('primary', 'tertiary', 'unclassified', 'motorway'):
            w = max(w, num(t['lanes'], 2) * 3.4)
        for seg in split_inside(pts):
            rec = {'t': hw, 'w': round(w, 1), 'p': flat(seg), 'id': [r for r in refs if inside(nodes[r])][:0]}
            del rec['id']
            # keep node ids at junctions for graph building
            rec['ids'] = [int(r) for r, p in zip(refs, pts) if p in seg]
            if t.get('name'): rec['n'] = t['name']
            if t.get('tunnel') and t.get('tunnel') != 'no' or t.get('covered') == 'yes' or t.get('layer', '0').startswith('-'): rec['tu'] = 1
            if t.get('bridge') and t.get('bridge') != 'no': rec['br'] = int(num(t.get('layer'), 1))
            if t.get('layer') and t['layer'] != '0': rec['ly'] = t['layer']
            if t.get('tunnel'): rec['tn'] = t['tunnel']
            if t.get('level'): rec['lv'] = t['level']
            if t.get('oneway') == 'yes' or hw in ('motorway', 'motorway_link'): rec['ow'] = 1
            if t.get('maxspeed'): rec['ms'] = t['maxspeed']
            roads.append(rec)
        continue
    k = None
    if t.get('barrier') in ('hedge',): k = 'hedge'
    elif t.get('barrier') in ('wall', 'retaining_wall', 'city_wall'): k = 'wall'
    elif t.get('barrier') in ('fence', 'guard_rail'): k = 'fence'
    elif t.get('waterway') in ('stream', 'river', 'ditch', 'drain', 'canal'): k = 'river' if t['waterway'] in ('river', 'canal') else 'stream'
    elif t.get('natural') == 'tree_row': k = 'treerow'
    elif t.get('railway') in ('rail',): k = 'rail'
    if k and not (k in ('hedge', 'wall', 'fence') and t.get('area') == 'yes'):
        for seg in split_inside(pts):
            rec = {'k': k, 'p': flat(seg)}
            if k == 'rail' and t.get('bridge'): rec['br'] = 1
            if k in ('stream', 'river') and t.get('tunnel'): rec['tu'] = 1
            lines.append(rec)

trees, pois = [], []
for nid, t in ntags.items():
    p = nodes[nid]
    if not inside(p): continue
    if t.get('natural') == 'tree': trees += list(p)
    nm = t.get('name')
    if nm and not t.get('public_transport') == 'stop_position':
        kind = t.get('amenity') or t.get('shop') or t.get('tourism') or t.get('highway') or 'place'
        pois.append({'n': nm, 'k': kind, 'x': p[0], 'z': p[1]})
    elif t.get('amenity') in ('bench', 'waste_basket', 'atm', 'telephone', 'post_box', 'vending_machine', 'bicycle_parking') or t.get('highway') in ('street_lamp', 'bus_stop', 'traffic_signals') or t.get('barrier') in ('bollard', 'gate', 'lift_gate'):
        pois.append({'k': t.get('amenity') or t.get('highway') or t.get('barrier'), 'x': p[0], 'z': p[1]})

data = {'origin': [LAT0, LON0], 'half': [round(HALFW - 150), round(HALFH - 150)],
        'buildings': buildings, 'parts': parts, 'areas': areas, 'roads': roads, 'lines': lines,
        'trees': trees, 'pois': pois, 'zones': zones,
        'attribution': 'Map data © OpenStreetMap contributors (ODbL)'}
with open(OUT, 'w') as f:
    f.write('// Generated by tools/osm2campus.py from OpenStreetMap. Map data (c) OpenStreetMap contributors, ODbL 1.0.\n')
    f.write('window.CAMPUS=' + json.dumps(data, separators=(',', ':')) + ';\n')
print('buildings', len(buildings), 'parts', len(parts), 'areas', len(areas), 'roads', len(roads), 'lines', len(lines),
      'trees', len(trees) // 2, 'pois', len(pois), 'zones', len(zones))
