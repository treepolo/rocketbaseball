/**
 * Stadium Builder - Petco Park (San Diego Padres)
 * 1:1 scale baseball field on a real ellipsoid Earth
 * All dimensions in feet, converted to Three.js units (1 unit = 1 foot)
 */
import * as THREE from 'three';

// ============================================
// FIELD DIMENSIONS (Standard MLB / Petco Park)
// ============================================
const FIELD = {
    pitcherMoundDist: 60.5,
    baseDist: 90,
    infieldDirtRadius: 95,
    moundRadius: 9,
    moundHeight: 0.833,
    homePlateToBackstop: 60,
    fenceDistLF: 336,
    fenceDistLCF: 375,
    fenceDistCF: 396,
    fenceDistRCF: 391,
    fenceDistRF: 322,
    fenceHeight: 8,
    wallHeightLF: 11.5,
    warningTrackWidth: 15,
    foulLineLength: 340,
    fieldRadius: 450,
};

// Earth dimensions in feet (WGS84 ellipsoid)
const EARTH_EQUATORIAL_RADIUS_FT = 20925721; // ~6378.137 km in feet
const EARTH_POLAR_RADIUS_FT = 20855567;      // ~6356.752 km in feet
const ATMOSPHERE_THICKNESS_FT = 328084;       // ~100 km in feet (Karman line)

// ============================================
// MATERIALS
// ============================================
function createMaterials() {
    return {
        grass: new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.85, metalness: 0.0 }),
        grassDark: new THREE.MeshStandardMaterial({ color: 0x388e3c, roughness: 0.85, metalness: 0.0 }),
        dirt: new THREE.MeshStandardMaterial({ color: 0xcd853f, roughness: 0.9, metalness: 0.0 }),
        dirtMound: new THREE.MeshStandardMaterial({ color: 0xc48039, roughness: 0.85, metalness: 0.0 }),
        warningTrack: new THREE.MeshStandardMaterial({ color: 0xa86a2f, roughness: 0.9, metalness: 0.0 }),
        chalk: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.0 }),
        fence: new THREE.MeshStandardMaterial({ color: 0x1a4522, roughness: 0.4, metalness: 0.1 }),
        concrete: new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.8, metalness: 0.1 }),
        concreteDark: new THREE.MeshStandardMaterial({ color: 0x666677, roughness: 0.8, metalness: 0.1 }),
        seats: new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.6, metalness: 0.1 }),
        seatsGold: new THREE.MeshStandardMaterial({ color: 0xdaaa00, roughness: 0.5, metalness: 0.2 }),
        seatsRed: new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6, metalness: 0.1 }),
        rubber: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5, metalness: 0.1 }),
        base: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.0 }),
        scoreboard: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.8 }),
        glass: new THREE.MeshStandardMaterial({ color: 0xaaddff, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.5 }),
        metal: new THREE.MeshStandardMaterial({ color: 0x9999aa, roughness: 0.3, metalness: 0.9 }),
        building: new THREE.MeshStandardMaterial({ color: 0x777788, roughness: 0.5, metalness: 0.1 }),
        buildingLight: new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.5, metalness: 0.1 }),
        window: new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.1, metalness: 0.8 }),
        lightPole: new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.3, metalness: 0.8 }),
        ground: new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.9, metalness: 0.05 }),
    };
}

// ============================================
// BUILD THE STADIUM
// ============================================
export function buildStadium(scene) {
    const mats = createMaterials();
    const stadiumGroup = new THREE.Group();
    stadiumGroup.name = 'stadium';

    // 1. Ellipsoid Earth (replaces flat ground)
    buildEarth(stadiumGroup, mats);

    // 2. Real atmosphere shell
    buildAtmosphere(stadiumGroup);

    // 3. Space environment (stars, planets, milky way)
    buildSpaceEnvironment(scene);

    // 4. Local ground patch around stadium (flat for gameplay, sits on Earth surface)
    const localGroundGeo = new THREE.CircleGeometry(3000, 64);
    const localGround = new THREE.Mesh(localGroundGeo, mats.ground);
    localGround.rotation.x = -Math.PI / 2;
    localGround.position.y = -0.5;
    localGround.receiveShadow = true;
    stadiumGroup.add(localGround);

    // 5. Outfield grass
    const outfieldGeo = new THREE.CircleGeometry(FIELD.fieldRadius, 64, -Math.PI / 4, Math.PI / 2);
    const outfield = new THREE.Mesh(outfieldGeo, mats.grass);
    outfield.rotation.x = -Math.PI / 2;
    outfield.position.y = 0.01;
    outfield.receiveShadow = true;
    stadiumGroup.add(outfield);

    // 6-15. Field features
    buildMowingPattern(stadiumGroup, mats);

    const infieldGeo = new THREE.CircleGeometry(FIELD.infieldDirtRadius, 64);
    const infieldDirt = new THREE.Mesh(infieldGeo, mats.dirt);
    infieldDirt.rotation.x = -Math.PI / 2;
    infieldDirt.position.set(0, 0.02, FIELD.pitcherMoundDist);
    infieldDirt.receiveShadow = true;
    stadiumGroup.add(infieldDirt);

    const innerGrassGeo = new THREE.CircleGeometry(70, 64);
    const innerGrass = new THREE.Mesh(innerGrassGeo, mats.grass);
    innerGrass.rotation.x = -Math.PI / 2;
    innerGrass.position.set(0, 0.03, FIELD.pitcherMoundDist);
    innerGrass.receiveShadow = true;
    stadiumGroup.add(innerGrass);

    buildBasePaths(stadiumGroup, mats);
    buildPitcherMound(stadiumGroup, mats);
    buildBases(stadiumGroup, mats);
    buildFoulLines(stadiumGroup, mats);
    buildHomePlateArea(stadiumGroup, mats);
    buildWarningTrack(stadiumGroup, mats);
    buildOutfieldFence(stadiumGroup, mats);
    buildSpectatorStands(stadiumGroup, mats);
    buildScoreboard(stadiumGroup, mats);
    buildLightTowers(stadiumGroup, scene, mats);
    buildCitySkyline(stadiumGroup, mats);

    scene.add(stadiumGroup);
    return stadiumGroup;
}

// ============================================
// EARTH (1:1 ellipsoid)
// ============================================
function buildEarth(group, mats) {
    // Create ellipsoid by scaling a sphere
    const segments = 96;
    const earthGeo = new THREE.SphereGeometry(EARTH_EQUATORIAL_RADIUS_FT, segments, segments);

    // Apply ellipsoid scaling (polar radius / equatorial radius)
    const polarScale = EARTH_POLAR_RADIUS_FT / EARTH_EQUATORIAL_RADIUS_FT;

    // Earth surface material - blue/green planet look
    const earthMat = new THREE.MeshStandardMaterial({
        color: 0x2255aa,
        roughness: 0.8,
        metalness: 0.1,
    });

    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    // Scale Y (up axis in Three.js) for polar flattening
    earthMesh.scale.set(1, polarScale, 1);
    // Position so the surface is at y=0 at the stadium location
    earthMesh.position.y = -EARTH_EQUATORIAL_RADIUS_FT;
    earthMesh.receiveShadow = true;
    earthMesh.name = 'earth';
    group.add(earthMesh);

    // Add green land patches on top hemisphere for visual interest
    const landGeo = new THREE.SphereGeometry(EARTH_EQUATORIAL_RADIUS_FT + 50, segments, segments,
        0, Math.PI * 0.5, 0, Math.PI * 0.4);
    const landMat = new THREE.MeshStandardMaterial({
        color: 0x3a7d44,
        roughness: 0.85,
        metalness: 0.05,
    });
    const land = new THREE.Mesh(landGeo, landMat);
    land.scale.set(1, polarScale, 1);
    land.position.y = -EARTH_EQUATORIAL_RADIUS_FT;
    land.receiveShadow = true;
    group.add(land);
}

// ============================================
// ATMOSPHERE (real observable spherical shell)
// ============================================
function buildAtmosphere(group) {
    const atmosphereRadius = EARTH_EQUATORIAL_RADIUS_FT + ATMOSPHERE_THICKNESS_FT;
    const polarScale = EARTH_POLAR_RADIUS_FT / EARTH_EQUATORIAL_RADIUS_FT;

    // Outer atmosphere shell - very subtle, observable from outside
    // Using a large transparent sphere with additive blending
    const atmoGeo = new THREE.SphereGeometry(atmosphereRadius, 64, 64);
    const atmoMat = new THREE.ShaderMaterial({
        uniforms: {
            earthRadius: { value: EARTH_EQUATORIAL_RADIUS_FT },
            atmosphereRadius: { value: atmosphereRadius },
            sunDirection: { value: new THREE.Vector3(-0.5, 0.7, -0.2).normalize() },
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPos.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 sunDirection;
            varying vec3 vWorldPosition;
            varying vec3 vNormal;
            void main() {
                // Rim-based atmospheric glow
                float intensity = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
                // Fresnel-like effect based on view angle
                float rim = 1.0 - max(0.0, dot(vNormal, normalize(cameraPosition - vWorldPosition)));
                rim = pow(rim, 3.0);
                
                // Atmospheric scattering color (blue at edges)
                vec3 atmoColor = mix(vec3(0.4, 0.7, 1.0), vec3(0.2, 0.5, 1.0), rim);
                
                // Sun glow
                float sunDot = max(0.0, dot(vNormal, sunDirection));
                atmoColor += vec3(1.0, 0.8, 0.5) * sunDot * 0.3;
                
                float alpha = rim * 0.35;
                gl_FragColor = vec4(atmoColor, alpha);
            }
        `,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
    atmosphere.scale.set(1, polarScale, 1);
    atmosphere.position.y = -EARTH_EQUATORIAL_RADIUS_FT;
    atmosphere.name = 'atmosphere';
    group.add(atmosphere);

    // Inner atmosphere glow (visible from surface, very subtle haze at horizon)
    const innerAtmoGeo = new THREE.SphereGeometry(EARTH_EQUATORIAL_RADIUS_FT + 100000, 48, 48);
    const innerAtmoMat = new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vViewDir;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                vViewDir = normalize(-mvPos.xyz);
                gl_Position = projectionMatrix * mvPos;
            }
        `,
        fragmentShader: `
            varying vec3 vNormal;
            varying vec3 vViewDir;
            void main() {
                float rim = 1.0 - max(0.0, dot(vNormal, vViewDir));
                rim = pow(rim, 5.0);
                vec3 col = vec3(0.5, 0.7, 1.0);
                gl_FragColor = vec4(col, rim * 0.15);
            }
        `,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
    });
    const innerAtmo = new THREE.Mesh(innerAtmoGeo, innerAtmoMat);
    innerAtmo.scale.set(1, polarScale, 1);
    innerAtmo.position.y = -EARTH_EQUATORIAL_RADIUS_FT;
    group.add(innerAtmo);
}

// ============================================
// SPACE ENVIRONMENT
// ============================================
function buildSpaceEnvironment(scene) {
    // 1. Stars (thousands of points)
    buildStarfield(scene);

    // 2. Milky Way band
    buildMilkyWay(scene);

    // 3. Solar system neighbors
    buildSolarSystem(scene);
}

function buildStarfield(scene) {
    const starCount = 15000;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const rng = mulberry32(12345);

    const skyRadius = 5e9; // 5 billion ft away

    for (let i = 0; i < starCount; i++) {
        // Random direction on sphere
        const theta = Math.acos(2 * rng() - 1);
        const phi = rng() * Math.PI * 2;
        const r = skyRadius * (0.8 + rng() * 0.4);

        positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
        positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
        positions[i * 3 + 2] = r * Math.cos(theta);

        // Star color variation (white, blue-white, yellow, orange-red)
        const colorType = rng();
        if (colorType < 0.5) {
            colors[i * 3] = 1.0; colors[i * 3 + 1] = 1.0; colors[i * 3 + 2] = 1.0;
        } else if (colorType < 0.7) {
            colors[i * 3] = 0.7; colors[i * 3 + 1] = 0.8; colors[i * 3 + 2] = 1.0;
        } else if (colorType < 0.85) {
            colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.95; colors[i * 3 + 2] = 0.7;
        } else {
            colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.6; colors[i * 3 + 2] = 0.3;
        }

        // Size variation
        const mag = rng();
        sizes[i] = mag < 0.8 ? 800000 + rng() * 1500000 : 2000000 + rng() * 5000000;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const starMat = new THREE.PointsMaterial({
        size: 2000000,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
        depthWrite: false,
    });

    const stars = new THREE.Points(starGeo, starMat);
    stars.name = 'starfield';
    scene.add(stars);
}

function buildMilkyWay(scene) {
    // Milky Way as a band of denser, dimmer stars
    const mwCount = 8000;
    const positions = new Float32Array(mwCount * 3);
    const colors = new Float32Array(mwCount * 3);
    const rng = mulberry32(77777);
    const skyRadius = 4.5e9;

    for (let i = 0; i < mwCount; i++) {
        // Concentrate along a band (galactic plane tilted ~60° from ecliptic)
        const bandAngle = (rng() - 0.5) * 0.3; // narrow band
        const longAngle = rng() * Math.PI * 2;

        const x = skyRadius * Math.cos(longAngle) * Math.cos(bandAngle);
        const y = skyRadius * Math.sin(bandAngle);
        const z = skyRadius * Math.sin(longAngle) * Math.cos(bandAngle);

        // Tilt the band ~60 degrees
        const tiltAngle = Math.PI / 3;
        const rotY = y * Math.cos(tiltAngle) - z * Math.sin(tiltAngle);
        const rotZ = y * Math.sin(tiltAngle) + z * Math.cos(tiltAngle);

        positions[i * 3] = x;
        positions[i * 3 + 1] = rotY;
        positions[i * 3 + 2] = rotZ;

        // Milky way stars are dimmer, more white/blue
        const brightness = 0.4 + rng() * 0.4;
        colors[i * 3] = brightness;
        colors[i * 3 + 1] = brightness * (0.9 + rng() * 0.1);
        colors[i * 3 + 2] = brightness * (0.95 + rng() * 0.05);
    }

    const mwGeo = new THREE.BufferGeometry();
    mwGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    mwGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mwMat = new THREE.PointsMaterial({
        size: 1200000,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true,
        depthWrite: false,
    });

    const milkyWay = new THREE.Points(mwGeo, mwMat);
    milkyWay.name = 'milkyWay';
    scene.add(milkyWay);
}

function buildSolarSystem(scene) {
    // Sun (as a bright glowing sphere)
    const sunDist = 4.836e11; // ~93 million miles in feet
    const sunRadius = 2.28e9; // ~696,000 km in feet
    const sunGeo = new THREE.SphereGeometry(sunRadius, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({
        color: 0xffffcc,
        emissive: 0xffff00,
    });
    // For visual scale, place sun at a reduced but still huge distance
    const sunVisualDist = 2e10;
    const sunVisualRadius = sunRadius * 0.5;
    const sunGeoVis = new THREE.SphereGeometry(sunVisualRadius, 32, 32);
    const sun = new THREE.Mesh(sunGeoVis, new THREE.MeshBasicMaterial({ color: 0xffffdd }));
    sun.position.set(sunVisualDist, sunVisualDist * 0.3, -sunVisualDist * 0.5);
    sun.name = 'sun_body';
    scene.add(sun);

    // Sun glow
    const sunGlowGeo = new THREE.SphereGeometry(sunVisualRadius * 3, 16, 16);
    const sunGlowMat = new THREE.MeshBasicMaterial({
        color: 0xffeeaa,
        transparent: true,
        opacity: 0.15,
        side: THREE.BackSide,
    });
    const sunGlow = new THREE.Mesh(sunGlowGeo, sunGlowMat);
    sunGlow.position.copy(sun.position);
    scene.add(sunGlow);

    // Moon
    const moonDist = 1.261e9; // ~384,400 km in feet
    const moonRadius = 5.702e6; // ~1,737 km in feet
    const moonGeo = new THREE.SphereGeometry(moonRadius * 0.8, 24, 24);
    const moonMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.9, metalness: 0.0 });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.position.set(moonDist * 0.7, moonDist * 0.5, moonDist * 0.3);
    moon.name = 'moon';
    scene.add(moon);

    // Mars (visible as a small reddish dot)
    const marsVisualDist = 8e10;
    const marsVisualRadius = 3e8;
    const marsGeo = new THREE.SphereGeometry(marsVisualRadius, 16, 16);
    const mars = new THREE.Mesh(marsGeo, new THREE.MeshBasicMaterial({ color: 0xcc5533 }));
    mars.position.set(-marsVisualDist * 0.8, marsVisualDist * 0.2, marsVisualDist * 0.6);
    mars.name = 'mars';
    scene.add(mars);

    // Jupiter (larger, visible)
    const jupiterVisualDist = 1.5e11;
    const jupiterVisualRadius = 1.5e9;
    const jupiterGeo = new THREE.SphereGeometry(jupiterVisualRadius, 20, 20);
    const jupiter = new THREE.Mesh(jupiterGeo, new THREE.MeshBasicMaterial({ color: 0xddbb88 }));
    jupiter.position.set(jupiterVisualDist * 0.5, jupiterVisualDist * 0.1, -jupiterVisualDist * 0.8);
    jupiter.name = 'jupiter';
    scene.add(jupiter);

    // Venus (bright, close)
    const venusVisualDist = 3e10;
    const venusVisualRadius = 2e8;
    const venusGeo = new THREE.SphereGeometry(venusVisualRadius, 16, 16);
    const venus = new THREE.Mesh(venusGeo, new THREE.MeshBasicMaterial({ color: 0xffffee }));
    venus.position.set(venusVisualDist * 0.6, venusVisualDist * 0.4, venusVisualDist * 0.7);
    venus.name = 'venus';
    scene.add(venus);

    // Saturn (with ring hint)
    const saturnVisualDist = 2e11;
    const saturnVisualRadius = 1.2e9;
    const saturnGeo = new THREE.SphereGeometry(saturnVisualRadius, 20, 20);
    const saturn = new THREE.Mesh(saturnGeo, new THREE.MeshBasicMaterial({ color: 0xeecc77 }));
    saturn.position.set(-saturnVisualDist * 0.6, saturnVisualDist * 0.15, -saturnVisualDist * 0.7);
    saturn.name = 'saturn';
    scene.add(saturn);

    // Saturn ring
    const ringGeo = new THREE.RingGeometry(saturnVisualRadius * 1.5, saturnVisualRadius * 2.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xccbb88, side: THREE.DoubleSide, transparent: true, opacity: 0.5
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(saturn.position);
    ring.rotation.x = Math.PI / 3;
    scene.add(ring);
}

// ============================================
// SUB-BUILDERS
// ============================================

function buildMowingPattern(group, mats) {
    const stripWidth = 20;
    for (let i = 0; i < 10; i++) {
        const geo = new THREE.PlaneGeometry(stripWidth, FIELD.fieldRadius);
        const mat = i % 2 === 0 ? mats.grass : mats.grassDark;
        const strip = new THREE.Mesh(geo, mat);
        strip.rotation.x = -Math.PI / 2;
        strip.position.set((i - 4.5) * stripWidth, 0.015, FIELD.pitcherMoundDist + 100);
        strip.receiveShadow = true;
        group.add(strip);
    }
}

function buildBasePaths(group, mats) {
    const pathWidth = 6;
    const baseDist = FIELD.baseDist;
    const halfDiag = baseDist * Math.sqrt(2) / 2;

    const path1Geo = new THREE.PlaneGeometry(pathWidth, baseDist);
    const path1 = new THREE.Mesh(path1Geo, mats.dirt);
    path1.rotation.x = -Math.PI / 2;
    path1.rotation.z = -Math.PI / 4;
    path1.position.set(halfDiag / 2, 0.025, halfDiag / 2);
    path1.receiveShadow = true;
    group.add(path1);

    const path3 = new THREE.Mesh(path1Geo.clone(), mats.dirt);
    path3.rotation.x = -Math.PI / 2;
    path3.rotation.z = Math.PI / 4;
    path3.position.set(-halfDiag / 2, 0.025, halfDiag / 2);
    path3.receiveShadow = true;
    group.add(path3);

    const path12 = new THREE.Mesh(path1Geo.clone(), mats.dirt);
    path12.rotation.x = -Math.PI / 2;
    path12.rotation.z = Math.PI / 4;
    path12.position.set(halfDiag / 2, 0.025, baseDist + halfDiag / 2 - baseDist / 2);
    path12.receiveShadow = true;
    group.add(path12);

    const path32 = new THREE.Mesh(path1Geo.clone(), mats.dirt);
    path32.rotation.x = -Math.PI / 2;
    path32.rotation.z = -Math.PI / 4;
    path32.position.set(-halfDiag / 2, 0.025, baseDist + halfDiag / 2 - baseDist / 2);
    path32.receiveShadow = true;
    group.add(path32);
}

function buildPitcherMound(group, mats) {
    const moundGeo = new THREE.CylinderGeometry(
        FIELD.moundRadius, FIELD.moundRadius + 2, FIELD.moundHeight, 32
    );
    const mound = new THREE.Mesh(moundGeo, mats.dirtMound);
    mound.position.set(0, FIELD.moundHeight / 2, FIELD.pitcherMoundDist);
    mound.castShadow = true;
    mound.receiveShadow = true;
    group.add(mound);

    const rubberGeo = new THREE.BoxGeometry(2, 0.15, 0.5);
    const rubber = new THREE.Mesh(rubberGeo, mats.rubber);
    rubber.position.set(0, FIELD.moundHeight + 0.075, FIELD.pitcherMoundDist);
    rubber.castShadow = true;
    group.add(rubber);
}

function buildBases(group, mats) {
    const baseDist = FIELD.baseDist;
    const diagonal = baseDist * Math.sqrt(2) / 2;

    const hpShape = new THREE.Shape();
    const hpSize = 17 / 12 / 2;
    hpShape.moveTo(0, hpSize);
    hpShape.lineTo(hpSize, hpSize * 0.5);
    hpShape.lineTo(hpSize, -hpSize * 0.5);
    hpShape.lineTo(-hpSize, -hpSize * 0.5);
    hpShape.lineTo(-hpSize, hpSize * 0.5);
    hpShape.closePath();

    const hpGeo = new THREE.ExtrudeGeometry(hpShape, { depth: 0.02, bevelEnabled: false });
    const homePlate = new THREE.Mesh(hpGeo, mats.base);
    homePlate.rotation.x = -Math.PI / 2;
    homePlate.position.set(0, 0.05, 0);
    homePlate.castShadow = true;
    group.add(homePlate);

    const baseSize = 15 / 12;
    const baseGeo = new THREE.BoxGeometry(baseSize, 0.25, baseSize);

    const first = new THREE.Mesh(baseGeo, mats.base);
    first.position.set(diagonal, 0.125, diagonal);
    first.rotation.y = Math.PI / 4;
    first.castShadow = true;
    group.add(first);

    const second = new THREE.Mesh(baseGeo.clone(), mats.base);
    second.position.set(0, 0.125, diagonal * 2);
    second.rotation.y = Math.PI / 4;
    second.castShadow = true;
    group.add(second);

    const third = new THREE.Mesh(baseGeo.clone(), mats.base);
    third.position.set(-diagonal, 0.125, diagonal);
    third.rotation.y = Math.PI / 4;
    third.castShadow = true;
    group.add(third);
}

function buildFoulLines(group, mats) {
    const lineWidth = 0.33;
    const lineLength = FIELD.foulLineLength;

    const lineGeo = new THREE.PlaneGeometry(lineWidth, lineLength);
    const rightLine = new THREE.Mesh(lineGeo, mats.chalk);
    rightLine.rotation.x = -Math.PI / 2;
    rightLine.rotation.z = -Math.PI / 4;
    rightLine.position.set(
        lineLength / 2 * Math.sin(Math.PI / 4), 0.04,
        lineLength / 2 * Math.cos(Math.PI / 4)
    );
    group.add(rightLine);

    const leftLine = new THREE.Mesh(lineGeo.clone(), mats.chalk);
    leftLine.rotation.x = -Math.PI / 2;
    leftLine.rotation.z = Math.PI / 4;
    leftLine.position.set(
        -lineLength / 2 * Math.sin(Math.PI / 4), 0.04,
        lineLength / 2 * Math.cos(Math.PI / 4)
    );
    group.add(leftLine);
}

function buildHomePlateArea(group, mats) {
    const hpDirtGeo = new THREE.CircleGeometry(13, 32);
    const hpDirt = new THREE.Mesh(hpDirtGeo, mats.dirt);
    hpDirt.rotation.x = -Math.PI / 2;
    hpDirt.position.set(0, 0.02, 0);
    hpDirt.receiveShadow = true;
    group.add(hpDirt);

    const boxWidth = 4;
    const boxLength = 6;
    const boxLineW = 0.17;

    [-1, 1].forEach(side => {
        const edges = [
            { w: boxLineW, h: boxLength, x: side * (boxWidth / 2 + 1.5), z: 0 },
            { w: boxLineW, h: boxLength, x: side * (boxWidth / 2 + 1.5 + boxWidth), z: 0 },
            { w: boxWidth, h: boxLineW, x: side * (boxWidth / 2 + 1.5 + boxWidth / 2), z: boxLength / 2 },
            { w: boxWidth, h: boxLineW, x: side * (boxWidth / 2 + 1.5 + boxWidth / 2), z: -boxLength / 2 },
        ];
        edges.forEach(e => {
            const geo = new THREE.PlaneGeometry(e.w, e.h);
            const line = new THREE.Mesh(geo, mats.chalk);
            line.rotation.x = -Math.PI / 2;
            line.position.set(e.x, 0.04, e.z);
            group.add(line);
        });
    });
}

function buildWarningTrack(group, mats) {
    const innerR = FIELD.fenceDistCF - FIELD.warningTrackWidth;
    const outerR = FIELD.fenceDistCF;
    const shape = new THREE.Shape();
    const startAngle = -Math.PI / 4;
    const endAngle = Math.PI / 4;
    const segments = 48;

    for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (endAngle - startAngle) * (i / segments);
        const x = Math.sin(angle) * outerR;
        const z = Math.cos(angle) * outerR;
        if (i === 0) shape.moveTo(x, z);
        else shape.lineTo(x, z);
    }
    for (let i = segments; i >= 0; i--) {
        const angle = startAngle + (endAngle - startAngle) * (i / segments);
        shape.lineTo(Math.sin(angle) * innerR, Math.cos(angle) * innerR);
    }
    shape.closePath();

    const trackGeo = new THREE.ShapeGeometry(shape);
    const track = new THREE.Mesh(trackGeo, mats.warningTrack);
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.018;
    track.receiveShadow = true;
    group.add(track);
}

function buildOutfieldFence(group, mats) {
    const fencePoints = [
        { angle: -Math.PI / 4, dist: FIELD.fenceDistRF, height: FIELD.fenceHeight },
        { angle: -Math.PI / 8, dist: FIELD.fenceDistRCF, height: FIELD.fenceHeight },
        { angle: 0, dist: FIELD.fenceDistCF, height: FIELD.fenceHeight },
        { angle: Math.PI / 8, dist: FIELD.fenceDistLCF, height: FIELD.fenceHeight },
        { angle: Math.PI / 4, dist: FIELD.fenceDistLF, height: FIELD.wallHeightLF },
    ];

    for (let i = 0; i < fencePoints.length - 1; i++) {
        const p1 = fencePoints[i];
        const p2 = fencePoints[i + 1];
        const x1 = Math.sin(p1.angle) * p1.dist;
        const z1 = Math.cos(p1.angle) * p1.dist;
        const x2 = Math.sin(p2.angle) * p2.dist;
        const z2 = Math.cos(p2.angle) * p2.dist;
        const dx = x2 - x1;
        const dz = z2 - z1;
        const length = Math.sqrt(dx * dx + dz * dz);
        const maxH = Math.max(p1.height, p2.height);

        const fenceGeo = new THREE.BoxGeometry(length, maxH, 1);
        const fence = new THREE.Mesh(fenceGeo, mats.fence);
        fence.position.set((x1 + x2) / 2, maxH / 2, (z1 + z2) / 2);
        fence.rotation.y = -Math.atan2(dz, dx);
        fence.castShadow = true;
        fence.receiveShadow = true;
        group.add(fence);

        const padGeo = new THREE.BoxGeometry(length, 0.5, 1.2);
        const padMat = new THREE.MeshStandardMaterial({
            color: 0xFFD700, roughness: 0.6, emissive: 0x554400, emissiveIntensity: 0.2,
        });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set((x1 + x2) / 2, maxH + 0.25, (z1 + z2) / 2);
        pad.rotation.y = -Math.atan2(dz, dx);
        group.add(pad);
    }
}

function buildSpectatorStands(group, mats) {
    // Behind home plate (main grandstand)
    const standDepth = 120;
    const standHeight = 60;
    const tiers = 4;
    const tierHeight = standHeight / tiers;
    const tierDepth = standDepth / tiers;

    for (let tier = 0; tier < tiers; tier++) {
        const y = tier * tierHeight;
        const z = -FIELD.homePlateToBackstop - tier * tierDepth;
        const width = 250 + tier * 40;
        const standGeo = new THREE.BoxGeometry(width, tierHeight, tierDepth);
        const mat = tier % 2 === 0 ? mats.seats : mats.seatsGold;
        const stand = new THREE.Mesh(standGeo, mat);
        stand.position.set(0, y + tierHeight / 2, z - tierDepth / 2);
        stand.castShadow = true;
        stand.receiveShadow = true;
        group.add(stand);
    }

    // 1st base side stands (FIXED ANGLE)
    buildSideStand(group, mats, 1);
    // 3rd base side stands (FIXED ANGLE)
    buildSideStand(group, mats, -1);
    // Outfield stands
    buildOutfieldStands(group, mats);
}

function buildSideStand(group, mats, side) {
    // side: +1 = 1st base (right/+X), -1 = 3rd base (left/-X)
    const tiers = 3;
    const tierHeight = 15;
    const tierDepth = 25;
    const standLength = 300;

    // Foul line runs at 45° from home plate
    // Stands should be OUTSIDE the foul line, PARALLEL to the foul line
    const foulLineAngle = side * Math.PI / 4; // 45° or -45°

    // Direction perpendicular to foul line, pointing AWAY from field (into foul territory)
    const perpOutX = Math.cos(foulLineAngle) * side;
    const perpOutZ = -Math.sin(foulLineAngle) * side;

    for (let tier = 0; tier < tiers; tier++) {
        const y = tier * tierHeight;

        // Center of the stand along the foul line direction
        const foulLineCenterDist = 180; // How far along the foul line from HP
        const standBackDist = 110 + tier * tierDepth; // perpendicular distance from foul line

        // Position along foul line
        const alongX = Math.sin(foulLineAngle) * foulLineCenterDist;
        const alongZ = Math.cos(foulLineAngle) * foulLineCenterDist;

        // Offset perpendicular to foul line (outward from field)
        const offsetX = perpOutX * standBackDist;
        const offsetZ = perpOutZ * standBackDist;

        const standGeo = new THREE.BoxGeometry(tierDepth, tierHeight, standLength);
        const mat = tier === 0 ? mats.seats : tier === 1 ? mats.seatsGold : mats.seatsRed;
        const stand = new THREE.Mesh(standGeo, mat);

        stand.position.x = alongX + offsetX;
        stand.position.z = alongZ + offsetZ;
        stand.position.y = y + tierHeight / 2;

        // Rotate so the long axis (local Z = 300ft) runs PARALLEL to the foul line
        // rotation.y = foulLineAngle makes local Z point along (sin(angle), cos(angle)) = foul line direction
        stand.rotation.y = foulLineAngle;

        stand.castShadow = true;
        stand.receiveShadow = true;
        group.add(stand);
    }
}

function buildOutfieldStands(group, mats) {
    const segments = 12;
    const startAngle = -Math.PI / 3.5;
    const endAngle = Math.PI / 3.5;
    const baseRadius = FIELD.fenceDistCF + 20;

    for (let tier = 0; tier < 3; tier++) {
        const radius = baseRadius + tier * 25;
        const y = tier * 15;
        const height = 15;

        for (let i = 0; i < segments; i++) {
            const angle = startAngle + (endAngle - startAngle) * (i + 0.5) / segments;
            const segAngle = (endAngle - startAngle) / segments;
            const segWidth = radius * segAngle * 1.05;

            const geo = new THREE.BoxGeometry(segWidth, height, 25);
            const mat = tier === 1 ? mats.seatsGold : mats.seats;
            const stand = new THREE.Mesh(geo, mat);
            stand.position.set(
                Math.sin(angle) * radius,
                y + height / 2,
                Math.cos(angle) * radius
            );
            stand.rotation.y = angle + Math.PI;
            stand.castShadow = true;
            stand.receiveShadow = true;
            group.add(stand);
        }
    }
}

function buildScoreboard(group, mats) {
    const sbWidth = 80, sbHeight = 40, sbDepth = 3;
    const sbDist = FIELD.fenceDistCF + 80;

    const sbGeo = new THREE.BoxGeometry(sbWidth, sbHeight, sbDepth);
    const scoreboard = new THREE.Mesh(sbGeo, mats.scoreboard);
    scoreboard.position.set(0, sbHeight / 2 + 30, sbDist);
    scoreboard.castShadow = true;
    group.add(scoreboard);

    const frameGeo = new THREE.BoxGeometry(sbWidth + 4, sbHeight + 4, sbDepth + 1);
    const frame = new THREE.Mesh(frameGeo, mats.metal);
    frame.position.set(0, sbHeight / 2 + 30, sbDist + 0.5);
    group.add(frame);

    [-sbWidth / 3, sbWidth / 3].forEach(xOffset => {
        const pillarGeo = new THREE.BoxGeometry(3, 30, 3);
        const pillar = new THREE.Mesh(pillarGeo, mats.concreteDark);
        pillar.position.set(xOffset, 15, sbDist);
        group.add(pillar);
    });
}

function buildLightTowers(group, scene, mats) {
    const lightPositions = [
        { x: -200, z: -40, angle: Math.PI / 6 },
        { x: 200, z: -40, angle: -Math.PI / 6 },
        { x: -250, z: 200, angle: Math.PI / 4 },
        { x: 250, z: 200, angle: -Math.PI / 4 },
        { x: -150, z: 380, angle: Math.PI / 3 },
        { x: 150, z: 380, angle: -Math.PI / 3 },
    ];
    const towerHeight = 120;

    lightPositions.forEach((pos) => {
        const poleGeo = new THREE.CylinderGeometry(1.5, 2.5, towerHeight, 8);
        const pole = new THREE.Mesh(poleGeo, mats.lightPole);
        pole.position.set(pos.x, towerHeight / 2, pos.z);
        pole.castShadow = true;
        group.add(pole);

        const bankGeo = new THREE.BoxGeometry(20, 8, 5);
        const bankMat = new THREE.MeshStandardMaterial({
            color: 0xeeeeee, emissive: 0xffffcc, emissiveIntensity: 1.0, roughness: 0.3,
        });
        const bank = new THREE.Mesh(bankGeo, bankMat);
        bank.position.set(pos.x, towerHeight + 4, pos.z);
        bank.rotation.y = pos.angle;
        group.add(bank);

        const spotLight = new THREE.SpotLight(0xfff5e0, 3, 600, Math.PI / 4, 0.5, 1);
        spotLight.position.set(pos.x, towerHeight + 4, pos.z);
        spotLight.target.position.set(0, 0, FIELD.pitcherMoundDist);
        spotLight.castShadow = true;
        spotLight.shadow.mapSize.width = 1024;
        spotLight.shadow.mapSize.height = 1024;
        scene.add(spotLight);
        scene.add(spotLight.target);
    });
}

function buildCitySkyline(group, mats) {
    const rng = mulberry32(42);
    const numBuildings = 2000;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const materials = [mats.building, mats.buildingLight];
    const meshes = materials.map(mat => {
        const mesh = new THREE.InstancedMesh(geometry, mat, numBuildings);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
    });

    const dummy = new THREE.Object3D();
    const counts = [0, 0];

    for (let i = 0; i < numBuildings; i++) {
        const distForm = rng();
        const dist = 600 + Math.pow(distForm, 3) * 20000;
        const angle = rng() * Math.PI * 2;
        const x = Math.sin(angle) * dist;
        const z = Math.cos(angle) * dist;
        const width = 20 + rng() * 60;
        const depth = 20 + rng() * 60;
        const height = 40 + rng() * 300;

        dummy.position.set(x, height / 2, z);
        dummy.scale.set(width, height, depth);
        dummy.rotation.y = rng() * Math.PI;
        dummy.updateMatrix();

        const matIndex = i % 2;
        meshes[matIndex].setMatrixAt(counts[matIndex]++, dummy.matrix);
    }

    meshes.forEach((mesh, idx) => {
        mesh.count = counts[idx];
        mesh.instanceMatrix.needsUpdate = true;
    });
}

function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
