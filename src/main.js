import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import './style.css';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#game');
// A deterministic, opt-in route used for browser acceptance tests. Normal play
// never enters this branch and keeps the full stage timings and boss health.
const QA_BOSS_MODE = new URLSearchParams(location.search).get('qa') === 'boss';
const requestedWeapon = new URLSearchParams(location.search).get('weapon');
const QA_WEAPON_MODE = ['lightning', 'laser', 'spread'].includes(requestedWeapon) ? requestedWeapon : null;
const GAME_CONFIG = Object.freeze({
  startingLives: 5,
  startingBombs: 3,
  maximumBombs: 5,
  stageDuration: 48,
  scrollSpeed: 8.6,
  playerSpeed: 11.5,
  playerBulletSpeed: 17,
  normalFireInterval: .105,
  maximumFireInterval: .078,
  enemySpeedMultiplier: 1.16,
  aircraftScale: .76,
});
const ui = {
  start: $('#start-screen'),
  startButton: $('#start-btn'),
  pause: $('#pause-screen'),
  resumeButton: $('#resume-btn'),
  result: $('#result-screen'),
  restartButton: $('#restart-btn'),
  score: $('#score'),
  highScore: $('#high-score'),
  lives: $('#lives'),
  bombs: $('#bombs'),
  weapon: $('#weapon-mode'),
  progress: $('#progress-bar'),
  stageStatus: $('#stage-status'),
  bossUI: $('#boss-ui'),
  bossBar: $('#boss-bar'),
  toast: $('#toast'),
  waveTitle: $('#wave-title'),
  damageFlash: $('#damage-flash'),
  resultKicker: $('#result-kicker'),
  resultTitle: $('#result-title'),
  resultMessage: $('#result-message'),
  resultScore: $('#result-score'),
  resultKills: $('#result-kills'),
  resultGrade: $('#result-grade'),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x76cde4);
scene.fog = new THREE.Fog(0x8bd8dc, 34, 92);

// Higher, slightly wider framing exposes more of the incoming battlefield while
// keeping the player anchored near the lower third of the screen.
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 170);
const cameraBase = new THREE.Vector3(0, 24.5, 17.5);
camera.position.copy(cameraBase);
camera.lookAt(0, -0.7, -3.2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.72, 0.55, 0.62);
composer.addPass(bloom);

scene.add(new THREE.HemisphereLight(0xe8fbff, 0x496f3f, 2.8));
const sun = new THREE.DirectionalLight(0xffedc4, 5.1);
sun.position.set(-9, 16, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -18;
scene.add(sun);
const coolFill = new THREE.DirectionalLight(0x91eaff, 2.15);
coolFill.position.set(12, 8, -14);
scene.add(coolFill);

const world = new THREE.Group();
const dynamicLayer = new THREE.Group();
const effectsLayer = new THREE.Group();
scene.add(world, dynamicLayer, effectsLayer);

const shared = {
  playerBulletGeometry: new THREE.CapsuleGeometry(0.055, 0.72, 3, 6),
  playerBulletMaterial: new THREE.MeshBasicMaterial({ color: 0x93fff0, toneMapped: false }),
  enemyBulletGeometry: new THREE.SphereGeometry(0.13, 9, 7),
  enemyBulletMaterial: new THREE.MeshBasicMaterial({ color: 0xff684e, toneMapped: false }),
  bossBulletMaterial: new THREE.MeshBasicMaterial({ color: 0xffb14a, toneMapped: false }),
  shadowMaterial: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.23, depthWrite: false }),
};
shared.playerBulletGeometry.rotateX(Math.PI / 2);

function mesh(geometry, material, castShadow = true) {
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = castShadow;
  object.receiveShadow = castShadow;
  return object;
}

function createTriangleGeometry(points, y = 0) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(([x, z]) => [x, y, z]), 3));
  geometry.setIndex(points.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function createPolygonGeometry(points, y = 0) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(([x, z]) => [x, y, z]), 3));
  const indices = [];
  for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createPlayerShip() {
  const group = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xb9c6c9, metalness: .78, roughness: .24, side: THREE.DoubleSide });
  const polished = new THREE.MeshStandardMaterial({ color: 0xe1e7e5, metalness: .88, roughness: .16, side: THREE.DoubleSide });
  const black = new THREE.MeshStandardMaterial({ color: 0x121b20, metalness: .58, roughness: .28, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: 0x66c8e6, emissive: 0x164b62, emissiveIntensity: 1.15, metalness: .25, roughness: .12 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x080b0c, metalness: .12, roughness: .7 });
  const tip = new THREE.MeshBasicMaterial({ color: 0xff8a2d, toneMapped: false });

  // Long silver fuselage with the dark upper stripe from the reference aircraft.
  const body = mesh(new THREE.CylinderGeometry(.46, .26, 2.9, 12), silver);
  body.rotation.x = -Math.PI / 2;
  body.position.z = .05;
  group.add(body);
  const tailCone = mesh(new THREE.ConeGeometry(.27, 1.05, 10), silver);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 1.88;
  group.add(tailCone);
  const dorsalStripe = mesh(new THREE.BoxGeometry(.42, .07, 2.35), black, false);
  dorsalStripe.position.set(0, .38, .12);
  group.add(dorsalStripe);

  // Broad, almost straight wings with black leading edges.
  const wingPoints = [[-2.5, .78], [-2.35, .22], [-.55, -.48], [.55, -.48], [2.35, .22], [2.5, .78], [.52, .62], [-.52, .62]];
  const wings = mesh(createPolygonGeometry(wingPoints, .02), polished);
  group.add(wings);
  [-1, 1].forEach((side) => {
    const leadingEdge = mesh(new THREE.BoxGeometry(1.92, .055, .12), black, false);
    leadingEdge.position.set(side * 1.43, .08, .12);
    leadingEdge.rotation.y = side * -.17;
    group.add(leadingEdge);
    for (let stripe = 0; stripe < 3; stripe++) {
      const marking = mesh(new THREE.BoxGeometry(.055, .065, .5), black, false);
      marking.position.set(side * (1.83 + stripe * .11), .09, .5);
      group.add(marking);
    }
  });

  // Radial engine cowling and four-blade propeller.
  const cowling = mesh(new THREE.CylinderGeometry(.53, .53, .42, 16), black);
  cowling.rotation.x = Math.PI / 2;
  cowling.position.z = -1.55;
  group.add(cowling);
  const engineRing = mesh(new THREE.TorusGeometry(.42, .075, 9, 24), polished);
  engineRing.position.z = -1.79;
  group.add(engineRing);
  const propeller = new THREE.Group();
  propeller.position.z = -1.92;
  const hub = mesh(new THREE.SphereGeometry(.15, 12, 8), polished, false);
  propeller.add(hub);
  [0, Math.PI / 2].forEach((rotation) => {
    const blade = mesh(new THREE.BoxGeometry(.13, 1.72, .055), rubber, false);
    blade.rotation.z = rotation + Math.PI / 4;
    propeller.add(blade);
  });
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2;
    const bladeTip = mesh(new THREE.BoxGeometry(.11, .18, .065), tip, false);
    bladeTip.position.set(Math.cos(angle) * .77, Math.sin(angle) * .77, 0);
    bladeTip.rotation.z = angle - Math.PI / 2;
    propeller.add(bladeTip);
  }
  group.add(propeller);
  group.userData.propeller = propeller;

  // Blue framed canopy and passenger-style side windows.
  const canopy = mesh(new THREE.SphereGeometry(.37, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(.82, .68, 1.32);
  canopy.position.set(0, .39, -.55);
  group.add(canopy);
  [-.78, -.5, -.22].forEach((z) => {
    const frame = mesh(new THREE.BoxGeometry(.66, .035, .035), polished, false);
    frame.position.set(0, .68, z);
    group.add(frame);
  });
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 3; i++) {
      const window = mesh(new THREE.BoxGeometry(.045, .16, .22), glass, false);
      window.position.set(side * .34, .27, .18 + i * .31);
      group.add(window);
    }
    const exhaust = mesh(new THREE.CylinderGeometry(.055, .065, .48, 8), black);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(side * .45, -.1, -1.25);
    group.add(exhaust);
  });

  // Tail plane and tall vertical fin preserve the reference silhouette.
  const tailPlane = mesh(createPolygonGeometry([[-.92, 1.62], [-.82, 1.28], [-.18, 1.1], [.18, 1.1], [.82, 1.28], [.92, 1.62], [.18, 1.52], [-.18, 1.52]], .05), silver);
  group.add(tailPlane);
  const finGeometry = new THREE.BufferGeometry();
  finGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, .08, 1.25, 0, 1.12, 1.62, 0, .08, 2.08], 3));
  finGeometry.setIndex([0, 1, 2]);
  finGeometry.computeVertexNormals();
  const fin = mesh(finGeometry, black);
  group.add(fin);
  const finCap = mesh(new THREE.BoxGeometry(.07, .18, .38), silver, false);
  finCap.position.set(0, .78, 1.65);
  finCap.rotation.x = -.2;
  group.add(finCap);

  const shadow = mesh(new THREE.CircleGeometry(1.5, 24), shared.shadowMaterial, false);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.38;
  shadow.scale.set(1.55, .56, 1);
  group.add(shadow);
  group.scale.setScalar(.82 * GAME_CONFIG.aircraftScale);
  return group;
}

function createEnemyShip(kind = 'scout') {
  const group = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: kind === 'gunship' ? 0x763328 : 0x9c3a2e, metalness: .56, roughness: .34 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24292a, metalness: .64, roughness: .3 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xff734f, toneMapped: false });
  const size = kind === 'gunship' ? 1.35 : kind === 'ace' ? 1.1 : .82;
  const body = mesh(new THREE.CylinderGeometry(.22, .34, 1.7, 7), red);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const nose = mesh(new THREE.ConeGeometry(.25, .7, 7), dark);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 1.18;
  group.add(nose);
  const wing = mesh(createTriangleGeometry([[-1.4, -.55], [0, .55], [1.4, -.55], [0, -.1]], 0), red);
  group.add(wing);
  [-1, 1].forEach((side) => {
    const gun = mesh(new THREE.BoxGeometry(.13, .13, .65), dark);
    gun.position.set(side * .73, -.04, .1);
    group.add(gun);
    const engine = mesh(new THREE.SphereGeometry(.1, 8, 6), glow, false);
    engine.position.set(side * .28, 0, -.88);
    group.add(engine);
  });
  if (kind === 'gunship') {
    const armor = mesh(new THREE.BoxGeometry(1.4, .24, .65), dark);
    armor.position.y = .08;
    group.add(armor);
  }
  group.scale.setScalar(size * GAME_CONFIG.aircraftScale);
  return group;
}

function createBossShip() {
  const group = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x69757a, metalness: .9, roughness: .22 });
  const brightArmor = new THREE.MeshStandardMaterial({ color: 0xaab5b8, metalness: .92, roughness: .17 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b1013, metalness: .78, roughness: .22 });
  const seam = new THREE.MeshStandardMaterial({ color: 0x252d31, metalness: .82, roughness: .28 });
  const tooth = new THREE.MeshStandardMaterial({ color: 0xf2eee0, metalness: .12, roughness: .35 });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff160c, transparent: true, opacity: 1, toneMapped: false });
  const engineGlow = new THREE.MeshBasicMaterial({ color: 0xff4a22, transparent: true, opacity: .9, toneMapped: false });

  // Broad swept wings preserve the threatening aircraft silhouette from above.
  const wing = mesh(createPolygonGeometry([
    [-5.9, -1.45], [-4.55, .5], [-2.05, 1.15], [-1.15, 1.72],
    [0, 1.22], [1.15, 1.72], [2.05, 1.15], [4.55, .5], [5.9, -1.45],
    [2.65, -.82], [1.35, -1.58], [-1.35, -1.58], [-2.65, -.82],
  ], .08), armor);
  wing.position.y = .18;
  group.add(wing);

  const fuselage = mesh(new THREE.CylinderGeometry(1.08, 1.42, 5.5, 12), armor);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, .68, -.05);
  group.add(fuselage);
  const spine = mesh(new THREE.BoxGeometry(.52, .46, 4.35), brightArmor);
  spine.position.set(0, 1.38, -.15);
  group.add(spine);

  const nose = mesh(new THREE.ConeGeometry(1.42, 2.15, 8), brightArmor);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, .72, 3.25);
  group.add(nose);

  // Armored shoulder pods carry the oversized multi-barrel weapon assemblies.
  const eyeGlows = [];
  [-1, 1].forEach((side) => {
    const shoulder = mesh(new THREE.DodecahedronGeometry(1.25, 0), armor);
    shoulder.scale.set(1.35, .72, 1.08);
    shoulder.position.set(side * 2.25, .78, .3);
    shoulder.rotation.z = side * .12;
    group.add(shoulder);
    const shoulderCap = mesh(new THREE.BoxGeometry(1.4, .28, 1.55), brightArmor);
    shoulderCap.position.set(side * 2.25, 1.28, .28);
    group.add(shoulderCap);

    const engine = mesh(new THREE.CylinderGeometry(.5, .64, 1.65, 12), black);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 2.75, .34, -1.38);
    group.add(engine);
    const flame = mesh(new THREE.ConeGeometry(.42, 1.35, 10), engineGlow, false);
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(side * 2.75, .34, -2.75);
    group.add(flame);

    [1.68, 2.18, 3.35].forEach((gunX, index) => {
      const mount = mesh(new THREE.CylinderGeometry(.2 + index * .025, .27 + index * .025, .55, 9), seam);
      mount.position.set(side * gunX, .83 - index * .12, 1.35 - index * .12);
      group.add(mount);
      const barrel = mesh(new THREE.CylinderGeometry(.075, .11, 1.65 + index * .22, 9), black);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(side * gunX, .83 - index * .12, 2.25 - index * .06);
      group.add(barrel);
      const muzzle = mesh(new THREE.TorusGeometry(.115, .035, 6, 12), seam);
      muzzle.position.set(side * gunX, .83 - index * .12, 3.1 + index * .05);
      group.add(muzzle);
    });

    const eye = mesh(new THREE.SphereGeometry(.32, 16, 10), eyeMaterial.clone(), false);
    eye.scale.set(1.38, .36, .76);
    eye.position.set(side * .62, 2.48, 1.9);
    group.add(eye);
    eyeGlows.push(eye);
  });

  // Black eye sockets and a serrated intake create the mechanical demon face.
  const faceMask = mesh(createPolygonGeometry([
    [-1.02, 1.45], [-.78, 2.35], [0, 2.72], [.78, 2.35], [1.02, 1.45],
    [.72, .92], [0, .68], [-.72, .92],
  ], 2.18), black, false);
  group.add(faceMask);
  const brow = mesh(createPolygonGeometry([[-1.28, 1.75], [-.28, 1.42], [0, 1.7], [.28, 1.42], [1.28, 1.75], [.68, 2.2], [0, 2.02], [-.68, 2.2]], 2.42), armor);
  group.add(brow);
  for (let i = 0; i < 11; i++) {
    const x = (i - 5) * .205;
    const upperTooth = mesh(createTriangleGeometry([[x - .12, 2.23], [x + .12, 2.23], [x, 2.58]], 2.32), tooth, false);
    const lowerTooth = mesh(createTriangleGeometry([[x - .12, 2.94], [x + .12, 2.94], [x, 2.58]], 2.33), tooth, false);
    group.add(upperTooth, lowerTooth);
  }

  // Cockpit panes, armor seams and rivets borrow the reference's plated skin.
  for (let i = -2; i <= 2; i++) {
    const window = mesh(new THREE.BoxGeometry(.28, .055, .56), black, false);
    window.position.set(i * .32, 1.52, .75 + Math.abs(i) * .06);
    window.rotation.y = -i * .06;
    group.add(window);
  }
  [-1.55, -.75, .05, .85].forEach((z) => {
    const panelSeam = mesh(new THREE.BoxGeometry(2.05, .035, .035), seam, false);
    panelSeam.position.set(0, 1.54, z);
    group.add(panelSeam);
  });
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const rivet = mesh(new THREE.SphereGeometry(.045, 6, 4), seam, false);
    rivet.position.set(side * (1.55 + (i % 4) * .76), .39, -1.05 + Math.floor(i / 4) * .52);
    group.add(rivet);
  }

  const tailPlane = mesh(createPolygonGeometry([[-2.15, -1.75], [-.55, -1.2], [0, -2.65], [.55, -1.2], [2.15, -1.75], [.9, -2.2], [-.9, -2.2]], .42), armor);
  group.add(tailPlane);
  const tailFin = mesh(new THREE.BoxGeometry(.28, 1.35, 1.45), brightArmor);
  tailFin.position.set(0, 1.45, -2.05);
  tailFin.rotation.x = -.2;
  group.add(tailFin);

  group.userData.eyeGlows = eyeGlows;
  group.userData.engineGlows = group.children.filter((child) => child.material === engineGlow);
  group.scale.setScalar(.8 * GAME_CONFIG.aircraftScale);
  return group;
}

const WEAPON_DATA = Object.freeze({
  vulcan: { label: 'VULCAN', color: 0x57ffe0 },
  lightning: { label: 'LIGHTNING', color: 0x69a9ff },
  laser: { label: 'LASER', color: 0xff4f9a },
  spread: { label: 'BLOSSOM', color: 0xffdc57 },
  bomb: { label: 'MISSILE', color: 0xff873d },
});
const SPECIAL_WEAPONS = ['lightning', 'laser', 'spread'];

function createPowerUp(type = 'spread') {
  const group = new THREE.Group();
  const color = WEAPON_DATA[type]?.color ?? 0x57ffe0;
  const geometry = type === 'lightning'
    ? new THREE.TetrahedronGeometry(.52, 0)
    : type === 'laser'
      ? new THREE.BoxGeometry(.5, .5, .5)
      : type === 'spread'
        ? new THREE.DodecahedronGeometry(.45, 0)
        : new THREE.OctahedronGeometry(.46, 0);
  const outer = mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, metalness: .2, roughness: .2 }),
    false,
  );
  group.add(outer);
  const ring = mesh(new THREE.TorusGeometry(.65, .035, 7, 32), new THREE.MeshBasicMaterial({ color, toneMapped: false }), false);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  return group;
}

function addCoastalWorld() {
  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x0d5660, metalness: .12, roughness: .5 });
  const water = mesh(new THREE.PlaneGeometry(70, 160, 20, 40), waterMaterial, false);
  const position = water.geometry.attributes.position;
  for (let i = 0; i < position.count; i++) position.setZ(i, Math.sin(position.getX(i) * .35 + position.getY(i) * .16) * .12);
  water.geometry.computeVertexNormals();
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -1.62, -35);
  water.receiveShadow = true;
  world.add(water);

  const seaGlow = mesh(new THREE.PlaneGeometry(24, 140), new THREE.MeshBasicMaterial({ color: 0x1d8590, transparent: true, opacity: .12 }), false);
  seaGlow.rotation.x = -Math.PI / 2;
  seaGlow.position.set(0, -1.54, -35);
  world.add(seaGlow);

  const rockMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x27382f, roughness: .92, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x3d4a36, roughness: .94, flatShading: true }),
  ];
  for (let i = 0; i < 24; i++) {
    const side = i % 2 ? 1 : -1;
    const radius = 3.4 + Math.random() * 2.4;
    const rock = mesh(new THREE.ConeGeometry(radius, 3 + Math.random() * 4, 7), rockMaterials[i % 2]);
    rock.position.set(side * (12.5 + Math.random() * 5), -2 + Math.random() * .5, -65 + i * 6 + Math.random() * 3);
    rock.rotation.y = Math.random() * Math.PI;
    rock.scale.z = .65 + Math.random() * .7;
    world.add(rock);
    scenery.push({ mesh: rock, span: 144 });
  }

  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0x8de2d4, transparent: true, opacity: .18 });
  for (let i = 0; i < 18; i++) {
    const wake = mesh(new THREE.PlaneGeometry(.035, 3.2), lineMaterial, false);
    wake.rotation.x = -Math.PI / 2;
    wake.position.set((Math.random() - .5) * 17, -1.5, -65 + i * 8);
    world.add(wake);
    scenery.push({ mesh: wake, span: 144 });
  }

  // Fast luminous streaks make the higher scroll speed immediately readable.
  const streakMaterial = new THREE.MeshBasicMaterial({ color: 0xa5fff1, transparent: true, opacity: .18, toneMapped: false });
  for (let i = 0; i < 34; i++) {
    const streak = mesh(new THREE.PlaneGeometry(.025, 1.5 + Math.random() * 4.5), streakMaterial, false);
    streak.rotation.x = -Math.PI / 2;
    streak.position.set((Math.random() - .5) * 21, -1.45, -78 + Math.random() * 122);
    world.add(streak);
    scenery.push({ mesh: streak, span: 128, multiplier: 1.75 + Math.random() * .65 });
  }

  for (let i = 0; i < 7; i++) {
    const island = new THREE.Group();
    const base = mesh(new THREE.CylinderGeometry(2.1, 2.8, 1.2, 8), rockMaterials[0]);
    island.add(base);
    const trees = 3 + (i % 3);
    for (let t = 0; t < trees; t++) {
      const tree = mesh(new THREE.ConeGeometry(.38, 1.4, 6), rockMaterials[1]);
      tree.position.set((Math.random() - .5) * 2.4, 1.15, (Math.random() - .5) * 1.8);
      island.add(tree);
    }
    island.position.set((i % 2 ? 1 : -1) * (8.5 + Math.random() * 2), -1.0, -70 + i * 21);
    world.add(island);
    scenery.push({ mesh: island, span: 147 });
  }
}

const scenery = [];
const birdFlocks = [];
const fishSchools = [];
const waterSplashes = [];
let ecosystemTime = 0;

function addLivingWorld() {
  const loader = new THREE.TextureLoader();
  // Ultra-wide screens used to reveal the plain scene color beside the
  // perspective battlefield. A single wide, mirrored texture now extends the
  // wetland beyond the combat lane without stretching it or creating seams.
  const backdropTexture = loader.load('/assets/wetland-biome-day.png');
  backdropTexture.colorSpace = THREE.SRGBColorSpace;
  backdropTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  backdropTexture.wrapS = THREE.MirroredRepeatWrapping;
  backdropTexture.repeat.set(3.2, 1);
  const backdropMaterial = new THREE.MeshBasicMaterial({ map: backdropTexture, color: 0xb7cfda, toneMapped: false });

  // Three wide portrait tiles continuously scroll the sunny wetland beneath combat.
  [-92, -32, 28].forEach((z) => {
    const backdrop = mesh(new THREE.PlaneGeometry(96, 60), backdropMaterial, false);
    backdrop.rotation.x = -Math.PI / 2;
    backdrop.position.set(0, -1.54, z);
    backdrop.renderOrder = -2;
    world.add(backdrop);
    scenery.push({ mesh: backdrop, span: 180, wrapAt: 58 });
  });

  const spriteMaterial = (column, row, opacity = 1) => {
    const map = loader.load('/assets/wetland-sprites.png');
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.repeat.set(.5, .5);
    map.offset.set(column * .5, row * .5);
    return new THREE.SpriteMaterial({ map, transparent: true, opacity, depthWrite: false, toneMapped: false });
  };
  const birdUp = spriteMaterial(0, 1, .92);
  const birdDown = spriteMaterial(1, 1, .92);
  const koiMaterial = spriteMaterial(0, 0, .9);
  const splashMaterial = spriteMaterial(1, 0, .76);

  // V-shaped goose flocks use two extracted wing poses for a readable flap.
  for (let f = 0; f < 5; f++) {
    const flock = new THREE.Group();
    const members = [];
    for (let b = 0; b < 7; b++) {
      const bird = new THREE.Sprite(birdUp);
      const side = b % 2 ? 1 : -1;
      const row = Math.ceil(b / 2);
      bird.position.set(side * row * .72, 0, row * .64);
      const size = .72 + Math.random() * .18;
      bird.scale.set(size, size, 1);
      flock.add(bird);
      members.push({ bird, phase: Math.random() * Math.PI * 2 });
    }
    flock.position.set((Math.random() - .5) * 12, 2.4 + Math.random() * 1.1, -82 + f * 28);
    world.add(flock);
    birdFlocks.push({ group: flock, members, drift: f % 2 ? .38 : -.38, span: 142, phase: f * 1.7, up: birdUp, down: birdDown });
  }

  // Orange koi stay inside the river channel and move in loose schools.
  for (let s = 0; s < 7; s++) {
    const school = new THREE.Group();
    const members = [];
    for (let f = 0; f < 4; f++) {
      const fish = new THREE.Sprite(koiMaterial.clone());
      fish.position.set((f - 1.5) * .72, 0, Math.abs(f - 1.5) * .55);
      const size = .68 + Math.random() * .24;
      fish.scale.set(size * 1.45, size, 1);
      school.add(fish);
      members.push({ fish, baseX: fish.position.x, phase: Math.random() * Math.PI * 2 });
    }
    school.position.set((Math.random() - .5) * 7.5, -1.02, -88 + s * 23);
    world.add(school);
    fishSchools.push({ group: school, members, baseX: school.position.x, span: 158, phase: s * 1.3 });
  }

  // Water splashes echo the foreground action in the supplied reference.
  for (let i = 0; i < 6; i++) {
    const splash = new THREE.Sprite(splashMaterial.clone());
    splash.position.set((Math.random() - .5) * 8, -1.0, -78 + i * 27);
    const size = 1.5 + Math.random() * .8;
    splash.scale.set(size, size, 1);
    splash.material.opacity = .42 + Math.random() * .3;
    world.add(splash);
    waterSplashes.push({ sprite: splash, baseScale: size, phase: Math.random() * Math.PI * 2, span: 162 });
  }
}

addLivingWorld();

class SoundEngine {
  constructor() {
    this.context = null;
    this.lastShot = 0;
  }
  unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.context = new AudioContext();
    }
    this.context?.resume();
  }
  tone(frequency, duration, type = 'square', volume = .025, sweep = 0) {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (sweep) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + sweep), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
  shoot() {
    const now = performance.now();
    if (now - this.lastShot < 95) return;
    this.lastShot = now;
    this.tone(560, .055, 'square', .012, 250);
  }
  explosion(big = false) { this.tone(big ? 90 : 130, big ? .55 : .26, 'sawtooth', big ? .06 : .035, -55); }
  pickup() { this.tone(420, .18, 'sine', .04, 720); }
  hurt() { this.tone(170, .4, 'sawtooth', .05, -90); }
  bomb() { this.tone(75, .9, 'sawtooth', .075, -35); }
}

const sound = new SoundEngine();
const input = { keys: new Set(), fire: false, stickX: 0, stickY: 0, pointerTarget: null };
const playerBullets = [];
const enemyBullets = [];
const enemies = [];
const powerUps = [];
const explosions = [];
const weaponEffects = [];
const missiles = [];

let state = 'ready';
let player = null;
let boss = null;
let score = 0;
let highScore = Number(localStorage.getItem('thunder-strike-high-score') || 0);
let lives = GAME_CONFIG.startingLives;
let bombs = GAME_CONFIG.startingBombs;
let weaponLevel = 1;
let weaponMode = 'vulcan';
let bombSequence = null;
let kills = 0;
let elapsed = 0;
let shootTimer = 0;
let shake = 0;
let bossSpawned = false;
let waveCursor = 0;
let invulnerable = 0;
let introTimer = 0;
let backgroundSpeed = GAME_CONFIG.scrollSpeed;
const BOSS_TIME = QA_BOSS_MODE ? 3.5 : GAME_CONFIG.stageDuration;

ui.highScore.textContent = String(highScore).padStart(7, '0');

const wavePlan = [
  { time: 1.2, type: 'scout', count: 6, formation: 'vee' },
  { time: 4.8, type: 'scout', count: 7, formation: 'left' },
  { time: 8.6, type: 'ace', count: 5, formation: 'right' },
  { time: 12.5, type: 'scout', count: 9, formation: 'cross' },
  { time: 17, type: 'gunship', count: 3, formation: 'line' },
  { time: 21, type: 'scout', count: 10, formation: 'vee' },
  { time: 25.5, type: 'ace', count: 7, formation: 'cross' },
  { time: 30, type: 'gunship', count: 4, formation: 'line' },
  { time: 34, type: 'scout', count: 12, formation: 'left' },
  { time: 39, type: 'ace', count: 9, formation: 'vee' },
  { time: 44, type: 'gunship', count: 4, formation: 'line' },
];

function enemyStats(type) {
  if (type === 'gunship') return { hp: 32, speed: 2.15 * GAME_CONFIG.enemySpeedMultiplier, radius: 1.15, points: 650, fire: 2.15 };
  if (type === 'ace') return { hp: 15, speed: 4.25 * GAME_CONFIG.enemySpeedMultiplier, radius: .72, points: 380, fire: 2.3 };
  return { hp: 9, speed: 3.45 * GAME_CONFIG.enemySpeedMultiplier, radius: .65, points: 200, fire: 2.8 };
}

function spawnEnemy(type, x, z, delay = 0) {
  const stats = enemyStats(type);
  const enemy = {
    mesh: createEnemyShip(type), type, hp: stats.hp, maxHp: stats.hp, speed: stats.speed,
    radius: stats.radius * GAME_CONFIG.aircraftScale, points: stats.points, fireRate: stats.fire, fireTimer: .8 + Math.random() * 1.4,
    age: -delay, baseX: x, phase: Math.random() * Math.PI * 2, dead: false,
  };
  enemy.mesh.position.set(x, .2, z - delay * stats.speed);
  dynamicLayer.add(enemy.mesh);
  enemies.push(enemy);
}

function spawnWave(wave) {
  // Every formation reserves a wide, alternating escape lane. Enemies may
  // arrive in multiple rows, but never occupy the reserved corridor.
  const safeGap = [-4, 0, 4, 0][waveCursor % 4];
  const lanes = [-8, -6, -4, -2, 0, 2, 4, 6, 8].filter((lane) => Math.abs(lane - safeGap) >= 2.6);
  for (let i = 0; i < wave.count; i++) {
    const laneIndex = i % lanes.length;
    const row = Math.floor(i / lanes.length);
    const orderedIndex = wave.formation === 'right' ? lanes.length - 1 - laneIndex : laneIndex;
    const x = lanes[orderedIndex];
    const delay = row * .72 + laneIndex * .09;
    spawnEnemy(wave.type, x, -13, delay);
  }
  if (wave.type === 'gunship') showToast('WARNING · HEAVY UNITS');
}

function spawnBoss() {
  bossSpawned = true;
  state = 'boss';
  const bossHealth = QA_BOSS_MODE ? 72 : 820;
  boss = {
    mesh: createBossShip(), hp: bossHealth, maxHp: bossHealth, radius: 3.45 * GAME_CONFIG.aircraftScale, age: 0, entered: false,
    fireTimer: 1.4, salvo: 0, dead: false,
  };
  boss.mesh.position.set(0, .2, -15);
  dynamicLayer.add(boss.mesh);
  ui.bossUI.classList.add('visible');
  ui.stageStatus.textContent = '旗舰交战';
  showToast('WARNING · BOSS APPROACHING');
  sound.tone(110, 1.2, 'sawtooth', .045, -25);
}

function spawnPlayerBullet(x, z, angle = 0, damage = 4) {
  const bulletMesh = mesh(shared.playerBulletGeometry, shared.playerBulletMaterial, false);
  bulletMesh.position.set(x, .25, z);
  bulletMesh.rotation.y = -angle;
  dynamicLayer.add(bulletMesh);
  playerBullets.push({ mesh: bulletMesh, vx: Math.sin(angle) * GAME_CONFIG.playerBulletSpeed, vz: -Math.cos(angle) * GAME_CONFIG.playerBulletSpeed, radius: .16, damage });
}

function addWeaponEffect(object, life, grow = false) {
  effectsLayer.add(object);
  weaponEffects.push({ object, life, maxLife: life, grow });
}

function damageBoss(amount) {
  if (!boss || !boss.entered) return;
  boss.hp -= amount;
  ui.bossBar.style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
  if (boss.hp <= 0) destroyBoss();
}

function fireLaser(x, z) {
  const beamLength = 22;
  const group = new THREE.Group();
  const glow = mesh(new THREE.BoxGeometry(.46 + weaponLevel * .08, .08, beamLength), new THREE.MeshBasicMaterial({ color: 0xff3c91, transparent: true, opacity: .36, blending: THREE.AdditiveBlending, toneMapped: false }), false);
  const core = mesh(new THREE.BoxGeometry(.13 + weaponLevel * .025, .11, beamLength), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, toneMapped: false }), false);
  group.add(glow, core);
  group.position.set(x, .38, z - beamLength / 2);
  addWeaponEffect(group, .12);

  const width = .42 + weaponLevel * .14;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const target = enemies[i];
    if (target.age >= 0 && target.mesh.position.z < z && Math.abs(target.mesh.position.x - x) < width + target.radius) {
      target.hp -= 7 + weaponLevel * 3;
      if (target.hp <= 0) destroyEnemy(target, i);
    }
  }
  if (boss && boss.entered && Math.abs(boss.mesh.position.x - x) < width + boss.radius) damageBoss(6 + weaponLevel * 3);
  sound.tone(930, .07, 'sawtooth', .016, -250);
}

function lightningSegment(points, from, to) {
  const segments = 7;
  for (let i = points.length ? 1 : 0; i <= segments; i++) {
    const ratio = i / segments;
    const edgeFade = Math.sin(ratio * Math.PI);
    points.push(new THREE.Vector3(
      THREE.MathUtils.lerp(from.x, to.x, ratio) + (Math.random() - .5) * .58 * edgeFade,
      .55 + Math.random() * .22,
      THREE.MathUtils.lerp(from.z, to.z, ratio) + (Math.random() - .5) * .34 * edgeFade,
    ));
  }
}

function createLightningTube(points, radius, color, opacity, radialSegments = 5) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, Math.max(10, points.length * 2), radius, radialSegments, false);
  return mesh(geometry, new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), false);
}

function fireLightning(x, z) {
  const origin = new THREE.Vector3(x, .55, z - .55);
  const targets = enemies
    .filter((enemy) => enemy.age >= 0 && enemy.mesh.position.z < z)
    .sort((a, b) => a.mesh.position.distanceToSquared(origin) - b.mesh.position.distanceToSquared(origin))
    .slice(0, 2 + weaponLevel);
  if (boss?.entered) targets.push(boss);
  const positions = [origin.clone()];
  let from = origin;
  if (!targets.length) {
    lightningSegment(positions, from, new THREE.Vector3(x + (Math.random() - .5) * 2, .5, -9));
  } else {
    targets.forEach((target) => {
      const to = target.mesh.position.clone();
      lightningSegment(positions, from, to);
      from = to;
    });
  }
  const boltGroup = new THREE.Group();
  const auraBolt = createLightningTube(positions, .24 + weaponLevel * .035, 0x655dff, .2, 6);
  const glowBolt = createLightningTube(positions, .13 + weaponLevel * .025, 0x8b92ff, .62, 6);
  const coreBolt = createLightningTube(positions, .047 + weaponLevel * .012, 0xffffff, 1, 6);
  coreBolt.position.y = .035;

  // Thin forked arcs reproduce the tree-like branching visible in a real strike.
  const branchCount = 5 + weaponLevel * 2;
  for (let branchIndex = 0; branchIndex < branchCount; branchIndex++) {
    const anchorIndex = 1 + Math.floor(Math.random() * Math.max(1, positions.length - 2));
    const anchor = positions[anchorIndex].clone();
    const previous = positions[Math.max(0, anchorIndex - 1)];
    const next = positions[Math.min(positions.length - 1, anchorIndex + 1)];
    const tangent = next.clone().sub(previous).normalize();
    const side = branchIndex % 2 ? 1 : -1;
    const length = 1.15 + Math.random() * (1.65 + weaponLevel * .28);
    const end = anchor.clone().add(new THREE.Vector3(
      side * length * (.62 + Math.random() * .42),
      (Math.random() - .5) * .18,
      tangent.z * length * .35 + (Math.random() - .5) * 1.1,
    ));
    const branchPoints = [anchor];
    for (let step = 1; step <= 4; step++) {
      const ratio = step / 4;
      branchPoints.push(anchor.clone().lerp(end, ratio).add(new THREE.Vector3(
        (Math.random() - .5) * .3 * Math.sin(ratio * Math.PI),
        (Math.random() - .5) * .12,
        (Math.random() - .5) * .28 * Math.sin(ratio * Math.PI),
      )));
    }
    boltGroup.add(
      createLightningTube(branchPoints, .055 + weaponLevel * .008, 0x6f75ff, .34, 4),
      createLightningTube(branchPoints, .018 + weaponLevel * .004, 0xe9efff, .88, 4),
    );
  }

  // A white-violet burst marks every impact point like the flash in the reference.
  const impactPositions = targets.length
    ? targets.map((target) => target.mesh.position.clone())
    : [positions[positions.length - 1].clone()];
  impactPositions.forEach((impact) => {
    const flash = mesh(new THREE.SphereGeometry(.28 + weaponLevel * .05, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .92, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), false);
    flash.position.copy(impact);
    const halo = mesh(new THREE.SphereGeometry(.58 + weaponLevel * .08, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7776ff, transparent: true, opacity: .2, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), false);
    halo.position.copy(impact);
    boltGroup.add(halo, flash);
  });

  boltGroup.add(auraBolt, glowBolt, coreBolt);
  addWeaponEffect(boltGroup, .32);

  targets.forEach((target) => {
    if (target === boss) {
      damageBoss(7 + weaponLevel * 4);
    } else {
      const index = enemies.indexOf(target);
      if (index < 0) return;
      target.hp -= 9 + weaponLevel * 4;
      if (target.hp <= 0) destroyEnemy(target, index);
    }
  });
  shake = Math.max(shake, .12);
  sound.tone(250, .12, 'square', .025, 850);
}

function playerShoot() {
  if (!player || !player.mesh.visible) return;
  const { x, z } = player.mesh.position;
  if (weaponMode === 'laser') {
    fireLaser(x, z);
  } else if (weaponMode === 'lightning') {
    fireLightning(x, z);
  } else if (weaponMode === 'spread') {
    const count = 5 + weaponLevel * 2;
    const arc = .62 + weaponLevel * .1;
    for (let i = 0; i < count; i++) {
      const angle = count === 1 ? 0 : -arc / 2 + (i / (count - 1)) * arc;
      spawnPlayerBullet(x, z - .9, angle, 3 + weaponLevel);
    }
    sound.tone(480, .07, 'triangle', .018, 180);
  } else if (weaponLevel === 1) {
    spawnPlayerBullet(x - .35, z - 1.1);
    spawnPlayerBullet(x + .35, z - 1.1);
  } else if (weaponLevel === 2) {
    spawnPlayerBullet(x, z - 1.25, 0, 5);
    spawnPlayerBullet(x - .52, z - .9, -.12);
    spawnPlayerBullet(x + .52, z - .9, .12);
  } else {
    [-.25, -.12, 0, .12, .25].forEach((angle, index) => spawnPlayerBullet(x + (index - 2) * .25, z - 1, angle, 5));
  }
  if (weaponMode === 'vulcan') sound.shoot();
}

function spawnEnemyBullet(x, z, vx, vz, bossShot = false) {
  const bulletMesh = mesh(shared.enemyBulletGeometry, bossShot ? shared.bossBulletMaterial : shared.enemyBulletMaterial, false);
  bulletMesh.position.set(x, .12, z);
  const scale = bossShot ? 1.15 : 1;
  bulletMesh.scale.setScalar(scale);
  dynamicLayer.add(bulletMesh);
  enemyBullets.push({ mesh: bulletMesh, vx, vz, radius: bossShot ? .17 : .13 });
}

function aimAtPlayer(x, z, speed, spread = 0) {
  if (!player) return { vx: 0, vz: speed };
  const angle = Math.atan2(player.mesh.position.x - x, player.mesh.position.z - z) + spread;
  return { vx: Math.sin(angle) * speed, vz: Math.cos(angle) * speed };
}

function enemyShoot(enemy) {
  const { x, z } = enemy.mesh.position;
  if (enemy.type === 'gunship') {
    // Twin shots deliberately leave the player's current line open.
    [-.24, .24].forEach((spread) => {
      const velocity = aimAtPlayer(x, z, 3.9, spread);
      spawnEnemyBullet(x, z + .8, velocity.vx, velocity.vz);
    });
  } else {
    const velocity = aimAtPlayer(x, z, enemy.type === 'ace' ? 4.8 : 4.1);
    spawnEnemyBullet(x, z + .55, velocity.vx, velocity.vz);
  }
}

function bossShoot() {
  if (!boss) return;
  const { x, z } = boss.mesh.position;
  const ratio = boss.hp / boss.maxHp;
  boss.salvo += 1;
  if (boss.salvo % 3 === 0) {
    const count = ratio < .45 ? 16 : 11;
    const safeAngle = player ? Math.atan2(player.mesh.position.x - x, player.mesh.position.z - z) : 0;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + boss.age * .35;
      const distanceFromSafeLane = Math.atan2(Math.sin(angle - safeAngle), Math.cos(angle - safeAngle));
      if (Math.abs(distanceFromSafeLane) < .56) continue;
      const speed = ratio < .45 ? 4.2 : 3.5;
      spawnEnemyBullet(x, z, Math.sin(angle) * speed, Math.cos(angle) * speed, true);
    }
  } else {
    // Aimed salvos split around the player instead of placing a bullet on them.
    const spreads = ratio < .45 ? [-.5, -.28, .28, .5] : [-.3, .3];
    spreads.forEach((spread) => {
      const velocity = aimAtPlayer(x, z, ratio < .45 ? 5.6 : 4.8, spread);
      spawnEnemyBullet(x + Math.sign(spread) * 1.9, z + 1.5, velocity.vx, velocity.vz, true);
    });
  }
}

function createExplosion(position, color = 0xff8c43, count = 16, size = .18) {
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y + .2;
    positions[i * 3 + 2] = position.z;
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.6 + Math.random() * 4.2;
    velocities.push(new THREE.Vector3(Math.cos(angle) * speed, Math.random() * 2.5, Math.sin(angle) * speed));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  effectsLayer.add(points);
  explosions.push({ points, velocities, life: .72, maxLife: .72 });
}

function createMushroomCloud(position) {
  const cloud = new THREE.Group();
  const hot = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: .96, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const fire = new THREE.MeshBasicMaterial({ color: 0xff7a1f, transparent: true, opacity: .86, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const ember = new THREE.MeshBasicMaterial({ color: 0xb92d12, transparent: true, opacity: .72, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

  const stem = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const puff = mesh(new THREE.SphereGeometry(.38 + i * .035, 10, 7), i % 3 === 0 ? hot : fire, false);
    puff.position.set((Math.random() - .5) * .28, .25 + i * .09, -.2 - i * .34 + (Math.random() - .5) * .12);
    puff.scale.set(.78 + Math.random() * .25, 1.08, .78 + Math.random() * .25);
    stem.add(puff);
  }
  cloud.add(stem);

  const cap = new THREE.Group();
  cap.position.set(0, .95, -2.62);
  const capCore = mesh(new THREE.SphereGeometry(.86, 16, 10), hot, false);
  capCore.scale.set(2.2, .68, 1.72);
  cap.add(capCore);
  for (let i = 0; i < 13; i++) {
    const angle = i / 13 * Math.PI * 2;
    const radius = 1.05 + Math.random() * .38;
    const lobe = mesh(new THREE.SphereGeometry(.48 + Math.random() * .22, 10, 7), i % 2 ? fire : ember, false);
    lobe.position.set(Math.cos(angle) * radius, (Math.random() - .5) * .32, Math.sin(angle) * radius * .76);
    lobe.scale.set(1.18, .7, 1.02);
    cap.add(lobe);
  }
  cloud.add(cap);

  const shockRing = mesh(new THREE.RingGeometry(.52, .78, 64), new THREE.MeshBasicMaterial({ color: 0xffd76b, transparent: true, opacity: .88, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), false);
  shockRing.rotation.x = -Math.PI / 2;
  shockRing.position.y = .08;
  cloud.add(shockRing);
  const flashLight = new THREE.PointLight(0xff7a25, 11, 20, 2);
  flashLight.position.set(0, 1.5, -1.45);
  cloud.add(flashLight);

  cloud.position.copy(position);
  cloud.userData.mushroom = { cap, stem, shockRing, flashLight, baseY: position.y };
  addWeaponEffect(cloud, 1.9);
}

function spawnPowerUp(position, type = 'spread') {
  const item = { mesh: createPowerUp(type), type, age: 0, radius: .58 };
  item.mesh.position.copy(position);
  item.mesh.position.y = .35;
  dynamicLayer.add(item.mesh);
  powerUps.push(item);
}

function removeAt(array, index) {
  const item = array[index];
  if (item?.mesh) dynamicLayer.remove(item.mesh);
  array.splice(index, 1);
}

function destroyEnemy(enemy, index, award = true) {
  if (enemy.dead) return;
  enemy.dead = true;
  createExplosion(enemy.mesh.position, enemy.type === 'gunship' ? 0xffb23e : 0xff643e, enemy.type === 'gunship' ? 28 : 15, enemy.type === 'gunship' ? .25 : .18);
  sound.explosion(enemy.type === 'gunship');
  shake = Math.max(shake, enemy.type === 'gunship' ? .25 : .1);
  if (award) {
    score += enemy.points;
    kills += 1;
    if (kills % 13 === 0) {
      spawnPowerUp(enemy.mesh.position, 'bomb');
    } else if (Math.random() < .24 || kills % 6 === 0) {
      spawnPowerUp(enemy.mesh.position, SPECIAL_WEAPONS[Math.floor(Math.random() * SPECIAL_WEAPONS.length)]);
    }
  }
  removeAt(enemies, index);
  updateHUD();
}

function createMissile() {
  const group = new THREE.Group();
  const bombWhite = new THREE.MeshStandardMaterial({ color: 0xf3f0e7, metalness: .34, roughness: .2 });
  const bombRed = new THREE.MeshStandardMaterial({ color: 0xb51f1d, metalness: .28, roughness: .25 });
  const bombDark = new THREE.MeshStandardMaterial({ color: 0x393d3e, metalness: .72, roughness: .26 });
  const body = mesh(new THREE.SphereGeometry(.31, 14, 10), bombWhite, false);
  body.scale.set(.92, .78, 1.72);
  group.add(body);
  const noseCap = mesh(new THREE.SphereGeometry(.22, 12, 8), bombRed, false);
  noseCap.scale.set(.88, .72, .48);
  noseCap.position.z = -.5;
  group.add(noseCap);
  const tail = mesh(new THREE.CylinderGeometry(.16, .24, .38, 10), bombDark, false);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = .57;
  group.add(tail);
  const rearBand = mesh(new THREE.CylinderGeometry(.255, .255, .13, 12), bombRed, false);
  rearBand.rotation.x = Math.PI / 2;
  rearBand.position.z = .48;
  group.add(rearBand);
  const horizontalFin = mesh(new THREE.BoxGeometry(.84, .055, .48), bombWhite, false);
  horizontalFin.position.z = .72;
  group.add(horizontalFin);
  const verticalFin = mesh(new THREE.BoxGeometry(.055, .64, .48), bombWhite, false);
  verticalFin.position.z = .72;
  group.add(verticalFin);
  [-1, 1].forEach((side) => {
    const finMark = mesh(new THREE.BoxGeometry(.17, .065, .3), bombRed, false);
    finMark.position.set(side * .3, .035, .77);
    group.add(finMark);
  });
  const flame = mesh(new THREE.ConeGeometry(.13, .48, 8), new THREE.MeshBasicMaterial({ color: 0xffb23e, transparent: true, opacity: .88, toneMapped: false }), false);
  flame.rotation.x = Math.PI / 2;
  flame.position.z = 1.08;
  group.add(flame);
  group.scale.setScalar(1.28);
  return group;
}

function launchScreenMissiles() {
  const targetPositions = [
    [-7, -7], [-3.5, -5], [0, -8], [3.5, -5], [7, -7],
    [-6, 0], [-2, -1], [2, -1], [6, 0],
  ];
  targetPositions.forEach(([tx, tz], index) => {
    const missile = createMissile();
    const start = new THREE.Vector3(player.mesh.position.x + (index - 4) * .13, .45, player.mesh.position.z + .25);
    const target = new THREE.Vector3(tx, .25, tz);
    missile.position.copy(start);
    effectsLayer.add(missile);
    missiles.push({ mesh: missile, start, target, age: -index * .035, duration: .5 + Math.random() * .18 });
  });
}

function detonateScreenBomb() {
  ui.damageFlash.classList.remove('bomb');
  void ui.damageFlash.offsetWidth;
  ui.damageFlash.classList.add('bomb');
  while (enemyBullets.length) removeAt(enemyBullets, enemyBullets.length - 1);
  for (let i = enemies.length - 1; i >= 0; i--) {
    enemies[i].hp -= 85;
    if (enemies[i].hp <= 0) destroyEnemy(enemies[i], i);
  }
  if (boss) damageBoss(180);
  // Keep the nuclear silhouette near the visual center instead of hiding it beneath the player at the bottom edge.
  const blastPosition = new THREE.Vector3(0, .25, 1.2);
  const ring = mesh(new THREE.RingGeometry(.35, .62, 64), new THREE.MeshBasicMaterial({ color: 0xffc347, transparent: true, opacity: .72, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), false);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(blastPosition);
  addWeaponEffect(ring, .72, true);
  createMushroomCloud(blastPosition);
  createExplosion(blastPosition, 0xffc24f, 145, .46);
  createExplosion(blastPosition.clone().add(new THREE.Vector3(0, 1.3, 0)), 0xff5426, 90, .34);
  sound.explosion(true);
  shake = 2.65;
}

function useBomb() {
  if ((state !== 'playing' && state !== 'boss') || bombs <= 0 || !player || bombSequence) return;
  bombs -= 1;
  updateHUD();
  sound.bomb();
  shake = .65;
  while (enemyBullets.length) removeAt(enemyBullets, enemyBullets.length - 1);
  launchScreenMissiles();
  bombSequence = { timer: .68 };
  invulnerable = Math.max(invulnerable, 1.8);
  showToast('MISSILE STORM · FULL SCREEN');
}

function hitPlayer() {
  if (!player || invulnerable > 0 || state === 'gameover' || state === 'victory') return;
  lives -= 1;
  invulnerable = 3.5;
  while (enemyBullets.length) removeAt(enemyBullets, enemyBullets.length - 1);
  sound.hurt();
  createExplosion(player.mesh.position, 0x61ffe5, 34, .26);
  shake = .8;
  flashDamage();
  updateHUD();
  if (lives <= 0) {
    player.mesh.visible = false;
    finishGame(false);
  } else {
    player.mesh.position.set(0, .2, 7.2);
    weaponLevel = Math.max(1, weaponLevel - 1);
    showToast('SHIP LOST · WEAPON DOWN');
  }
}

function destroyBoss() {
  if (!boss || boss.dead) return;
  boss.dead = true;
  score += 25000;
  kills += 1;
  const position = boss.mesh.position.clone();
  for (let i = 0; i < 8; i++) {
    const offset = new THREE.Vector3((Math.random() - .5) * 6, Math.random() * 1.5, (Math.random() - .5) * 3);
    setTimeout(() => createExplosion(position.clone().add(offset), i % 2 ? 0xff4b35 : 0xffbd53, 35, .35), i * 120);
  }
  sound.explosion(true);
  shake = 1.8;
  dynamicLayer.remove(boss.mesh);
  boss = null;
  ui.bossUI.classList.remove('visible');
  updateHUD();
  setTimeout(() => finishGame(true), 1900);
}

function clearDynamicObjects() {
  [...playerBullets, ...enemyBullets, ...enemies, ...powerUps].forEach((item) => item.mesh && dynamicLayer.remove(item.mesh));
  playerBullets.length = 0;
  enemyBullets.length = 0;
  enemies.length = 0;
  powerUps.length = 0;
  explosions.forEach((item) => effectsLayer.remove(item.points));
  explosions.length = 0;
  weaponEffects.forEach((item) => effectsLayer.remove(item.object));
  weaponEffects.length = 0;
  missiles.forEach((item) => effectsLayer.remove(item.mesh));
  missiles.length = 0;
  bombSequence = null;
  if (boss?.mesh) dynamicLayer.remove(boss.mesh);
  if (player?.mesh) dynamicLayer.remove(player.mesh);
  boss = null;
}

function beginGame() {
  sound.unlock();
  clearDynamicObjects();
  state = 'playing';
  score = 0;
  lives = GAME_CONFIG.startingLives;
  bombs = GAME_CONFIG.startingBombs;
  weaponLevel = QA_WEAPON_MODE ? 3 : 1;
  weaponMode = QA_WEAPON_MODE || 'vulcan';
  kills = 0;
  elapsed = 0;
  waveCursor = 0;
  bossSpawned = false;
  invulnerable = 2.0;
  shootTimer = 0;
  backgroundSpeed = GAME_CONFIG.scrollSpeed;
  player = { mesh: createPlayerShip(), radius: .62 * GAME_CONFIG.aircraftScale };
  player.mesh.position.set(0, .2, 7.2);
  dynamicLayer.add(player.mesh);
  ui.start.classList.remove('active');
  ui.result.classList.remove('active');
  ui.pause.classList.remove('active');
  ui.bossUI.classList.remove('visible');
  document.body.className = 'playing';
  ui.stageStatus.textContent = '峡谷突进';
  updateHUD();
  ui.waveTitle.classList.remove('show');
  void ui.waveTitle.offsetWidth;
  ui.waveTitle.classList.add('show');
}

function togglePause(forceResume = false) {
  if (forceResume && state === 'paused') {
    state = boss ? 'boss' : 'playing';
    ui.pause.classList.remove('active');
    document.body.className = 'playing';
    return;
  }
  if (state === 'playing' || state === 'boss') {
    state = 'paused';
    input.fire = false;
    ui.pause.classList.add('active');
    document.body.className = 'paused';
  } else if (state === 'paused') {
    state = boss ? 'boss' : 'playing';
    ui.pause.classList.remove('active');
    document.body.className = 'playing';
  }
}

function finishGame(won) {
  if (state === 'victory' || state === 'gameover') return;
  state = won ? 'victory' : 'gameover';
  input.fire = false;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('thunder-strike-high-score', String(highScore));
  }
  const grade = won ? (lives === GAME_CONFIG.startingLives ? 'S' : lives >= 3 ? 'A' : 'B') : 'D';
  ui.resultKicker.textContent = won ? 'MISSION COMPLETE' : 'MISSION FAILED';
  ui.resultTitle.textContent = won ? '第一关完成' : '战机损毁';
  ui.resultMessage.textContent = won ? '敌军母舰已摧毁，海岸防线重新开放。' : '防线仍在等待你。整备战机，再次出击。';
  ui.resultScore.textContent = String(score).padStart(7, '0');
  ui.resultKills.textContent = String(kills).padStart(2, '0');
  ui.resultGrade.textContent = grade;
  ui.result.classList.add('active');
  ui.bossUI.classList.remove('visible');
  document.body.className = '';
  updateHUD();
}

function updateHUD() {
  ui.score.textContent = String(score).padStart(7, '0');
  ui.highScore.textContent = String(Math.max(score, highScore)).padStart(7, '0');
  ui.lives.textContent = lives > 0 ? Array(lives).fill('◆').join(' ') : '—';
  ui.bombs.textContent = bombs > 0 ? Array(bombs).fill('●').join(' ') : '—';
  ui.weapon.textContent = `${WEAPON_DATA[weaponMode].label} · ${['I', 'II', 'III'][weaponLevel - 1]}`;
  ui.progress.style.width = `${Math.min(100, elapsed / BOSS_TIME * 100)}%`;
  if (boss) ui.bossBar.style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
}

function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.remove('show');
  void ui.toast.offsetWidth;
  ui.toast.classList.add('show');
}

function flashDamage() {
  ui.damageFlash.classList.remove('flash');
  void ui.damageFlash.offsetWidth;
  ui.damageFlash.classList.add('flash');
}

function updateBackground(dt) {
  const speed = (state === 'ready' || state === 'victory' || state === 'gameover' ? 1.8 : backgroundSpeed) * dt;
  scenery.forEach((item) => {
    item.mesh.position.z += speed * (item.multiplier || 1);
    if (item.mesh.position.z > (item.wrapAt ?? 31)) item.mesh.position.z -= item.span;
  });
}

function updateEcology(dt) {
  ecosystemTime += dt;
  const scrollSpeed = state === 'ready' || state === 'victory' || state === 'gameover' ? 1.8 : backgroundSpeed;

  birdFlocks.forEach((flock) => {
    flock.group.position.z += scrollSpeed * .72 * dt;
    flock.group.position.x += flock.drift * dt;
    if (flock.group.position.z > 31) flock.group.position.z -= flock.span;
    if (flock.group.position.x > 11.5) flock.group.position.x = -11.5;
    if (flock.group.position.x < -11.5) flock.group.position.x = 11.5;
    flock.members.forEach((member, index) => {
      const flap = Math.sin(ecosystemTime * 9 + member.phase + index * .28);
      member.bird.material = flap > 0 ? flock.up : flock.down;
      member.bird.position.y = Math.sin(ecosystemTime * 2.7 + member.phase) * .08;
    });
  });

  fishSchools.forEach((school) => {
    school.group.position.z += scrollSpeed * .9 * dt;
    if (school.group.position.z > 31) school.group.position.z -= school.span;
    school.group.position.x = school.baseX + Math.sin(ecosystemTime * 1.25 + school.phase) * 1.35;
    school.members.forEach((member, index) => {
      member.fish.position.x = member.baseX + Math.sin(ecosystemTime * 3.2 + member.phase) * .18;
      member.fish.position.y = Math.sin(ecosystemTime * 2.8 + index) * .035;
      member.fish.material.rotation = Math.sin(ecosystemTime * 2.1 + member.phase) * .09;
    });
  });

  waterSplashes.forEach((splash) => {
    splash.sprite.position.z += scrollSpeed * .86 * dt;
    if (splash.sprite.position.z > 31) splash.sprite.position.z -= splash.span;
    const pulse = .86 + Math.sin(ecosystemTime * 2.4 + splash.phase) * .14;
    splash.sprite.scale.setScalar(splash.baseScale * pulse);
    splash.sprite.material.opacity = .42 + (Math.sin(ecosystemTime * 2.4 + splash.phase) + 1) * .14;
  });
}

function updatePlayer(dt) {
  // Visibility is also used for the invulnerability blink. The player must keep
  // updating while a blink frame is hidden, otherwise the timer can never end.
  if (!player) return;
  let xAxis = input.stickX;
  let zAxis = input.stickY;
  if (input.keys.has('ArrowLeft') || input.keys.has('KeyA')) xAxis -= 1;
  if (input.keys.has('ArrowRight') || input.keys.has('KeyD')) xAxis += 1;
  if (input.keys.has('ArrowUp') || input.keys.has('KeyW')) zAxis -= 1;
  if (input.keys.has('ArrowDown') || input.keys.has('KeyS')) zAxis += 1;
  const length = Math.hypot(xAxis, zAxis);
  if (length > 1) { xAxis /= length; zAxis /= length; }

  const speed = GAME_CONFIG.playerSpeed;
  if (input.pointerTarget) {
    player.mesh.position.x += (input.pointerTarget.x - player.mesh.position.x) * Math.min(1, dt * 10);
    player.mesh.position.z += (input.pointerTarget.z - player.mesh.position.z) * Math.min(1, dt * 10);
  } else {
    player.mesh.position.x += xAxis * speed * dt;
    player.mesh.position.z += zAxis * speed * dt;
  }
  player.mesh.position.x = THREE.MathUtils.clamp(player.mesh.position.x, -9.1, 9.1);
  player.mesh.position.z = THREE.MathUtils.clamp(player.mesh.position.z, -7.2, 9.1);
  player.mesh.rotation.z += (-xAxis * .28 - player.mesh.rotation.z) * Math.min(1, dt * 9);
  player.mesh.rotation.x += (zAxis * .1 - player.mesh.rotation.x) * Math.min(1, dt * 8);
  player.mesh.userData.thrusters?.forEach((thruster, index) => {
    const pulse = 1 + Math.sin(elapsed * 34 + index * 1.7) * .22;
    thruster.scale.set(pulse, 1 + Math.abs(xAxis) * .22, 1.18 + Math.abs(zAxis) * .35);
  });
  if (player.mesh.userData.propeller) {
    player.mesh.userData.propeller.rotation.z += dt * (42 + Math.abs(zAxis) * 9);
  }

  shootTimer -= dt;
  // Main weapons fire continuously during combat. Bomb input is handled on its
  // own channel, so launching the missile storm never interrupts the gun cycle.
  if (shootTimer <= 0) {
    playerShoot();
    if (weaponMode === 'lightning') shootTimer = .27 - weaponLevel * .035;
    else if (weaponMode === 'laser') shootTimer = .13 - weaponLevel * .015;
    else if (weaponMode === 'spread') shootTimer = .17 - weaponLevel * .018;
    else shootTimer = weaponLevel === 3 ? GAME_CONFIG.maximumFireInterval : GAME_CONFIG.normalFireInterval;
  }
  if (invulnerable > 0) {
    invulnerable -= dt;
    player.mesh.visible = Math.floor(invulnerable * 12) % 2 === 0;
  } else {
    player.mesh.visible = true;
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    enemy.age += dt;
    if (enemy.age < 0) continue;
    const m = enemy.mesh;
    // Enemy aircraft commit to a single lane and only travel downward.
    m.position.x = enemy.baseX;
    m.position.z += enemy.speed * dt;
    m.rotation.z += (0 - m.rotation.z) * Math.min(1, dt * 10);
    enemy.fireTimer -= dt;
    if (enemy.fireTimer <= 0 && m.position.z > -8 && m.position.z < 5) {
      enemyShoot(enemy);
      enemy.fireTimer = enemy.fireRate + Math.random() * .8;
    }
    if (m.position.z > 13) removeAt(enemies, i);
  }
}

function updateBoss(dt) {
  if (!boss) return;
  boss.age += dt;
  const eyePulse = .78 + Math.sin(boss.age * 7.5) * .22;
  boss.mesh.userData.eyeGlows?.forEach((eye, index) => {
    eye.material.opacity = .72 + eyePulse * .28;
    eye.scale.set(1.38 + eyePulse * .14, .36 + eyePulse * .07, .76 + eyePulse * .07);
    eye.position.y = 2.48 + Math.sin(boss.age * 7.5 + index * .8) * .035;
  });
  boss.mesh.userData.engineGlows?.forEach((flame, index) => {
    const thrust = 1 + Math.sin(boss.age * 18 + index) * .16;
    flame.scale.set(thrust, thrust, 1 + eyePulse * .24);
  });
  if (!boss.entered) {
    boss.mesh.position.z += 2.2 * dt;
    if (boss.mesh.position.z >= -5.5) {
      boss.mesh.position.z = -5.5;
      boss.entered = true;
    }
  } else {
    boss.mesh.position.x = 0;
    boss.mesh.rotation.z = 0;
    boss.fireTimer -= dt;
    if (boss.fireTimer <= 0) {
      bossShoot();
      boss.fireTimer = boss.hp / boss.maxHp < .45 ? .78 : 1.05;
    }
  }
}

function updateBullets(dt) {
  for (let i = playerBullets.length - 1; i >= 0; i--) {
    const bullet = playerBullets[i];
    bullet.mesh.position.x += bullet.vx * dt;
    bullet.mesh.position.z += bullet.vz * dt;
    if (bullet.mesh.position.z < -14 || Math.abs(bullet.mesh.position.x) > 13) removeAt(playerBullets, i);
  }
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const bullet = enemyBullets[i];
    bullet.mesh.position.x += bullet.vx * dt;
    bullet.mesh.position.z += bullet.vz * dt;
    bullet.mesh.rotation.y += dt * 4;
    if (bullet.mesh.position.z > 13 || bullet.mesh.position.z < -15 || Math.abs(bullet.mesh.position.x) > 13) removeAt(enemyBullets, i);
  }
}

function updatePowerUps(dt) {
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const item = powerUps[i];
    item.age += dt;
    item.mesh.position.z += 2.2 * dt;
    item.mesh.rotation.y += dt * 2.2;
    item.mesh.position.y = .4 + Math.sin(item.age * 4) * .18;
    if (item.mesh.position.z > 12) removeAt(powerUps, i);
  }
}

function updateExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const effect = explosions[i];
    effect.life -= dt;
    const positions = effect.points.geometry.attributes.position;
    for (let j = 0; j < positions.count; j++) {
      positions.setX(j, positions.getX(j) + effect.velocities[j].x * dt);
      positions.setY(j, positions.getY(j) + effect.velocities[j].y * dt);
      positions.setZ(j, positions.getZ(j) + effect.velocities[j].z * dt);
      effect.velocities[j].multiplyScalar(Math.pow(.16, dt));
    }
    positions.needsUpdate = true;
    effect.points.material.opacity = Math.max(0, effect.life / effect.maxLife);
    if (effect.life <= 0) {
      effectsLayer.remove(effect.points);
      effect.points.geometry.dispose();
      effect.points.material.dispose();
      explosions.splice(i, 1);
    }
  }
}

function updateWeaponEffects(dt) {
  for (let i = weaponEffects.length - 1; i >= 0; i--) {
    const effect = weaponEffects[i];
    effect.life -= dt;
    const ratio = Math.max(0, effect.life / effect.maxLife);
    effect.object.traverse((child) => {
      if (!child.material) return;
      if (child.material.userData.baseOpacity === undefined) child.material.userData.baseOpacity = child.material.opacity;
      child.material.opacity = child.material.userData.baseOpacity * ratio;
    });
    if (effect.object.userData.mushroom) {
      const progress = 1 - ratio;
      const { cap, stem, shockRing, flashLight } = effect.object.userData.mushroom;
      cap.position.y = .82 + progress * .56;
      cap.position.z = -2.05 - progress * 1.65;
      cap.scale.setScalar(.58 + progress * 1.05);
      stem.scale.set(.62 + progress * .42, .72 + progress * .38, .35 + progress * 1.08);
      shockRing.scale.setScalar(1 + progress * 12.5);
      shockRing.material.opacity = Math.max(0, (1 - progress) * .82);
      flashLight.intensity = Math.max(0, 11 * ratio * ratio);
      effect.object.rotation.y += dt * .55;
    }
    if (effect.grow) {
      const scale = 1 + (1 - ratio) * 28;
      effect.object.scale.setScalar(scale);
    }
    if (effect.life <= 0) {
      effectsLayer.remove(effect.object);
      effect.object.traverse((child) => {
        child.geometry?.dispose();
        child.material?.dispose();
      });
      weaponEffects.splice(i, 1);
    }
  }
}

function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const missile = missiles[i];
    missile.age += dt;
    if (missile.age < 0) {
      missile.mesh.visible = false;
      continue;
    }
    missile.mesh.visible = true;
    const ratio = Math.min(1, missile.age / missile.duration);
    const eased = 1 - Math.pow(1 - ratio, 2);
    missile.mesh.position.lerpVectors(missile.start, missile.target, eased);
    missile.mesh.position.y += Math.sin(ratio * Math.PI) * 4.2;
    missile.mesh.rotation.y = Math.atan2(missile.target.x - missile.start.x, missile.target.z - missile.start.z);
    missile.mesh.rotation.z = Math.sin(ratio * Math.PI) * .35;
    if (ratio >= 1) {
      createExplosion(missile.target, 0xffa94d, 26, .27);
      effectsLayer.remove(missile.mesh);
      missiles.splice(i, 1);
    }
  }
  if (bombSequence) {
    bombSequence.timer -= dt;
    if (bombSequence.timer <= 0) {
      detonateScreenBomb();
      bombSequence = null;
    }
  }
}

function intersects(a, b, radius) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz < radius * radius;
}

function checkCollisions() {
  for (let b = playerBullets.length - 1; b >= 0; b--) {
    const bullet = playerBullets[b];
    let hit = false;
    for (let e = enemies.length - 1; e >= 0; e--) {
      const enemy = enemies[e];
      if (intersects(bullet.mesh.position, enemy.mesh.position, bullet.radius + enemy.radius)) {
        enemy.hp -= bullet.damage;
        removeAt(playerBullets, b);
        hit = true;
        if (enemy.hp <= 0) destroyEnemy(enemy, e);
        break;
      }
    }
    if (hit) continue;
    if (boss && boss.entered && intersects(bullet.mesh.position, boss.mesh.position, bullet.radius + boss.radius)) {
      boss.hp -= bullet.damage;
      removeAt(playerBullets, b);
      ui.bossBar.style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
      if (boss.hp <= 0) destroyBoss();
    }
  }

  if (!player || invulnerable > 0 || !player.mesh.visible) return;
  for (let b = enemyBullets.length - 1; b >= 0; b--) {
    if (intersects(enemyBullets[b].mesh.position, player.mesh.position, enemyBullets[b].radius + player.radius)) {
      removeAt(enemyBullets, b);
      hitPlayer();
      break;
    }
  }
  for (let e = enemies.length - 1; e >= 0; e--) {
    if (intersects(enemies[e].mesh.position, player.mesh.position, enemies[e].radius + player.radius)) {
      destroyEnemy(enemies[e], e, false);
      hitPlayer();
      break;
    }
  }
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const item = powerUps[i];
    if (intersects(item.mesh.position, player.mesh.position, item.radius + player.radius)) {
      if (SPECIAL_WEAPONS.includes(item.type)) {
        weaponLevel = item.type === weaponMode ? Math.min(3, weaponLevel + 1) : 1;
        weaponMode = item.type;
        score += 1500;
        showToast(`${WEAPON_DATA[item.type].label} · LEVEL ${weaponLevel}`);
      } else {
        bombs = Math.min(GAME_CONFIG.maximumBombs, bombs + 1);
        showToast('BOMB STOCK +1');
      }
      sound.pickup();
      removeAt(powerUps, i);
      updateHUD();
    }
  }
}

function updateCamera(dt) {
  shake *= Math.pow(.035, dt);
  const amount = shake * .18;
  camera.position.set(cameraBase.x + (Math.random() - .5) * amount, cameraBase.y + (Math.random() - .5) * amount, cameraBase.z + (Math.random() - .5) * amount);
}

function updateGame(dt) {
  elapsed += dt;
  while (waveCursor < wavePlan.length && elapsed >= wavePlan[waveCursor].time) {
    spawnWave(wavePlan[waveCursor]);
    waveCursor += 1;
  }
  if (!bossSpawned && elapsed >= BOSS_TIME) spawnBoss();
  updatePlayer(dt);
  updateEnemies(dt);
  updateBoss(dt);
  updateBullets(dt);
  updatePowerUps(dt);
  updateMissiles(dt);
  updateWeaponEffects(dt);
  checkCollisions();
  updateHUD();
}

function updateIdle(dt) {
  introTimer += dt;
  if (!player && state === 'ready') {
    player = { mesh: createPlayerShip(), radius: .62 * GAME_CONFIG.aircraftScale };
    player.mesh.position.set(0, .3, 3.7);
    player.mesh.scale.multiplyScalar(1.18);
    dynamicLayer.add(player.mesh);
  }
  if (player && state === 'ready') {
    player.mesh.position.y = .35 + Math.sin(introTimer * 1.4) * .14;
    player.mesh.rotation.z = Math.sin(introTimer * .7) * .07;
    if (player.mesh.userData.propeller) player.mesh.userData.propeller.rotation.z += dt * 22;
  }
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .04);
  updateBackground(dt);
  updateEcology(dt);
  updateExplosions(dt);
  if (state === 'playing' || state === 'boss') updateGame(dt);
  else if (state === 'ready') updateIdle(dt);
  updateCamera(dt);
  composer.render();
}

function setPointerTarget(event) {
  const ndc = new THREE.Vector2(event.clientX / innerWidth * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
    input.pointerTarget = { x: THREE.MathUtils.clamp(hit.x, -9.1, 9.1), z: THREE.MathUtils.clamp(hit.z, -7.2, 9.1) };
  }
}

ui.startButton.addEventListener('click', beginGame);
ui.restartButton.addEventListener('click', beginGame);
ui.resumeButton.addEventListener('click', () => togglePause(true));

addEventListener('keydown', (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (!event.repeat && event.code === 'KeyP') togglePause();
  if (!event.repeat && (event.code === 'KeyX' || event.code === 'KeyK')) useBomb();
  if (!event.repeat && event.code === 'Enter' && (state === 'ready' || state === 'victory' || state === 'gameover')) beginGame();
  input.keys.add(event.code);
});
addEventListener('keyup', (event) => input.keys.delete(event.code));
addEventListener('blur', () => {
  input.keys.clear();
  input.fire = false;
  if (state === 'playing' || state === 'boss') togglePause();
});

canvas.addEventListener('pointerdown', (event) => {
  if (state !== 'playing' && state !== 'boss') return;
  canvas.setPointerCapture?.(event.pointerId);
  input.fire = true;
  setPointerTarget(event);
});
canvas.addEventListener('pointermove', (event) => {
  if (input.fire && (state === 'playing' || state === 'boss')) setPointerTarget(event);
});
canvas.addEventListener('pointerup', () => { input.fire = false; input.pointerTarget = null; });
canvas.addEventListener('pointercancel', () => { input.fire = false; input.pointerTarget = null; });

const mobileFire = $('#mobile-fire');
const mobileBomb = $('#mobile-bomb');
mobileFire.addEventListener('pointerdown', (event) => { event.stopPropagation(); input.fire = true; });
['pointerup', 'pointercancel', 'pointerleave'].forEach((name) => mobileFire.addEventListener(name, () => { input.fire = false; }));
mobileBomb.addEventListener('pointerdown', (event) => { event.stopPropagation(); useBomb(); });

const stick = $('#stick-zone');
const stickKnob = $('#stick-knob');
let stickPointer = null;
function updateStick(event) {
  const rect = stick.getBoundingClientRect();
  const x = event.clientX - (rect.left + rect.width / 2);
  const y = event.clientY - (rect.top + rect.height / 2);
  const max = rect.width * .34;
  const length = Math.min(max, Math.hypot(x, y));
  const angle = Math.atan2(y, x);
  const dx = Math.cos(angle) * length;
  const dy = Math.sin(angle) * length;
  input.stickX = dx / max;
  input.stickY = dy / max;
  stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}
stick.addEventListener('pointerdown', (event) => { stickPointer = event.pointerId; stick.setPointerCapture?.(event.pointerId); updateStick(event); });
stick.addEventListener('pointermove', (event) => { if (stickPointer === event.pointerId) updateStick(event); });
function resetStick() { stickPointer = null; input.stickX = 0; input.stickY = 0; stickKnob.style.transform = 'translate(-50%, -50%)'; }
stick.addEventListener('pointerup', resetStick);
stick.addEventListener('pointercancel', resetStick);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

window.__THUNDER_STRIKE__ = Object.freeze({
  snapshot: () => ({ state, score, lives, bombs, weaponMode, weaponLevel, kills, elapsed: Number(elapsed.toFixed(2)), enemies: enemies.length, enemyBullets: enemyBullets.length, playerBullets: playerBullets.length, missiles: missiles.length, bossHp: boss?.hp ?? null }),
});

animate();
