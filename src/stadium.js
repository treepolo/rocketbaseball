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
    const rng = mulberry32(SEED + 200);

    // Terrain as a large displaced plane
    const terrainSize = 80000; // 80,000 ft (~15 miles) visible area
    const segments = 200;
    const geo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
    const posAttr = geo.attributes.position;

    // Height + color
    const colors = new Float32Array(posAttr.count * 3);
    const scale = 0.0003; // noise scale

    for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i), y = posAttr.getY(i);
        // Distance from stadium center (to keep stadium area flat)
        const dist = Math.sqrt(x * x + y * y);
        const stadiumGuard = Math.max(0, Math.min(1, (dist - 600) / 400));

        // Multi-octave terrain height
        let h = fbm(noise, x * scale, y * scale, 6);
        // Create varied terrain: mountains, valleys, plains
        const mountainFactor = fbm(noise2, x * scale * 0.5, y * scale * 0.5, 3);
        h = h * (200 + mountainFactor * 1500) - 100;
        // Ocean: clamp negative heights to sea level (subtle)
        const isOcean = h < -20;
        if (h < -20) h = -20;
        h *= stadiumGuard; // flatten near stadium

        posAttr.setZ(i, h);

        // Color by biome
        let r, g, b;
        if (isOcean && stadiumGuard > 0.5) {
            r = 0.05; g = 0.12; b = 0.25; // dark ocean at night
        } else if (h > 800 * stadiumGuard) {
            r = 0.35; g = 0.35; b = 0.38; // mountain/rock
        } else if (h > 300 * stadiumGuard) {
            const t = fbm(noise2, x * scale * 2, y * scale * 2, 2);
            if (t > 0.55) { r = 0.15; g = 0.25; b = 0.1; } // forest (dark green at night)
            else { r = 0.12; g = 0.2; b = 0.08; } // grassland
        } else {
            // Low plains - mix of grass and developed areas
            const urban = fbm(noise2, x * scale * 3, y * scale * 3, 2);
            if (urban > 0.6 && dist > 1000) {
                r = 0.15; g = 0.14; b = 0.13; // urban grey
            } else {
                r = 0.1; g = 0.18; b = 0.06; // dark grass at night
            }
        }
        colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.9, metalness: 0,
    });
    const terrain = new THREE.Mesh(geo, terrainMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -0.5;
    terrain.receiveShadow = true;
    terrain.name = 'terrain';
    group.add(terrain);

    // City lights (instanced small emissive boxes on urban areas)
    buildCityLights(group, noise, noise2, rng);

    // Road network (lines on terrain)
    buildRoads(group, noise, rng);

    // Cloud layer
    buildClouds(group, noise2);
}

function buildCityLights(group, noise, noise2, rng) {
    const N = 3000;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffeecc, emissive: 0xffaa44, emissiveIntensity: 0.8, roughness: 0.5,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    const dummy = new THREE.Object3D();
    let count = 0;
    const scale = 0.0003;

    for (let i = 0; i < N * 3 && count < N; i++) {
        const x = (rng() - 0.5) * 60000;
        const z = (rng() - 0.5) * 60000;
        const dist = Math.sqrt(x * x + z * z);
        if (dist < 800) continue; // skip stadium area

        // Only place in urban zones
        const urban = fbm(noise2, x * scale * 3, z * scale * 3, 2);
        if (urban < 0.55) continue;

        const h = Math.max(0, fbm(noise, x * scale, z * scale, 6) *
            (200 + fbm(noise2, x * scale * 0.5, z * scale * 0.5, 3) * 1500) - 100);

        const bw = 15 + rng() * 40;
        const bh = 10 + rng() * 80 * urban;
        const bd = 15 + rng() * 40;

        dummy.position.set(x, h + bh / 2, z);
        dummy.scale.set(bw, bh, bd);
        dummy.rotation.y = rng() * Math.PI;
        dummy.updateMatrix();
        mesh.setMatrixAt(count++, dummy.matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = 'cityLights';
    group.add(mesh);
}

function buildRoads(group, noise, rng) {
    const roadMat = new THREE.LineBasicMaterial({ color: 0x555544, linewidth: 2, transparent: true, opacity: 0.6 });
    const scale = 0.0003;

    // Generate grid-ish road network with noise displacement
    for (let r = 0; r < 20; r++) {
        const pts = [];
        const isHoriz = r < 10;
        const basePos = (r % 10 - 5) * 6000;

        for (let s = 0; s <= 30; s++) {
            const t = (s / 30 - 0.5) * 60000;
            let x = isHoriz ? t : basePos + fbm(noise, t * 0.0001, basePos * 0.0001, 2) * 800;
            let z = isHoriz ? basePos + fbm(noise, basePos * 0.0001, t * 0.0001, 2) * 800 : t;
            const dist = Math.sqrt(x * x + z * z);
            if (dist < 600) continue;
            const h = Math.max(0, fbm(noise, x * scale, z * scale, 6) *
                (200 + fbm(noise, x * scale * 0.5, z * scale * 0.5, 3) * 1500) - 100);
            pts.push(new THREE.Vector3(x, h + 2, z));
        }

        if (pts.length >= 2) {
            const g2 = new THREE.BufferGeometry().setFromPoints(pts);
            group.add(new THREE.Line(g2, roadMat));
        }
    }
}

function buildClouds(group, noise) {
    // Cloud layer at ~5000 ft as translucent instanced planes
    const N = 400;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x445566, transparent: true, opacity: 0.15,
        roughness: 1, metalness: 0, side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    const dummy = new THREE.Object3D();
    const rng = mulberry32(9999);

    for (let i = 0; i < N; i++) {
        const x = (rng() - 0.5) * 80000;
        const z = (rng() - 0.5) * 80000;
        const cloudDensity = fbm(noise, x * 0.00005, z * 0.00005, 3);
        if (cloudDensity < 0.45) { mesh.setMatrixAt(i, new THREE.Matrix4()); continue; }

        const w = 500 + rng() * 2000;
        const h = 500 + rng() * 1500;
        dummy.position.set(x, 4000 + rng() * 2000, z);
        dummy.scale.set(w, h, 1);
        dummy.rotation.x = -Math.PI / 2;
        dummy.rotation.z = rng() * Math.PI;
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = 'clouds';
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
