/**
 * Main Application - 3D Baseball Trajectory Simulator
 * Integrates Three.js scene, physics engine, and UI controls
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { calculateTrajectory, PITCH_PRESETS } from './physics.js';
import { buildStadium } from './stadium.js';

// ============================================
// GLOBALS
// ============================================
let scene, camera, renderer, controls;
let clock, animationId;
let ballMesh, trailLine, trailPoints = [];
let frozenTrails = []; // Array of frozen trail Line objects (for permanent mode)
let trajectoryData = null;
let currentFrame = 0;
let simulationTime = 0;
let isAnimating = false;
let fpsFrames = 0, fpsTime = 0;

// Camera Presets
const CAMERA_PRESETS = {
    umpire: { pos: new THREE.Vector3(0, 5.5, -3), target: new THREE.Vector3(0, 3, 60.5) }, // 打者/裁判視角
    pitcher: { pos: new THREE.Vector3(0, 6.5, 65), target: new THREE.Vector3(0, 2, 0) },   // 投手視角
    broadcast: { pos: new THREE.Vector3(0, 25, 300), target: new THREE.Vector3(0, 3, 60.5) }, // 轉播視角
    free: { pos: new THREE.Vector3(40, 20, 20), target: new THREE.Vector3(0, 5, 0) },       // 自由視角
    follow: { pos: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, 0, 0) }        // 追蹤視角
};

// ============================================
// COORDINATE CONVERSION
// ============================================
// Physics uses: x=lateral, y=forward(to outfield), z=up (all in feet)
// Three.js uses: x=lateral, y=up, z=forward
// Conversion: phys(x,y,z) -> three(x, z_phys, y_phys)
function physToThree(px, py, pz) {
    return new THREE.Vector3(px, pz, py);
}

// ============================================
// INITIALIZATION
// ============================================
async function init() {
    updateLoadingBar(10, '創建場景中...');

    // Scene - night sky (consistent before/after launch)
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);

    updateLoadingBar(20, '設定攝影機...');

    // Camera
    camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.5,
        100000000
    );

    // Renderer
    const canvas = document.getElementById('main-canvas');
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        logarithmicDepthBuffer: true,
        alpha: false,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    updateLoadingBar(30, '配置控制器...');

    // Orbit Controls
    controls = new OrbitControls(camera, renderer.domElement);

    // Swap left and right mouse buttons
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE
    };

    controls.enableDamping = false; // Disable inertia
    controls.maxDistance = 1500;
    controls.minDistance = 0.5;
    controls.maxPolarAngle = Math.PI; // Remove upward looking limit

    // Set default view to Umpire
    setCameraPreset('umpire');

    updateLoadingBar(40, '建立光影...');

    // ---- LIGHTING ----
    setupLighting();

    updateLoadingBar(55, '建立球場模型 (1:1)...');

    // ---- STADIUM ----
    buildStadium(scene);

    updateLoadingBar(75, '建立棒球與物理引擎...');

    // ---- BASEBALL ----
    createBall();

    // ---- TRAIL ----
    createTrailLine();

    updateLoadingBar(95, '初始化使用者介面...');

    // ---- CLOCK ----
    clock = new THREE.Clock();

    // ---- EVENTS ----
    window.addEventListener('resize', onResize);
    setupUI();

    updateLoadingBar(100, '準備完成！');

    // Hide loading screen
    setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hidden');
    }, 800);

    // Start render loop
    animate();
}

// ============================================
// LIGHTING — handled by stadium.js buildNightLighting()
// ============================================
function setupLighting() { }


// ============================================
// BASEBALL MESH
// ============================================
function createBall() {
    const ballRadius = (9.125 / (2 * Math.PI)) / 12; // 9.125 inches circ -> feet
    const ballGeo = new THREE.SphereGeometry(ballRadius, 32, 32);

    // Baseball material 
    const ballMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.6,
        metalness: 0.05,
        emissive: 0xffffff,
        emissiveIntensity: 0.1,
    });

    ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.castShadow = true;

    // Add red seams
    const seamGeo = new THREE.TorusGeometry(ballRadius * 0.85, ballRadius * 0.04, 8, 32);
    const seamMat = new THREE.MeshStandardMaterial({
        color: 0xcc0000,
        roughness: 0.8,
    });
    const seam1 = new THREE.Mesh(seamGeo, seamMat);
    ballMesh.add(seam1);

    const seam2 = new THREE.Mesh(seamGeo.clone(), seamMat);
    seam2.rotation.x = Math.PI / 2;
    ballMesh.add(seam2);

    // Glow sprite to make ball highly visible against backgrounds
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const ctx = glowCanvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.3, 'rgba(6, 182, 212, 0.5)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    const glowMat = new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(3, 3, 1);
    ballMesh.add(glowSprite);

    // Initial position (hide)
    ballMesh.visible = false;
    scene.add(ballMesh);
}

// ============================================
// TRAIL LINE
// ============================================
function createTrailLine() {
    const trailMat = new THREE.LineBasicMaterial({
        color: 0x00ffff,      // High contrast cyan
        linewidth: 8,         // Thick trail line
        transparent: true,
        opacity: 0.95,
    });
    const trailGeo = new THREE.BufferGeometry();
    trailLine = new THREE.Line(trailGeo, trailMat);
    trailLine.frustumCulled = false;
    scene.add(trailLine);
}

function updateTrail(newPoint, trailDuration) {
    const isPermanent = document.getElementById('ctrl-trail-permanent').checked;

    trailPoints.push({
        pos: newPoint.clone(),
        time: performance.now() / 1000
    });

    if (!isPermanent) {
        // Remove old points
        const now = performance.now() / 1000;
        trailPoints = trailPoints.filter(p => now - p.time < trailDuration);
    }

    // Update geometry
    if (trailPoints.length >= 2) {
        const positions = new Float32Array(trailPoints.length * 3);
        trailPoints.forEach((p, i) => {
            positions[i * 3] = p.pos.x;
            positions[i * 3 + 1] = p.pos.y;
            positions[i * 3 + 2] = p.pos.z;
        });
        trailLine.geometry.dispose();
        trailLine.geometry = new THREE.BufferGeometry();
        trailLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    }
}

// ============================================
// LAUNCH / SIMULATION
// ============================================
function launchBall() {
    // Get parameters from UI
    const mode = document.getElementById('mode-pitcher').classList.contains('active') ? 'pitcher' : 'batter';

    const speed = parseFloat(document.getElementById('ctrl-speed-num').value);
    const backspin = parseFloat(document.getElementById('ctrl-backspin-num').value);
    const sidespin = parseFloat(document.getElementById('ctrl-sidespin-num').value);
    const gyroAngle = parseFloat(document.getElementById('ctrl-gyroangle-num').value) || 0;
    const totalSpin = parseFloat(document.getElementById('ctrl-spinrate-num').value) || 0;
    const gyrospin = totalSpin * Math.sin(gyroAngle * Math.PI / 180);
    const simTimeLimit = parseFloat(document.getElementById('ctrl-sim-time-num').value) || 150;

    const theta = parseFloat(document.getElementById('ctrl-angle-num').value);
    const phi = parseFloat(document.getElementById('ctrl-direction-num').value);

    // Position
    const forwardOffset = parseFloat(document.getElementById('ctrl-px-num').value);
    const heightOffset = parseFloat(document.getElementById('ctrl-pz-num').value);
    const lateralOffset = parseFloat(document.getElementById('ctrl-plr-num').value);

    let x0, y0, z0;
    if (mode === 'pitcher') {
        // Pitcher mode: release from mound area
        // Mound is at y=60.5 ft. The pitch is usually released 5.5-6.5 ft IN FRONT of the rubber.
        y0 = 60.5 - forwardOffset;
        z0 = 0.833 + heightOffset; // Mound height + offset
        x0 = lateralOffset;
    } else {
        // Batter mode: from home plate center
        y0 = 0;
        z0 = 2.0; // Contact height roughly 2ft
        x0 = 0;
    }

    // Calculate trajectory
    const dt = mode === 'pitcher' ? 0.001 : 0.005;
    trajectoryData = calculateTrajectory({
        speed,
        theta,
        phi,
        backspin,
        sidespin,
        gyrospin,
        x0,
        y0,
        z0,
        mode,
        dt,
        simTimeLimit,
        flag: 1,
        elevFt: 23, // Petco Park elevation
    });

    // Reset animation
    currentFrame = 0;
    simulationTime = 0;
    isAnimating = true;

    // Handle trail on relaunch
    if (document.getElementById('ctrl-trail-permanent').checked) {
        // Freeze the current trail as a separate Line so no teleport line appears
        if (trailPoints.length >= 2) {
            const positions = new Float32Array(trailPoints.length * 3);
            trailPoints.forEach((p, i) => {
                positions[i * 3] = p.pos.x;
                positions[i * 3 + 1] = p.pos.y;
                positions[i * 3 + 2] = p.pos.z;
            });
            const frozenGeo = new THREE.BufferGeometry();
            frozenGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            const frozenMat = new THREE.LineBasicMaterial({
                color: 0x00ffff, linewidth: 8, transparent: true, opacity: 0.7,
            });
            const frozenLine = new THREE.Line(frozenGeo, frozenMat);
            frozenLine.frustumCulled = false;
            scene.add(frozenLine);
            frozenTrails.push(frozenLine);
        }
    }
    // Always clear current trail points for the new launch
    trailPoints = [];
    trailLine.geometry.dispose();
    trailLine.geometry = new THREE.BufferGeometry();

    ballMesh.visible = true;

    // Set initial position
    const p0 = trajectoryData[0];
    const pos3d = physToThree(p0.x, p0.y, p0.z);
    ballMesh.position.copy(pos3d);

    // Reset previous ball pos for follow cam
    previousBallPos = null;

    // Reset clock delta so we don't jump based on idle time
    clock.getDelta();
}

let previousBallPos = null;

function resetSimulation() {
    isAnimating = false;
    trajectoryData = null;
    currentFrame = 0;
    simulationTime = 0;
    ballMesh.visible = false;

    if (!document.getElementById('ctrl-trail-permanent').checked) {
        trailPoints = [];
        // Clear current trail
        trailLine.geometry.dispose();
        trailLine.geometry = new THREE.BufferGeometry();
        // Also remove all frozen trails
        frozenTrails.forEach(ft => {
            ft.geometry.dispose();
            ft.material.dispose();
            scene.remove(ft);
        });
        frozenTrails = [];
    }

    // Reset HUD
    updateHUD({});
}

// ============================================
let currentCameraMode = 'umpire';

// ============================================
// ANIMATION LOOP (Strict real-time matching)
// ============================================
function animate() {
    animationId = requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // FPS counter
    fpsFrames++;
    fpsTime += delta;
    if (fpsTime >= 1) {
        document.getElementById('fps-counter').textContent = `FPS: ${fpsFrames}`;
        fpsFrames = 0;
        fpsTime = 0;
    }

    // Update ball animation perfectly matching physical real-time
    if (isAnimating && trajectoryData) {
        const trailDuration = parseFloat(document.getElementById('ctrl-trail-num').value);

        // Add delta time to our internal simulation tracker
        simulationTime += delta;

        // Advance to the current physical frame
        while (currentFrame < trajectoryData.length - 1 && trajectoryData[currentFrame + 1].t <= simulationTime) {
            currentFrame++;
        }

        const point = trajectoryData[currentFrame];
        const pos3d = physToThree(point.x, point.y, point.z);

        ballMesh.position.copy(pos3d);

        // If in follow camera mode, update camera to follow ball
        if (currentCameraMode === 'follow') {
            if (!previousBallPos) {
                // Initial jump to follow position
                previousBallPos = pos3d.clone();
                const cameraOffset = new THREE.Vector3(0, 3, -15);
                camera.position.copy(pos3d).add(cameraOffset);
                controls.target.copy(pos3d);
            } else {
                // Move camera natively with the ball, preserving user rotation/zoom
                const diff = pos3d.clone().sub(previousBallPos);
                camera.position.add(diff);
                controls.target.copy(pos3d);
                previousBallPos.copy(pos3d);
            }
        }

        // Rotate ball visually dependent on real speed
        ballMesh.rotation.x += delta * 15;
        ballMesh.rotation.z += delta * 8;

        // Update trail
        updateTrail(pos3d, trailDuration);

        // Update HUD
        updateHUD(point);

        // Night sky stays consistent (no dynamic color change)

        // End simulation if we reached the last frame
        if (currentFrame >= trajectoryData.length - 1) {
            isAnimating = false;
        }
    }

    controls.update();
    renderer.render(scene, camera);
}

// ============================================
// HUD UPDATE
// ============================================
function updateHUD(point) {
    if (point && point.vmph !== undefined) {
        document.getElementById('hud-speed-val').textContent = point.vmph.toFixed(1);
        document.getElementById('hud-spin-val').textContent = (point.spinRPM || 0).toFixed(0);
        document.getElementById('hud-distance-val').textContent =
            Math.sqrt(point.x * point.x + point.y * point.y).toFixed(1);
        document.getElementById('hud-height-val').textContent = point.z.toFixed(1);
        document.getElementById('hud-time-val').textContent = point.t.toFixed(3);
    } else {
        document.getElementById('hud-speed-val').textContent = '--';
        document.getElementById('hud-spin-val').textContent = '--';
        document.getElementById('hud-distance-val').textContent = '--';
        document.getElementById('hud-height-val').textContent = '--';
        document.getElementById('hud-time-val').textContent = '--';
    }
}

// ============================================
// UI SETUP
// ============================================
function setupUI() {
    // Launch buttons
    document.getElementById('btn-launch').addEventListener('click', launchBall);
    document.getElementById('btn-reset').addEventListener('click', resetSimulation);

    // Panel toggle
    document.getElementById('panel-toggle').addEventListener('click', () => {
        document.getElementById('control-panel').classList.toggle('collapsed');
    });

    // Camera buttons
    document.getElementById('cam-umpire').addEventListener('click', (e) => setActiveCameraBtn(e.target, 'umpire'));
    document.getElementById('cam-pitcher').addEventListener('click', (e) => setActiveCameraBtn(e.target, 'pitcher'));
    document.getElementById('cam-broadcast').addEventListener('click', (e) => setActiveCameraBtn(e.target, 'broadcast'));
    document.getElementById('cam-free').addEventListener('click', (e) => setActiveCameraBtn(e.target, 'free'));
    document.getElementById('cam-follow').addEventListener('click', (e) => setActiveCameraBtn(e.target, 'follow'));

    // System Mode toggle
    function applyNormalMode() {
        document.getElementById('ctrl-speed').max = 105;
        document.getElementById('ctrl-spinrate').max = 4000;
        document.getElementById('ctrl-sim-time').max = 12;
    }
    function applySpaceMode() {
        document.getElementById('ctrl-speed').max = 500000;
        document.getElementById('ctrl-spinrate').max = 500000;
        document.getElementById('ctrl-sim-time').max = 6000;
    }

    document.getElementById('mode-normal').addEventListener('click', (e) => {
        e.target.classList.add('active');
        document.getElementById('mode-space').classList.remove('active');
        applyNormalMode();
    });

    document.getElementById('mode-space').addEventListener('click', (e) => {
        e.target.classList.add('active');
        document.getElementById('mode-normal').classList.remove('active');
        applySpaceMode();
    });

    // Apply correct initial mode on page load
    if (document.getElementById('mode-normal').classList.contains('active')) {
        applyNormalMode();
    } else {
        applySpaceMode();
    }

    // Mode buttons
    document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn[data-mode]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const mode = btn.dataset.mode;
            const positionPitcher = document.getElementById('position-pitcher');

            if (mode === 'batter') {
                positionPitcher.style.display = 'none';
                document.getElementById('lbl-speed').textContent = '擊球初速 (mph)';
                document.getElementById('lbl-angle').textContent = '擊球仰角 (°)';
                document.getElementById('lbl-direction').textContent = '擊球方向 (+右/-左) (°)';
                setControlValue('ctrl-speed', 100);
                setControlValue('ctrl-angle', 25);
                setControlValue('ctrl-backspin', 2000);
                setControlValue('ctrl-sidespin', -500);
            } else {
                positionPitcher.style.display = 'block';
                document.getElementById('lbl-speed').textContent = '出手速度 (mph)';
                document.getElementById('lbl-angle').textContent = '出手仰角 (°)';
                document.getElementById('lbl-direction').textContent = '出手方向 (+右/-左) (°)';
                setControlValue('ctrl-speed', 95);
                setControlValue('ctrl-angle', -1.5);
                setControlValue('ctrl-backspin', 2300);
                setControlValue('ctrl-sidespin', 0);
            }
        });
    });

    // Sync sliders
    const controlIds = [
        'ctrl-speed', 'ctrl-backspin', 'ctrl-sidespin', 'ctrl-gyrospin', 'ctrl-gyroangle',
        'ctrl-angle', 'ctrl-direction', 'ctrl-px', 'ctrl-pz', 'ctrl-plr', 'ctrl-trail',
        'ctrl-spinrate', 'ctrl-sim-time', 'ctrl-fov'
    ];

    controlIds.forEach(id => {
        const slider = document.getElementById(id);
        const numInput = document.getElementById(id + '-num');

        if (slider && numInput) {
            slider.addEventListener('input', () => {
                numInput.value = slider.value;
                if (id === 'ctrl-spinrate' || id === 'ctrl-gyroangle') updateSpinComponents();
                if (id === 'ctrl-fov') updateFov(parseFloat(slider.value));
            });
            numInput.addEventListener('input', () => {
                // Allows user to override slider limit
                if (parseFloat(numInput.value) > parseFloat(slider.max)) slider.max = numInput.value;
                if (parseFloat(numInput.value) < parseFloat(slider.min)) slider.min = numInput.value;
                slider.value = numInput.value;
                if (id === 'ctrl-spinrate' || id === 'ctrl-gyroangle') updateSpinComponents();
                if (id === 'ctrl-fov') updateFov(parseFloat(numInput.value));
            });
        }
    });

    function updateFov(val) {
        if (!camera) return;
        let f = val;
        if (f < 10) f = 10;
        if (f > 180) f = 180;
        camera.fov = f;
        camera.updateProjectionMatrix();
    }

    // Spin Direction Logic
    const spinDirSlider = document.getElementById('ctrl-spindirection');
    const spinHr = document.getElementById('ctrl-spin-hour');
    const spinMin = document.getElementById('ctrl-spin-min');

    function updateSpinDirectionFromSlider() {
        let val = parseInt(spinDirSlider.value);
        let hr = Math.floor(val / 60);
        let ms = val % 60;
        if (hr === 0) hr = 12;
        spinHr.value = hr;
        spinMin.value = ms < 10 ? '0' + ms : ms;
        updateSpinComponents();
    }

    function updateSpinDirectionFromInputs() {
        let hr = parseInt(spinHr.value) || 12;
        let ms = parseInt(spinMin.value) || 0;
        if (hr === 12) hr = 0;
        spinDirSlider.value = hr * 60 + ms;
        updateSpinComponents();
    }

    function updateSpinComponents() {
        const totalSpin = parseFloat(document.getElementById('ctrl-spinrate-num').value) || 0;
        const gyroAngle = parseFloat(document.getElementById('ctrl-gyroangle-num').value) || 0;
        const activeSpin = totalSpin * Math.cos(gyroAngle * Math.PI / 180);

        let hr = parseInt(spinHr.value) || 12;
        let ms = parseInt(spinMin.value) || 0;
        if (hr === 12) hr = 0;

        // Convert clock time to angle (12:00 is 0 deg straight backspin)
        // 1 hour = 30 deg, 1 min = 0.5 deg
        const totalMinutes = hr * 60 + ms;
        const angleDeg = (totalMinutes / 720) * 360;
        const angleRad = angleDeg * Math.PI / 180;

        // Update hidden inputs based on activeSpin
        const backspin = activeSpin * Math.cos(angleRad);
        const sidespin = activeSpin * Math.sin(angleRad);

        setControlValue('ctrl-backspin', Math.round(backspin));
        setControlValue('ctrl-sidespin', Math.round(sidespin));
    }

    if (spinDirSlider) spinDirSlider.addEventListener('input', updateSpinDirectionFromSlider);
    if (spinHr) spinHr.addEventListener('input', updateSpinDirectionFromInputs);
    if (spinMin) spinMin.addEventListener('input', updateSpinDirectionFromInputs);

    // Presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetKey = btn.dataset.preset;
            const preset = PITCH_PRESETS[presetKey];
            if (preset) {
                document.getElementById('mode-pitcher').click();
                setControlValue('ctrl-speed', preset.speed);
                setControlValue('ctrl-gyrospin', preset.gyrospin);
                setControlValue('ctrl-angle', preset.theta);
                setControlValue('ctrl-direction', preset.phi);

                // Calculate spinrate, gyroangle, and clock direction from presets
                const activeSpin = Math.sqrt(preset.backspin * preset.backspin + preset.sidespin * preset.sidespin);
                const totalSpin = Math.sqrt(activeSpin * activeSpin + preset.gyrospin * preset.gyrospin);
                setControlValue('ctrl-spinrate', Math.round(totalSpin));

                let gyroAngleRad = Math.atan2(preset.gyrospin, activeSpin);
                setControlValue('ctrl-gyroangle', Math.round(gyroAngleRad * 180 / Math.PI));

                let angleRad = Math.atan2(preset.sidespin, preset.backspin);
                if (angleRad < 0) angleRad += 2 * Math.PI;
                let totalMinutes = Math.round((angleRad * 180 / Math.PI) / 360 * 720);

                if (document.getElementById('ctrl-spindirection')) {
                    document.getElementById('ctrl-spindirection').value = totalMinutes;
                    updateSpinDirectionFromSlider();
                }
            }
        });
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
            e.preventDefault();
            launchBall();
        }
        if ((e.code === 'KeyR' || e.key === 'r') && e.target.tagName !== 'INPUT') {
            resetSimulation();
        }
    });
}

function setControlValue(baseId, value) {
    const slider = document.getElementById(baseId);
    const numInput = document.getElementById(baseId + '-num');
    if (slider) slider.value = value;
    if (numInput) numInput.value = value;
}

function setActiveCameraBtn(btn, presetName) {
    currentCameraMode = presetName;
    const container = btn.parentElement;
    container.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setCameraPreset(presetName);
}

function setCameraPreset(presetName) {
    const preset = CAMERA_PRESETS[presetName];
    if (preset) {
        camera.position.copy(preset.pos);
        controls.target.copy(preset.target);
        controls.update();
    }
}

// ============================================
// RESIZE HANDLER
// ============================================
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// LOADING BAR
// ============================================
function updateLoadingBar(percent, text) {
    const bar = document.getElementById('loading-bar');
    const textEl = document.getElementById('loading-text');
    if (bar) bar.style.width = percent + '%';
    if (textEl) textEl.textContent = text;
}

// ============================================
// START
// ============================================
init();
