# BAILRIGG: Campus Crime

An open-world, third-person crime sandbox set on a 1:1 recreation of **Lancaster University's Bailrigg campus**. Punch, shoot, rob, carjack and outrun the police around the Spine, Alexandra Square, Bowland Tower, Lake Carter and the colleges.

The map isn't hand-drawn. It's generated from **OpenStreetMap** data for the campus and its surroundings, so building footprints, floor counts, roads, footpaths, hedges, walls, car parks, pitches, lakes, woods, mapped trees, bus stops, lamp posts, benches and named shops and bars all sit where they are in real life.

## Play

**Desktop:** open `index.html` in Chrome, Edge or Firefox. No build step or server is needed. If your browser blocks local files, run `python3 -m http.server` in this folder and open <http://localhost:8000>.

**Phone or tablet:** open the GitHub Pages link (below) and turn the phone sideways. Touch controls switch on automatically: drag your left thumb for the joystick (push to the edge to sprint), drag your right thumb to look, and use the FIRE, AIM (with auto-aim), JUMP/BRAKE, CAR, WPN, R, MAP and II (pause) buttons. Phones get lighter graphics automatically. Add `?touch=1` or `?touch=0` to the URL to force touch controls on or off.

### Hosting on GitHub Pages

1. In the repo, go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, pick the branch with this code and the **/(root)** folder, then click **Save**.
3. After a minute or two the game is live at `https://<your-username>.github.io/gta/`. On a free account, the repo must be public.

| Key | Action |
| --- | --- |
| WASD / arrows | Move, or drive |
| Mouse | Look (click the game to capture the mouse) |
| Shift | Sprint |
| Space | Jump (on foot), handbrake (driving) |
| Left click | Punch / shoot (drive-bys work with the pistol and SMG) |
| Right click | Aim (over the shoulder) |
| F / Enter | Enter, steal or exit a vehicle (pulls the driver out) |
| R | Reload |
| 1–5, Q/E, mouse wheel | Fists, pistol, SMG, shotgun, rocket launcher |
| H | Horn |
| M | Full campus map (click it to set a waypoint) |
| N | Mute |
| Esc | Pause |

## What's in it

- **The real campus.** 493 buildings with real footprints and floor counts (Bowland Tower stands tall), courtyards and quads, the Chaplaincy Centre's lobed shape, building passages through the Spine, and the **Underpass** tunnel road under Alexandra Square. Labels show real building names, and the HUD shows your location (college, square or street).
- **Students** walk the real footpath network, flee from gunfire, cower and sometimes fight back.
- **Traffic** drives on the **left**, follows the real road graph, brakes for people and cars, and honks at you. Double-decker buses run the main roads, and parked cars fill the real visitor car parks (A–L, George Fox, Pendle Avenue and others).
- **Steal anything**: drag drivers out, hot-wire parked cars or take a police car. Cars take damage, smoke, catch fire and explode. If you drive into Lake Carter, the car sinks and you swim.
- **Weapons** sit around campus at real landmarks: pistols at the Library, George Fox and Fylde, SMGs at Bowland Tower and Infolab21, shotguns at the Sports Centre, Furness and Grizedale, and rocket launchers at Lake Carter and Engineering Two. Health is at the Medical Centre and Pharmacy, and body armour at the Security Lodge.
- **Rob the tills**: hold a gun on any of the 37 real shops, cafés and bars (Spar, Co-op, Greggs, Subway, Costa, the Sandeman Bar, Trevor and more) to grab cash, then run.
- **Wanted levels, 1–5 stars.** Police use A* pathfinding over the road network, pull up, get out and chase you on foot through the quads using a flow field. At 1 star they try to arrest you (BUSTED). From 2 stars they shoot, from 3 stars a helicopter joins, and at 4+ stars the helicopter and armed vans join too. Break line of sight to lose them.
- **WASTED / BUSTED**: you respawn at the Medical Centre or the Security Lodge and lose some money and your weapons.
- **Day and night** (1 game minute per real second) with lit windows and street lamps, plus Lancaster rain.
- Synthesised sound effects (no audio files), a rotating minimap and a full map with waypoints.

## Map data

`data/campus.js` is generated from OpenStreetMap by `tools/osm2campus.py`:

```sh
curl -o map.osm "https://api.openstreetmap.org/api/0.6/map?bbox=-2.7990,53.9985,-2.7700,54.0180"
python3 tools/osm2campus.py map.osm data/campus.js
```

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database License (ODbL 1.0). `data/campus.js` is a derived database and is shared under the same licence.

## Code layout

| File | Purpose |
| --- | --- |
| `js/world.js` | Builds terrain, buildings, hedges, trees, props, labels, the collision grid, road and footpath graphs, and the minimap |
| `js/actors.js` | Player and pedestrian movement and AI, cops on foot, flow-field pathfinding |
| `js/vehicles.js` | Driving physics, traffic AI (keep left), A* routing, carjacking, collisions |
| `js/combat.js` | Weapons, hitscan, explosions, rockets, pickups, shop robberies |
| `js/police.js` | Wanted system, police dispatch, helicopter, busted and wasted |
| `js/hud.js`, `js/fx.js`, `js/audio.js`, `js/models.js` | HUD and map, particles, synthesised audio, low-poly models |
| `vendor/three.min.js` | three.js r158 (MIT) |

This is an unofficial fan project, not affiliated with or endorsed by Lancaster University.
