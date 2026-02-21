/**
 * Baseball Trajectory Physics Engine
 * Based on Alan Nathan's TrajectoryCalculator (May 2021)
 * All formulas extracted from the Excel spreadsheet
 */

// ============================================
// CONSTANTS
// ============================================
const GRAVITY = 32.174; // ft/s^2
const MPH_TO_FTS = 1.467; // 1 mph = 1.467 ft/s
const FT_TO_M = 0.3048;
const M_TO_FT = 3.2808;

// Ball properties
const DEFAULT_MASS = 5.125; // oz
const DEFAULT_CIRC = 9.125; // inches

// Drag/lift parameters (from Excel)
const CD0 = 0.3008;
const CD_SPIN = 0.0292;
const CL0 = 0.583;
const CL1 = 2.333;
const CL2 = 1.12;

// Default atmospheric conditions (Petco Park)
const DEFAULT_TEMP_F = 70;      // °F
const DEFAULT_ELEV_FT = 23;     // ft (Petco Park elevation)
const DEFAULT_RH = 50;          // % relative humidity
const DEFAULT_PRESSURE = 29.92; // inHg (barometric pressure)
const DEFAULT_BETA = 0.0001217;

// ============================================
// ATMOSPHERIC CALCULATIONS
// ============================================

/**
 * Calculate temperature in Celsius from Fahrenheit
 */
function tempFtoC(tempF) {
    return (5 / 9) * (tempF - 32);
}

/**
 * Calculate Saturation Vapor Pressure (mm Hg) using the Magnus-Tetens formula variant
 */
function satVaporPressure(tempC) {
    return 4.5841 * Math.exp((18.687 - tempC / 234.5) * tempC / (257.14 + tempC));
}

/**
 * Calculate air density in kg/m^3
 */
function airDensity(tempF, elevFt, pressureInHg, relHumidity) {
    const tempC = tempFtoC(tempF);
    const pressureMmHg = pressureInHg * 1000 / 39.37;
    const SVP = satVaporPressure(tempC);
    const beta = DEFAULT_BETA;

    return 1.2929 * (273 / (tempC + 273)) *
        (pressureMmHg * Math.exp(-beta * elevFt) - 0.3783 * relHumidity * SVP / 100) / 760;
}

/**
 * Calculate the constant c0 (combined aerodynamic constant)
 */
function calcC0(rhoKgM3, mass = DEFAULT_MASS, circ = DEFAULT_CIRC) {
    const rhoLbFt3 = rhoKgM3 * 0.06261;
    return 0.07182 * rhoLbFt3 * (5.125 / mass) * Math.pow(circ / 9.125, 2);
}

// ============================================
// TRAJECTORY CALCULATION
// ============================================

/**
 * Calculate a complete baseball trajectory
 * @param {Object} params - Launch parameters
 * @returns {Array} Array of trajectory points {t, x, y, z, vx, vy, vz, v, vmph}
 */
export function calculateTrajectory(params) {
    const {
        // Launch parameters
        speed = 95,          // mph (release/exit speed)
        theta = -3,          // degrees (release/launch angle, negative = downward for pitching)
        phi = 0,             // degrees (direction/bearing, 0 = straight, + = right)

        // Spin parameters
        backspin = 2300,     // rpm (wb)
        sidespin = 0,        // rpm (ws)
        gyrospin = 0,        // rpm (wg)

        // Starting position (ft) - in the field coordinate system
        // x = lateral (+ = right from pitcher's perspective toward 1st base)
        // y = forward (+ away from home plate toward outfield, pitcher's mound ~ 60.5 ft from HP)
        // z = vertical (+ up)
        x0 = 0,
        y0 = 55,             // Default: roughly release point on the mound
        z0 = 6,              // Default: 6 ft release height

        // Atmospheric conditions
        tempF = DEFAULT_TEMP_F,
        elevFt = DEFAULT_ELEV_FT,
        pressureInHg = DEFAULT_PRESSURE,
        relHumidity = DEFAULT_RH,

        // Wind
        vwind = 0,           // mph
        phiwind = 0,         // degrees
        hwind = 0,           // ft — height above which wind applies

        // Simulation parameters
        dt = 0.001,          // time step (s) — 0.001 for pitched, 0.01 for batted
        tau = 10000,         // spin decay time constant (s)
        flag = 1,            // 1 = spin axis tilts with velocity; 0 = fixed axis
        simTimeLimit = 600,  // max simulation time (s)
        batterHand = 'L',    // R or L

        // Mode
        mode = 'pitcher',    // 'pitcher' or 'batter'

        // Landing height (ft) — for batted ball, the height at which to stop (ground = 0)
        landingHeight = 0,
    } = params;

    // Sign for batter hand (affects spin calculations for batted balls)
    const sign = batterHand === 'R' ? 1 : -1;

    // Atmospheric calculations
    const baseRho = airDensity(tempF, elevFt, pressureInHg, relHumidity);
    const R_E = 20902231; // Radius of Earth in feet

    // Wind components
    const vxw = vwind * MPH_TO_FTS * Math.sin(phiwind * Math.PI / 180);
    const vyw = vwind * MPH_TO_FTS * Math.cos(phiwind * Math.PI / 180);

    // Initial velocity components (ft/s)
    const v0 = speed * MPH_TO_FTS;
    const thetaRad = theta * Math.PI / 180;
    const phiRad = phi * Math.PI / 180;

    let v0x, v0y, v0z;
    if (mode === 'pitcher') {
        // Pitcher: ball moves FROM mound TOWARD home plate (negative y-direction)
        v0x = -MPH_TO_FTS * speed * Math.cos(thetaRad) * Math.sin(phiRad); // Flip X so + is logical right
        v0y = -MPH_TO_FTS * speed * Math.cos(thetaRad) * Math.cos(phiRad);
        v0z = MPH_TO_FTS * speed * Math.sin(thetaRad);
    } else {
        // Batter: ball moves FROM home plate TOWARD outfield (positive y-direction)
        v0x = -MPH_TO_FTS * speed * Math.cos(thetaRad) * Math.sin(phiRad); // Flip X so + is logical right
        v0y = MPH_TO_FTS * speed * Math.cos(thetaRad) * Math.cos(phiRad);
        v0z = MPH_TO_FTS * speed * Math.sin(thetaRad);
    }

    // Angular velocity components (rad/s)
    // For pitcher mode (ball going toward HP, negative y)
    let wx, wy, wz;
    if (mode === 'pitcher') {
        wx = (-backspin * Math.cos(phiRad) -
            sidespin * Math.sin(thetaRad) * Math.sin(phiRad) +
            gyrospin * v0x / v0) * Math.PI / 30;
        wy = (backspin * Math.sin(phiRad) -
            sidespin * Math.sin(thetaRad) * Math.cos(phiRad) +
            gyrospin * v0y / v0) * Math.PI / 30;
        wz = (sidespin * Math.cos(thetaRad) +
            gyrospin * v0z / v0) * Math.PI / 30;
    } else {
        // Batter mode
        wx = (backspin * Math.cos(phiRad) -
            sidespin * Math.sin(thetaRad) * Math.sin(phiRad) +
            gyrospin * v0x / v0) * Math.PI / 30;
        wy = (-backspin * Math.sin(phiRad) -
            sidespin * Math.sin(thetaRad) * Math.cos(phiRad) +
            gyrospin * v0y / v0) * Math.PI / 30;
        wz = (sidespin * Math.cos(thetaRad) +
            gyrospin * v0z / v0) * Math.PI / 30;
    }

    // Total spin quantities
    const spinTotal = Math.sqrt(backspin * backspin + sidespin * sidespin + gyrospin * gyrospin) + 0.001;
    const omega = Math.sqrt(backspin * backspin + sidespin * sidespin) * Math.PI / 30 + 0.001;
    const romega = (DEFAULT_CIRC / (2 * Math.PI)) * omega / 12;

    // Initialize trajectory
    const trajectory = [];
    let t = 0;
    let x = x0, y = y0, z = z0;
    let vx = v0x, vy = v0y, vz = v0z;

    // Main integration loop (Euler method, matching the Excel exactly)
    while (t <= simTimeLimit) {
        const v = Math.sqrt(vx * vx + vy * vy + vz * vz);
        const vmph = v / MPH_TO_FTS;

        // Calculate perpendicular spin component
        const spinComponent = (30 / Math.PI) * (wx * vx + wy * vy + wz * vz) / v;
        const wPerp = Math.sqrt(spinTotal * spinTotal - flag * spinComponent * spinComponent);

        // Surface speed of ball
        const rOmegaPerp = (wPerp * Math.PI / 30) * (DEFAULT_CIRC / (2 * Math.PI)) / 12;

        // Effective velocity (accounting for wind)
        const vw = z >= hwind ?
            Math.sqrt(Math.pow(vx - vxw, 2) + Math.pow(vy - vyw, 2) + vz * vz) : v;
        const sxw = z >= hwind ? vxw : 0;
        const syw = z >= hwind ? vyw : 0;

        // Atmosphere scales with Altitude (up to space)
        // Earth radius R_E ~ 20.9 million ft. Real gravity decreases with square of distance from Earth Center
        const altitude = Math.max(0, z);
        const currentG = GRAVITY * Math.pow(R_E / (R_E + altitude), 2);

        // Air density decreases exponentially with altitude (scale height ~ 27900 ft)
        const currentRho = baseRho * Math.exp(-altitude / 27900);
        const co = calcC0(currentRho);

        // Drag coefficient
        const cd = CD0 + (CD_SPIN * wPerp / 1000) * Math.exp(-t / (tau * MPH_TO_FTS * 100 / vw));

        // Spin parameter S
        const S = (rOmegaPerp / vw) * Math.exp(-t / (tau * MPH_TO_FTS * 100 / vw));

        // Lift coefficient
        const cl = CL2 * S / (CL0 + CL1 * S);

        // Drag acceleration components
        let adragx = -co * cd * vw * (vx - sxw);
        let adragy = -co * cd * vw * (vy - syw);
        let adragz = -co * cd * vw * vz;

        // Prevent integration overshoot from immense drag at hypersonic velocities
        const dragMag = Math.sqrt(adragx * adragx + adragy * adragy + adragz * adragz);
        if (dragMag * dt > 0.1 * vw && dragMag > 0) {
            const scale = (0.1 * vw) / (dragMag * dt);
            adragx *= scale;
            adragy *= scale;
            adragz *= scale;
        }

        // X ratio for perpendicular component
        const xRatio = rOmegaPerp / romega;

        // Magnus acceleration components
        let aMagx = co * (cl / omega) * vw * (wy * vz - wz * (vy - syw)) / xRatio;
        let aMagy = co * (cl / omega) * vw * (wz * (vx - sxw) - wx * vz) / xRatio;
        let aMagz = co * (cl / omega) * vw * (wx * (vy - syw) - wy * (vx - sxw)) / xRatio;

        // Prevent integration overshoot from immense Magnus at extreme spins/speeds
        const aMagMag = Math.sqrt(aMagx * aMagx + aMagy * aMagy + aMagz * aMagz);
        if (aMagMag * dt > 0.05 * vw && aMagMag > 0) {
            const scale = (0.05 * vw) / (aMagMag * dt);
            aMagx *= scale;
            aMagy *= scale;
            aMagz *= scale;
        }

        // Total acceleration
        const ax = adragx + aMagx;
        const ay = adragy + aMagy;
        const az = adragz + aMagz - currentG;

        // Store trajectory point
        trajectory.push({
            t,
            x, y, z,
            vx, vy, vz,
            v, vmph,
            ax, ay, az,
            spinRPM: wPerp,
            cd, cl
        });

        // Check termination conditions
        // Earth spherical ground check
        const groundZ = Math.sqrt(Math.max(0, R_E * R_E - x * x - y * y)) - R_E;
        if (z < groundZ) {
            // Hit the ground
            break;
        }

        // Prevent infinite loops / memory overflow based on user set limit
        if (t > simTimeLimit) break;

        // Removed distance bounds check to allow unlimited travel length


        // Euler integration step
        x = x + vx * dt + 0.5 * ax * dt * dt;
        y = y + vy * dt + 0.5 * ay * dt * dt;
        z = z + vz * dt + 0.5 * az * dt * dt;
        vx = vx + ax * dt;
        vy = vy + ay * dt;
        vz = vz + az * dt;
        t += dt;
    }

    return trajectory;
}

// ============================================
// PITCH PRESETS
// ============================================
export const PITCH_PRESETS = {
    fastball: {
        name: '4-Seam Fastball',
        speed: 95,
        backspin: 2300,
        sidespin: 0,
        gyrospin: 0,
        theta: -1.5,
        phi: 0
    },
    curveball: {
        name: 'Curveball',
        speed: 80,
        backspin: -2500,
        sidespin: 200,
        gyrospin: 0,
        theta: 1,
        phi: 0
    },
    slider: {
        name: 'Slider',
        speed: 85,
        backspin: -500,
        sidespin: -2200,
        gyrospin: 400,
        theta: -1,
        phi: 0
    },
    changeup: {
        name: 'Changeup',
        speed: 84,
        backspin: 1500,
        sidespin: -500,
        gyrospin: 0,
        theta: -2,
        phi: 0
    },
    cutter: {
        name: 'Cutter',
        speed: 89,
        backspin: 1800,
        sidespin: -800,
        gyrospin: 0,
        theta: -1.5,
        phi: 0
    },
    sinker: {
        name: 'Sinker',
        speed: 93,
        backspin: 1600,
        sidespin: 600,
        gyrospin: 200,
        theta: -2.5,
        phi: 0.5
    },
    splitter: {
        name: 'Splitter',
        speed: 87,
        backspin: 1100,
        sidespin: 100,
        gyrospin: 800,
        theta: -1.5,
        phi: 0
    },
    knuckleball: {
        name: 'Knuckleball',
        speed: 78,
        backspin: 50,
        sidespin: 30,
        gyrospin: 20,
        theta: -1,
        phi: 0
    }
};

// ============================================
// BATTER PRESETS (for batted ball mode)
// ============================================
export const BATTER_PRESETS = {
    linedriveHR: {
        name: 'Line Drive HR',
        speed: 105,
        theta: 25,
        phi: 0,
        backspin: 2000,
        sidespin: -500
    },
    flyball: {
        name: 'Fly Ball',
        speed: 100,
        theta: 35,
        phi: 5,
        backspin: 2500,
        sidespin: -300
    }
};
