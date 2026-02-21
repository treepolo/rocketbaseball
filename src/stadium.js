/**
 * Stadium + Procedural World Builder
 * Night game on a 1:1 ellipsoid Earth with seeded terrain generation
 */
import * as THREE from 'three';

const FIELD = {
    pitcherMoundDist: 60.5, baseDist: 90, infieldDirtRadius: 95,
    moundRadius: 9, moundHeight: 0.833, homePlateToBackstop: 60,
    fenceDistLF: 336, fenceDistLCF: 375, fenceDistCF: 396,
    fenceDistRCF: 391, fenceDistRF: 322, fenceHeight: 8, wallHeightLF: 11.5,
    warningTrackWidth: 15, foulLineLength: 340, fieldRadius: 450,
};

const EARTH_R = 20925721;
const EARTH_R_POLAR = 20855567;
const ATMO_THICKNESS = 328084;

// ========== SEEDED RNG ==========
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Simple 2D noise from seed (value noise with interpolation)
function makeNoise2D(seed) {
    const rng = mulberry32(seed);
    const SIZE = 256;
    const table = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) table[i] = rng();

    function get(ix, iy) {
        return table[((ix % SIZE) + SIZE) % SIZE + (((iy % SIZE) + SIZE) % SIZE) * SIZE];
    }

    return function noise(x, y) {
        const ix = Math.floor(x), iy = Math.floor(y);
        const fx = x - ix, fy = y - iy;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const a = get(ix, iy), b = get(ix + 1, iy);
        const c = get(ix, iy + 1), d = get(ix + 1, iy + 1);
        return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
}

function fbm(noise, x, y, octaves = 5) {
    let val = 0, amp = 0.5, freq = 1, total = 0;
    for (let i = 0; i < octaves; i++) {
        val += noise(x * freq, y * freq) * amp;
        total += amp; amp *= 0.5; freq *= 2;
    }
    return val / total;
}

// ========== MATERIALS ==========
function createMaterials() {
    const m = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
    return {
        grass: m(0x3a7d44), grassDark: m(0x2d6b35), dirt: m(0xcd853f, 0.9),
        dirtMound: m(0xc48039), warningTrack: m(0xa86a2f, 0.9),
        chalk: m(0xffffff, 0.7), fence: m(0x1a4522, 0.4),
        rubber: m(0xeeeeee, 0.5), base: m(0xffffff, 0.5),
        scoreboard: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.8 }),
        metal: new THREE.MeshStandardMaterial({ color: 0x9999aa, roughness: 0.3, metalness: 0.9 }),
        concreteDark: m(0x666677, 0.8),
        lightPole: new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.3, metalness: 0.8 }),
    };
}

// ========== MAIN BUILD ==========
export function buildStadium(scene) {
    const mats = createMaterials();
    const g = new THREE.Group();
    g.name = 'stadium';

    buildEarth(g);
    buildAtmosphere(g);
    buildSpaceEnvironment(scene);
    buildProceduralWorld(g);
    buildNightLighting(scene);

    // Field
    buildFieldSurface(g, mats);
    buildBasePaths(g, mats);
    buildPitcherMound(g, mats);
    buildBases(g, mats);
    buildFoulLines(g, mats);
    buildHomePlateArea(g, mats);
    buildWarningTrack(g, mats);
    buildOutfieldFence(g, mats);
    buildScoreboard(g, mats);
    buildLightTowers(g, scene, mats);

    scene.add(g);
    return g;
}

// ========== NIGHT LIGHTING ==========
function buildNightLighting(scene) {
    // Moonlight (dim directional)
    const moon = new THREE.DirectionalLight(0x8899cc, 0.8);
    moon.position.set(-200, 400, -100);
    scene.add(moon);

    // Strong ambient so the field isn't pitch black
    scene.add(new THREE.AmbientLight(0x334466, 1.5));

    // Hemisphere: dark blue sky + dark ground
    scene.add(new THREE.HemisphereLight(0x223355, 0x111111, 1.0));
}

// ========== EARTH ==========
function buildEarth(g) {
    const ps = EARTH_R_POLAR / EARTH_R;
    const geo = new THREE.SphereGeometry(EARTH_R, 96, 96);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a3366, roughness: 0.8 });
    const earth = new THREE.Mesh(geo, mat);
    earth.scale.set(1, ps, 1);
    earth.position.y = -EARTH_R;
    earth.receiveShadow = true;
    earth.name = 'earth';
    g.add(earth);
}

// ========== ATMOSPHERE ==========
function buildAtmosphere(g) {
    const r = EARTH_R + ATMO_THICKNESS;
    const ps = EARTH_R_POLAR / EARTH_R;
    const mat = new THREE.ShaderMaterial({
        vertexShader: `
            varying vec3 vNorm; varying vec3 vWorldPos;
            void main(){
                vNorm=normalize(normalMatrix*normal);
                vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;
                gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
            }`,
        fragmentShader: `
            varying vec3 vNorm; varying vec3 vWorldPos;
            void main(){
                float rim=1.0-max(0.0,dot(vNorm,normalize(cameraPosition-vWorldPos)));
                rim=pow(rim,3.0);
                vec3 c=mix(vec3(0.2,0.4,0.8),vec3(0.1,0.3,0.9),rim);
                gl_FragColor=vec4(c,rim*0.3);
            }`,
        transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 64), mat);
    mesh.scale.set(1, ps, 1); mesh.position.y = -EARTH_R;
    mesh.name = 'atmosphere'; g.add(mesh);
}

// ========== SPACE ==========
function buildSpaceEnvironment(scene) {
    const SKY = 5e9;
    // Stars
    const rng = mulberry32(12345);
    const N = 15000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
        const th = Math.acos(2 * rng() - 1), ph = rng() * Math.PI * 2, r = SKY * (0.8 + rng() * 0.4);
        pos[i * 3] = r * Math.sin(th) * Math.cos(ph);
        pos[i * 3 + 1] = r * Math.sin(th) * Math.sin(ph);
        pos[i * 3 + 2] = r * Math.cos(th);
        const t = rng();
        if (t < 0.5) { col[i * 3] = 1; col[i * 3 + 1] = 1; col[i * 3 + 2] = 1; }
        else if (t < 0.7) { col[i * 3] = 0.7; col[i * 3 + 1] = 0.8; col[i * 3 + 2] = 1; }
        else if (t < 0.85) { col[i * 3] = 1; col[i * 3 + 1] = 0.95; col[i * 3 + 2] = 0.7; }
        else { col[i * 3] = 1; col[i * 3 + 1] = 0.6; col[i * 3 + 2] = 0.3; }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
        size: 2000000, vertexColors: true, transparent: true, opacity: 0.9,
        sizeAttenuation: true, depthWrite: false,
    })));

    // Milky Way band
    const rng2 = mulberry32(77777);
    const M = 8000, mp = new Float32Array(M * 3), mc = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) {
        const ba = (rng2() - 0.5) * 0.3, la = rng2() * Math.PI * 2;
        let x = SKY * 0.9 * Math.cos(la) * Math.cos(ba);
        let y = SKY * 0.9 * Math.sin(ba);
        let z = SKY * 0.9 * Math.sin(la) * Math.cos(ba);
        const tilt = Math.PI / 3;
        const ry = y * Math.cos(tilt) - z * Math.sin(tilt);
        const rz = y * Math.sin(tilt) + z * Math.cos(tilt);
        mp[i * 3] = x; mp[i * 3 + 1] = ry; mp[i * 3 + 2] = rz;
        const b = 0.4 + rng2() * 0.4;
        mc[i * 3] = b; mc[i * 3 + 1] = b * 0.95; mc[i * 3 + 2] = b;
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('color', new THREE.BufferAttribute(mc, 3));
    scene.add(new THREE.Points(mg, new THREE.PointsMaterial({
        size: 1200000, vertexColors: true, transparent: true, opacity: 0.6,
        sizeAttenuation: true, depthWrite: false,
    })));

    // Moon
    const moonGeo = new THREE.SphereGeometry(5.7e6, 24, 24);
    const moonMesh = new THREE.Mesh(moonGeo, new THREE.MeshStandardMaterial({ color: 0xddddcc, roughness: 0.9 }));
    moonMesh.position.set(8e8, 1e9, 3e8);
    scene.add(moonMesh);

    // Planets (small dots)
    [[0xcc5533, 8e10, [-.8, .2, .6]], [0xddbb88, 1.5e11, [.5, .1, -.8]], [0xffffee, 3e10, [.6, .4, .7]]].forEach(([c, d, dir]) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(d * 0.003, 12, 12), new THREE.MeshBasicMaterial({ color: c }));
        m.position.set(dir[0] * d, dir[1] * d, dir[2] * d);
        scene.add(m);
    });
}

// ========== PROCEDURAL WORLD ==========
function buildProceduralWorld(group) {
    const SEED = 42;
    const noise = makeNoise2D(SEED);
    const noise2 = makeNoise2D(SEED + 100);
    const noise3 = makeNoise2D(SEED + 200);
    const rng = mulberry32(SEED + 300);

    const terrainSize = 250000; // ~47 miles across to see huge scale variations
    const segments = 300;
    const geo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
    const posAttr = geo.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);

    for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i), y = posAttr.getY(i);
        const dist = Math.sqrt(x * x + y * y);
        // Ensure a perfectly flat area up to 1500ft, then gradually blend into terrain over the next 2000ft
        const stadiumGuard = Math.max(0, Math.min(1, (dist - 1500) / 2000));

        // Macro-scale: Continents, Oceans, Large Plains (very low frequency)
        const macro = fbm(noise, x * 0.000008, y * 0.000008, 4); // 0 to 1

        // Meso-scale: Mountains, Hills, Plateaus
        const meso = fbm(noise2, x * 0.00004, y * 0.00004, 4);

        // Micro-scale: Detail noise, sharp ridges (V-valleys)
        const micro = fbm(noise3, x * 0.00015, y * 0.00015, 4);
        const ridge = 1.0 - Math.abs(micro * 2.0 - 1.0); // 0 to 1 sharp ridges

        let h = 0;
        let biome = 'plain';

        if (macro < 0.35) {
            // Ocean / Sea
            h = -200 + macro * 500;
            biome = 'ocean';
        } else if (macro > 0.65 && meso > 0.5) {
            // High Mountains & Glaciers (U-shaped valleys via pow)
            const uValley = Math.pow(meso, 2.0);
            h = 500 + uValley * 8000 + ridge * 1500;
            biome = (h > 6000) ? 'glacier' : 'mountain';
        } else if (meso < 0.3 && macro > 0.45) {
            // Plateaus & Mesas (Stepped terraces)
            const steps = 6;
            const terraced = Math.floor(meso * steps) / steps;
            h = 200 + terraced * 3000 + micro * 100;
            biome = 'plateau';
        } else if (macro > 0.4 && macro < 0.45) {
            // Coastline / Fjords / Rias
            const fjord = Math.pow(Math.abs(meso * 2.0 - 1.0), 3.0);
            h = -50 + fjord * 2000;
            biome = 'coast';
        } else {
            // Plains, Hills, Valleys, Lakes
            if (meso > 0.7) {
                h = 100 + meso * 1500; // Hills
                biome = 'hills';
            } else if (meso < 0.2) {
                h = -50 + meso * 200; // Lakes / Basins
                biome = h < 0 ? 'lake' : 'valley';
            } else {
                h = 20 + micro * 150; // Great Plains
                biome = 'plain';
            }
        }

        // Clamp water
        let isWater = h < 0;
        if (h < 0) h = 0; // Flat water surface
        h *= stadiumGuard; // flatten near stadium

        posAttr.setZ(i, h);

        // Color by biome and height
        let r, g, b;
        if (isWater && stadiumGuard > 0.5) {
            r = 0.05; g = 0.12; b = 0.25; // water
        } else if (biome === 'glacier') {
            r = 0.8; g = 0.85; b = 0.9;   // snow/ice
        } else if (biome === 'mountain') {
            r = 0.25; g = 0.25; b = 0.28; // rock
        } else if (biome === 'plateau') {
            r = 0.3; g = 0.25; b = 0.15;  // dry dirt/mesa
        } else if (biome === 'hills') {
            r = 0.12; g = 0.22; b = 0.1;  // dark forest
        } else if (biome === 'coast') {
            r = 0.18; g = 0.2; b = 0.15;  // rocky coast
        } else {
            // Plains / Valleys -> check urban
            const urban = fbm(noise3, x * 0.0001, y * 0.0001, 2);
            if (urban > 0.65 || dist < 4000) { // Force urban near stadium
                r = 0.15; g = 0.14; b = 0.13; // urban grey
            } else {
                r = 0.1; g = 0.18; b = 0.06; // grass
            }
        }
        colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    const terrain = new THREE.Mesh(geo, terrainMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -0.5;
    terrain.receiveShadow = true;
    terrain.name = 'terrain';
    group.add(terrain);

    buildCityLightsAndBuildings(group, noise, noise2, noise3, rng);
    buildRoads(group, noise, rng);
    buildClouds(group, noise2);
}

function buildCityLightsAndBuildings(group, noise, noise2, noise3, rng) {
    const N = 8000; // more city elements
    const geo = new THREE.BoxGeometry(1, 1, 1);

    // Two materials: one lit building, one dark building
    const matLit = new THREE.MeshStandardMaterial({
        color: 0xffeecc, emissive: 0xffaa44, emissiveIntensity: 0.8, roughness: 0.5,
    });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x222225, roughness: 0.8 });

    const meshLit = new THREE.InstancedMesh(geo, matLit, Math.floor(N * 0.4));
    const meshDark = new THREE.InstancedMesh(geo, matDark, Math.floor(N * 0.6));

    const dummy = new THREE.Object3D();
    let cLit = 0, cDark = 0;

    for (let i = 0; i < N * 5 && (cLit < meshLit.count || cDark < meshDark.count); i++) {
        // Distribute loosely near stadium or globally
        let x, z;
        if (rng() < 0.2) {
            // Downtown around stadium (1500 to 7000 ft), using a power curve to avoid unnatural rings
            const ang = rng() * Math.PI * 2;
            const d = 1500 + Math.pow(rng(), 1.5) * 5500;
            x = Math.cos(ang) * d;
            z = Math.sin(ang) * d;
        } else {
            // Global distribution
            x = (rng() - 0.5) * 200000;
            z = (rng() - 0.5) * 200000;
        }

        const dist = Math.sqrt(x * x + z * z);
        if (dist < 1500) continue; // Out of park + clearance

        const urban = fbm(noise3, x * 0.0001, z * 0.0001, 2);
        if (urban < 0.65 && dist > 7000) continue; // Must be urban or downtown

        // Approximate height (skip full terrain calc since we just need water check)
        const macro = fbm(noise, x * 0.000008, z * 0.000008, 4);
        if (macro < 0.35 && dist > 2000) continue; // don't build in ocean unless very close

        const bw = 25 + rng() * 60;
        const bd = 25 + rng() * 60;
        // Limit heights organically
        const distFactor = Math.max(0, 1 - (dist - 1500) / 5500);
        const bh = 30 + rng() * 80 + Math.pow(rng(), 3.0) * 150 * distFactor;

        // We'll place them flat assuming urban areas are mostly plains
        const terrainH = 0;

        dummy.position.set(x, terrainH + bh / 2, z);
        dummy.scale.set(bw, bh, bd);
        dummy.rotation.y = rng() * Math.PI;
        dummy.updateMatrix();

        if (rng() < 0.4 && cLit < meshLit.count) {
            meshLit.setMatrixAt(cLit++, dummy.matrix);
        } else if (cDark < meshDark.count) {
            meshDark.setMatrixAt(cDark++, dummy.matrix);
        }
    }
    meshLit.count = cLit; meshLit.instanceMatrix.needsUpdate = true; group.add(meshLit);
    meshDark.count = cDark; meshDark.instanceMatrix.needsUpdate = true; group.add(meshDark);
}

function buildRoads(group, noise, rng) {
    const roadMat = new THREE.LineBasicMaterial({ color: 0x444433, linewidth: 2, transparent: true, opacity: 0.6 });
    for (let r = 0; r < 30; r++) {
        const pts = [];
        const isHoriz = r < 15;
        const basePos = (r % 15 - 7.5) * 15000;

        for (let s = 0; s <= 50; s++) {
            const t = (s / 50 - 0.5) * 200000;
            let x = isHoriz ? t : basePos + fbm(noise, t * 0.00005, basePos * 0.00005, 2) * 2000;
            let z = isHoriz ? basePos + fbm(noise, basePos * 0.00005, t * 0.00005, 2) * 2000 : t;
            const dist = Math.sqrt(x * x + z * z);
            if (dist < 600) continue;
            pts.push(new THREE.Vector3(x, 10, z)); // Simplified road height
        }
        if (pts.length >= 2) group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), roadMat));
    }
}

function buildClouds(group, noise) {
    const N = 800;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x445566, transparent: true, opacity: 0.15,
        roughness: 1, metalness: 0, side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    const dummy = new THREE.Object3D();
    const rng = mulberry32(9999);

    for (let i = 0; i < N; i++) {
        const x = (rng() - 0.5) * 200000;
        const z = (rng() - 0.5) * 200000;
        const cloudDensity = fbm(noise, x * 0.00002, z * 0.00002, 3);
        if (cloudDensity < 0.45) { mesh.setMatrixAt(i, new THREE.Matrix4()); continue; }

        const w = 2000 + rng() * 4000;
        const h = 2000 + rng() * 4000;
        dummy.position.set(x, 6000 + rng() * 3000, z);
        dummy.scale.set(w, h, 1);
        dummy.rotation.x = -Math.PI / 2;
        dummy.rotation.z = rng() * Math.PI;
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
}

// ========== FIELD BUILDERS ==========
function buildFieldSurface(g, mats) {
    // Local grass patch
    const local = new THREE.Mesh(new THREE.CircleGeometry(600, 64), mats.grass);
    local.rotation.x = -Math.PI / 2; local.position.y = 0.01; local.receiveShadow = true;
    g.add(local);

    // Outfield
    const of_ = new THREE.Mesh(new THREE.CircleGeometry(FIELD.fieldRadius, 64, -Math.PI / 4, Math.PI / 2), mats.grass);
    of_.rotation.x = -Math.PI / 2; of_.position.y = 0.02; of_.receiveShadow = true;
    g.add(of_);

    // Mowing pattern
    for (let i = 0; i < 10; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(20, FIELD.fieldRadius), i % 2 === 0 ? mats.grass : mats.grassDark);
        s.rotation.x = -Math.PI / 2;
        s.position.set((i - 4.5) * 20, 0.025, FIELD.pitcherMoundDist + 100);
        s.receiveShadow = true; g.add(s);
    }

    // Infield dirt + inner grass
    const id_ = new THREE.Mesh(new THREE.CircleGeometry(FIELD.infieldDirtRadius, 64), mats.dirt);
    id_.rotation.x = -Math.PI / 2; id_.position.set(0, 0.03, FIELD.pitcherMoundDist); id_.receiveShadow = true;
    g.add(id_);
    const ig = new THREE.Mesh(new THREE.CircleGeometry(70, 64), mats.grass);
    ig.rotation.x = -Math.PI / 2; ig.position.set(0, 0.04, FIELD.pitcherMoundDist); ig.receiveShadow = true;
    g.add(ig);
}

function buildBasePaths(g, mats) {
    const pw = 6, bd = FIELD.baseDist, hd = bd * Math.sqrt(2) / 2;
    const pg = new THREE.PlaneGeometry(pw, bd);
    [[hd / 2, hd / 2, -Math.PI / 4], [-hd / 2, hd / 2, Math.PI / 4],
    [hd / 2, bd + hd / 2 - bd / 2, Math.PI / 4], [-hd / 2, bd + hd / 2 - bd / 2, -Math.PI / 4]].forEach(([x, z, rz]) => {
        const m = new THREE.Mesh(pg.clone(), mats.dirt);
        m.rotation.x = -Math.PI / 2; m.rotation.z = rz;
        m.position.set(x, 0.035, z); m.receiveShadow = true; g.add(m);
    });
}

function buildPitcherMound(g, mats) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(FIELD.moundRadius, FIELD.moundRadius + 2, FIELD.moundHeight, 32), mats.dirtMound);
    m.position.set(0, FIELD.moundHeight / 2, FIELD.pitcherMoundDist); m.castShadow = true; m.receiveShadow = true; g.add(m);
    const r = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 0.5), mats.rubber);
    r.position.set(0, FIELD.moundHeight + 0.075, FIELD.pitcherMoundDist); r.castShadow = true; g.add(r);
}

function buildBases(g, mats) {
    const d = FIELD.baseDist * Math.sqrt(2) / 2;
    // Home plate
    const hs = new THREE.Shape();
    const s = 17 / 12 / 2;
    hs.moveTo(0, s); hs.lineTo(s, s * 0.5); hs.lineTo(s, -s * 0.5); hs.lineTo(-s, -s * 0.5); hs.lineTo(-s, s * 0.5); hs.closePath();
    const hp = new THREE.Mesh(new THREE.ExtrudeGeometry(hs, { depth: 0.02, bevelEnabled: false }), mats.base);
    hp.rotation.x = -Math.PI / 2; hp.position.set(0, 0.05, 0); hp.castShadow = true; g.add(hp);
    // Bases
    const bg = new THREE.BoxGeometry(15 / 12, 0.25, 15 / 12);
    [[d, d], [0, d * 2], [-d, d]].forEach(([x, z]) => {
        const b = new THREE.Mesh(bg.clone(), mats.base);
        b.position.set(x, 0.125, z); b.rotation.y = Math.PI / 4; b.castShadow = true; g.add(b);
    });
}

function buildFoulLines(g, mats) {
    const lw = 0.33, ll = FIELD.foulLineLength;
    const lg = new THREE.PlaneGeometry(lw, ll);
    [[-Math.PI / 4, 1], [Math.PI / 4, -1]].forEach(([rz, sx]) => {
        const m = new THREE.Mesh(lg.clone(), mats.chalk);
        m.rotation.x = -Math.PI / 2; m.rotation.z = rz;
        m.position.set(sx * ll / 2 * Math.sin(Math.PI / 4), 0.04, ll / 2 * Math.cos(Math.PI / 4));
        g.add(m);
    });
}

function buildHomePlateArea(g, mats) {
    const hd = new THREE.Mesh(new THREE.CircleGeometry(13, 32), mats.dirt);
    hd.rotation.x = -Math.PI / 2; hd.position.set(0, 0.03, 0); hd.receiveShadow = true; g.add(hd);
    const bw = 4, bl = 6, lw = 0.17;
    [-1, 1].forEach(side => {
        [{ w: lw, h: bl, x: side * (bw / 2 + 1.5), z: 0 }, { w: lw, h: bl, x: side * (bw / 2 + 1.5 + bw), z: 0 },
        { w: bw, h: lw, x: side * (bw / 2 + 1.5 + bw / 2), z: bl / 2 }, { w: bw, h: lw, x: side * (bw / 2 + 1.5 + bw / 2), z: -bl / 2 }].forEach(e => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(e.w, e.h), mats.chalk);
            m.rotation.x = -Math.PI / 2; m.position.set(e.x, 0.04, e.z); g.add(m);
        });
    });
}

function buildWarningTrack(g, mats) {
    const ir = FIELD.fenceDistCF - FIELD.warningTrackWidth, or = FIELD.fenceDistCF;
    const shape = new THREE.Shape(), sa = -Math.PI / 4, ea = Math.PI / 4, seg = 48;
    for (let i = 0; i <= seg; i++) { const a = sa + (ea - sa) * (i / seg); const x = Math.sin(a) * or, z = Math.cos(a) * or; i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z); }
    for (let i = seg; i >= 0; i--) { const a = sa + (ea - sa) * (i / seg); shape.lineTo(Math.sin(a) * ir, Math.cos(a) * ir); }
    shape.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), mats.warningTrack);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.025; m.receiveShadow = true; g.add(m);
}

function buildOutfieldFence(g, mats) {
    const pts = [
        { a: -Math.PI / 4, d: FIELD.fenceDistRF, h: FIELD.fenceHeight }, { a: -Math.PI / 8, d: FIELD.fenceDistRCF, h: FIELD.fenceHeight },
        { a: 0, d: FIELD.fenceDistCF, h: FIELD.fenceHeight }, { a: Math.PI / 8, d: FIELD.fenceDistLCF, h: FIELD.fenceHeight },
        { a: Math.PI / 4, d: FIELD.fenceDistLF, h: FIELD.wallHeightLF },
    ];
    for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i], p2 = pts[i + 1];
        const x1 = Math.sin(p1.a) * p1.d, z1 = Math.cos(p1.a) * p1.d, x2 = Math.sin(p2.a) * p2.d, z2 = Math.cos(p2.a) * p2.d;
        const dx = x2 - x1, dz = z2 - z1, len = Math.sqrt(dx * dx + dz * dz), mh = Math.max(p1.h, p2.h);
        const f = new THREE.Mesh(new THREE.BoxGeometry(len, mh, 1), mats.fence);
        f.position.set((x1 + x2) / 2, mh / 2, (z1 + z2) / 2); f.rotation.y = -Math.atan2(dz, dx);
        f.castShadow = true; f.receiveShadow = true; g.add(f);
        const pm = new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.6, emissive: 0x554400, emissiveIntensity: 0.2 });
        const pad = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 1.2), pm);
        pad.position.set((x1 + x2) / 2, mh + 0.25, (z1 + z2) / 2); pad.rotation.y = -Math.atan2(dz, dx); g.add(pad);
    }
}

function buildScoreboard(g, mats) {
    const w = 80, h = 40, d = 3, dist = FIELD.fenceDistCF + 80;
    const sb = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.scoreboard);
    sb.position.set(0, h / 2 + 30, dist); sb.castShadow = true; g.add(sb);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 4, h + 4, d + 1), mats.metal);
    fr.position.set(0, h / 2 + 30, dist + 0.5); g.add(fr);
    [-w / 3, w / 3].forEach(x => { const p = new THREE.Mesh(new THREE.BoxGeometry(3, 30, 3), mats.concreteDark); p.position.set(x, 15, dist); g.add(p); });
}

function buildLightTowers(g, scene, mats) {
    const lps = [
        { x: -200, z: -40, a: Math.PI / 6 }, { x: 200, z: -40, a: -Math.PI / 6 },
        { x: -250, z: 200, a: Math.PI / 4 }, { x: 250, z: 200, a: -Math.PI / 4 },
        { x: -150, z: 380, a: Math.PI / 3 }, { x: 150, z: 380, a: -Math.PI / 3 },
    ];
    const th = 120;
    lps.forEach(p => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.5, th, 8), mats.lightPole);
        pole.position.set(p.x, th / 2, p.z); pole.castShadow = true; g.add(pole);
        const bankMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xffffcc, emissiveIntensity: 2.0, roughness: 0.3 });
        const bank = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 5), bankMat);
        bank.position.set(p.x, th + 4, p.z); bank.rotation.y = p.a; g.add(bank);
        // Night game: stronger spotlights
        const sl = new THREE.SpotLight(0xfff5e0, 8, 800, Math.PI / 3.5, 0.4, 1);
        sl.position.set(p.x, th + 4, p.z);
        sl.target.position.set(0, 0, FIELD.pitcherMoundDist);
        sl.castShadow = true; sl.shadow.mapSize.width = 1024; sl.shadow.mapSize.height = 1024;
        scene.add(sl); scene.add(sl.target);
    });
}
