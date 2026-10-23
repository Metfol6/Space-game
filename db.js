/**
 * SPACE 4X TACTICS - ADATBÁZIS RÉTEG (node:sqlite)
 * Perzisztens SQLite adatbázis kezelés natív Node 24 modullal.
 */

let DatabaseSync;
try {
    DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (e) {
    if (e.code === 'ERR_UNKNOWN_BUILTIN_MODULE' && !process.env._SQLITE_RESPAWNED) {
        const { spawnSync } = require('node:child_process');
        const res = spawnSync(process.execPath, ['--experimental-sqlite', ...process.argv.slice(1)], {
            stdio: 'inherit',
            env: { ...process.env, _SQLITE_RESPAWNED: '1' }
        });
        process.exit(res.status ?? (res.signal ? 1 : 0));
    }
    throw e;
}
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, 'game.db');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

// 5 alrendszer slot hajóosztályonként (Összesen 5 alrendszer x 3 szint = 15 szint lehetőség hajónként).
// Szigorú 60%-os korlát: max 3 alrendszer aktiválható (szint >= 1) egyszerre!
const ALL_SHIP_TYPES = [
    'scout', 'interceptor', 'corvette', 'freighter', 'colony_ship',
    'frigate', 'destroyer', 'heavy_destroyer', 'cruiser', 'battleship'
];

const SHIP_TECH_REQUIREMENTS = {
    scout: null,
    corvette: null,
    freighter: null,
    interceptor: 'ion_thrusters',
    colony_ship: 'automated_dock',
    frigate: 'extended_shielding',
    destroyer: 'heavy_metallurgy',
    heavy_destroyer: 'siege_warheads',
    cruiser: 'antimatter_containment',
    battleship: 'hyperspace_gate'
};

const SUBSYSTEM_HOTSPOTS = {
    scout: {
        weapon: { x: 20, y: 50, label: 'Orr-Szenzor & EMP Zavarmag', icon: '⚡' },
        hull: { x: 50, y: 55, label: 'Könnyített Titán Törzs', icon: '🛡️' },
        engine: { x: 82, y: 50, label: 'Tachion Hajtómű & Fúvókák', icon: '🚀' }
    },
    interceptor: {
        weapon: { x: 80, y: 50, label: 'Iker Plazmaágyúk', icon: '🔫' },
        hull: { x: 50, y: 50, label: 'Kompakt Titánváz', icon: '🛡️' },
        shield: { x: 40, y: 35, label: 'Mikropajzs Generátor', icon: '🌐' },
        engine: { x: 18, y: 50, label: 'Hiperszonikus Utánégetők', icon: '🚀' }
    },
    corvette: {
        weapon: { x: 22, y: 55, label: 'Túltöltött Pulzuslézerek', icon: '🔫' },
        hull: { x: 42, y: 48, label: 'Karbonszálas Hull Páncél', icon: '🛡️' },
        shield: { x: 60, y: 32, label: 'Fázispajzs Generátor', icon: '🌐' },
        engine: { x: 85, y: 48, label: 'Ionos Utánégető Turbinák', icon: '🚀' },
        avionics: { x: 22, y: 38, label: 'Mélyűr Zavarórendszer', icon: '📻' }
    },
    freighter: {
        weapon: { x: 82, y: 52, label: 'Önvédelmi Védelmi Gépágyú', icon: '🎯' },
        hull: { x: 48, y: 50, label: 'Megerősített Teherkonténer Váz', icon: '🛡️' },
        shield: { x: 62, y: 35, label: 'Védőhálós Szállítópajzs', icon: '🌐' },
        engine: { x: 16, y: 50, label: 'Nehézteher Hajtómű-Array', icon: '🚀' }
    },
    colony_ship: {
        weapon: { x: 15, y: 52, label: 'Automata Védelmi Ágyú', icon: '🎯' },
        hull: { x: 50, y: 50, label: 'Megerősített Kamrák', icon: '🛡️' },
        shield: { x: 62, y: 42, label: 'Kupolapajzs Burok', icon: '🫧' },
        avionics: { x: 20, y: 35, label: 'Krio-Sztázis Kolóniamodul', icon: '❄️' }
    },
    frigate: {
        weapon: { x: 78, y: 50, label: 'Kvantum-Torpedó Kilövők', icon: '💥' },
        hull: { x: 45, y: 50, label: 'Lopakodó Ék-Páncél', icon: '🛡️' },
        shield: { x: 58, y: 35, label: 'Torzító Mezőgenerátor', icon: '🌐' },
        engine: { x: 16, y: 50, label: 'Lopakodó Ionhajtómű', icon: '🚀' },
        avionics: { x: 50, y: 22, label: 'Torpedó Célkövető Szenzor', icon: '📡' }
    },
    destroyer: {
        weapon: { x: 48, y: 32, label: 'Gauss Nehézágyúk & Silók', icon: '💥' },
        hull: { x: 32, y: 52, label: 'Ablatív Kompozit Páncél', icon: '🛡️' },
        shield: { x: 68, y: 68, label: 'Pajzs-Szinkronizáló Erősítő', icon: '🔋' },
        engine: { x: 84, y: 50, label: 'Fényalatti Turbina Array', icon: '☄️' },
        avionics: { x: 68, y: 26, label: 'Torpedó-Elhárító & Célzórendszer', icon: '🚀' }
    },
    heavy_destroyer: {
        weapon: { x: 75, y: 28, label: 'Iker Ostrom-Mauler Ágyúk', icon: '💥' },
        hull: { x: 45, y: 50, label: 'Vastagított Titán Páncélzat', icon: '🛡️' },
        shield: { x: 65, y: 50, label: 'Rezonáns Védőpajzs', icon: '🌐' },
        engine: { x: 16, y: 50, label: 'Nehéz Tolóerő Turbinák', icon: '🚀' },
        avionics: { x: 52, y: 20, label: 'Ballisztikai Ostrom-Komputer', icon: '🎯' }
    },
    cruiser: {
        weapon: { x: 52, y: 48, label: 'Drónhangár & Indítósínek', icon: '🛸' },
        hull: { x: 35, y: 50, label: 'Rétegelt Hordozó Váz', icon: '🛡️' },
        shield: { x: 65, y: 35, label: 'Hordozópajzs Generátor', icon: '🌐' },
        engine: { x: 16, y: 50, label: 'Vektoros Cirkáló Hajtómű', icon: '🚀' },
        avionics: { x: 50, y: 16, label: 'Drón-Rajvezérlő Mátrix', icon: '📡' }
    },
    battleship: {
        weapon: { x: 26, y: 50, label: 'Spinalis Gerinc-Railgun', icon: '⚡' },
        hull: { x: 52, y: 50, label: 'Dreadnought Páncéllemezek', icon: '🧱' },
        shield: { x: 66, y: 34, label: 'Erődpajzs Generátor', icon: '🛡️' },
        engine: { x: 88, y: 50, label: 'Antianyag Térhajtómű', icon: '🌌' },
        avionics: { x: 62, y: 22, label: 'Flak Elhárító & Harcirányítás', icon: '🎯' }
    }
};

const SUBSYSTEM_BONUS_TABLES = {
    scout: {
        enemy_accuracy_penalty: [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50],
        hull: [0, 15, 30, 50, 75, 105, 140, 180, 225, 275, 330],
        speed: [0, 2.0, 4.0, 6.0, 8.5, 11.0, 14.0, 17.5, 21.0, 25.0, 30.0]
    },
    interceptor: {
        damage: [0, 10, 20, 30, 42, 54, 66, 78, 90, 100, 110],
        hull: [0, 18, 36, 56, 78, 102, 128, 156, 186, 218, 250],
        shield: [0, 12, 24, 38, 54, 72, 92, 114, 138, 164, 190],
        speed: [0, 1.5, 3.0, 4.5, 6.0, 7.5, 9.0, 10.5, 12.0, 13.5, 15.0]
    },
    corvette: {
        damage: [0, 8, 16, 26, 38, 52, 68, 86, 106, 128, 155],
        hull: [0, 25, 50, 80, 120, 165, 215, 270, 330, 395, 470],
        shield: [0, 20, 40, 65, 95, 130, 170, 215, 265, 320, 380],
        speed: [0, 1.0, 2.0, 3.2, 4.5, 6.0, 7.6, 9.4, 11.4, 13.6, 16.0],
        evasion: [0, 0.08, 0.16, 0.24, 0.32, 0.40, 0.47, 0.54, 0.60, 0.66, 0.72]
    },
    freighter: {
        damage: [0, 6, 12, 18, 25, 33, 42, 52, 62, 72, 85],
        hull: [0, 50, 105, 165, 230, 300, 375, 455, 540, 630, 725],
        shield: [0, 25, 52, 82, 115, 150, 190, 235, 285, 340, 400],
        speed: [0, 0.6, 1.2, 1.9, 2.7, 3.5, 4.4, 5.4, 6.5, 7.7, 9.0]
    },
    colony_ship: {
        damage: [0, 10, 20, 32, 46, 62, 80, 100, 122, 146, 175],
        hull: [0, 60, 130, 210, 300, 400, 510, 630, 760, 900, 1060],
        shield: [0, 40, 85, 135, 190, 250, 315, 385, 460, 540, 630],
        bonus_colony_metal: [0, 100, 200, 320, 460, 620, 800, 1000, 1250, 1550, 2000],
        bonus_colony_energy: [0, 0, 50, 100, 180, 280, 400, 550, 720, 920, 1200],
        bonus_colony_isotope: [0, 0, 0, 0, 0, 20, 40, 70, 110, 160, 220]
    },
    frigate: {
        damage: [0, 20, 40, 62, 86, 112, 140, 170, 202, 236, 275],
        hull: [0, 40, 85, 135, 190, 250, 315, 385, 460, 540, 625],
        shield: [0, 25, 55, 90, 130, 175, 225, 280, 340, 405, 475],
        speed: [0, 0.8, 1.6, 2.5, 3.5, 4.6, 5.8, 7.1, 8.5, 10.0, 11.8],
        accuracy: [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.29, 0.33, 0.37, 0.41, 0.45],
        evasion: [0, 0.04, 0.08, 0.12, 0.16, 0.20, 0.24, 0.28, 0.31, 0.34, 0.37]
    },
    destroyer: {
        damage: [0, 25, 50, 80, 115, 155, 200, 250, 305, 365, 435],
        hull: [0, 100, 210, 330, 460, 600, 750, 910, 1080, 1260, 1460],
        shield: [0, 70, 150, 240, 340, 450, 570, 700, 840, 990, 1160],
        speed: [0, 0.8, 1.6, 2.5, 3.5, 4.6, 5.8, 7.1, 8.5, 10.0, 11.8],
        accuracy: [0, 0.08, 0.15, 0.22, 0.28, 0.34, 0.39, 0.44, 0.48, 0.52, 0.56],
        evasion: [0, 0.02, 0.05, 0.08, 0.12, 0.16, 0.20, 0.24, 0.28, 0.32, 0.36]
    },
    heavy_destroyer: {
        damage: [0, 60, 125, 195, 270, 350, 435, 525, 620, 720, 830],
        hull: [0, 200, 420, 660, 920, 1200, 1500, 1820, 2160, 2520, 2900],
        shield: [0, 20, 42, 66, 92, 120, 150, 182, 216, 252, 290],
        speed: [0, 0.4, 0.8, 1.3, 1.9, 2.5, 3.2, 4.0, 4.8, 5.7, 6.7],
        accuracy: [0, 0.04, 0.08, 0.12, 0.16, 0.20, 0.24, 0.28, 0.32, 0.36, 0.40]
    },
    cruiser: {
        damage: [0, 18, 38, 60, 84, 110, 138, 168, 200, 234, 270],
        hull: [0, 160, 340, 540, 760, 1000, 1260, 1540, 1840, 2160, 2500],
        shield: [0, 90, 190, 300, 420, 550, 690, 840, 1000, 1170, 1350],
        speed: [0, 0.6, 1.2, 1.9, 2.7, 3.5, 4.4, 5.4, 6.5, 7.7, 9.0],
        evasion: [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.24, 0.27, 0.30]
    },
    battleship: {
        damage: [0, 80, 170, 270, 380, 500, 630, 770, 920, 1080, 1260],
        hull: [0, 350, 750, 1200, 1700, 2250, 2850, 3500, 4200, 4950, 5800],
        shield: [0, 220, 460, 720, 1000, 1300, 1620, 1960, 2320, 2700, 3120],
        speed: [0, 0.6, 1.3, 2.1, 3.0, 4.0, 5.1, 6.3, 7.6, 9.0, 10.6],
        anti_corvette_accuracy: [0, 0.10, 0.18, 0.26, 0.34, 0.41, 0.48, 0.54, 0.60, 0.65, 0.70],
        evasion: [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.24, 0.27, 0.30]
    }
};

const ROMAN_NUMS = ['Mk.I', 'Mk.II', 'Mk.III', 'Mk.IV', 'Mk.V', 'Mk.VI', 'Mk.VII', 'Mk.VIII', 'Mk.IX', 'Mk.X (Apex)'];
const LEVEL_TITLES = [
    'Alap', 'Megerősített', 'Optimalizált', 'Továbbfejlesztett', 'Nehéz',
    'Katonai', 'Csúcsminőségű', 'Prototípus', 'Kvantum-kalibrált', 'Apex Mestermű'
];

function calculateSubsystemCost(shipType, level) {
    const mults = {
        scout: { m: 15, e: 10, i_t2: 8, i_t3: 15 },
        interceptor: { m: 20, e: 12, i_t2: 8, i_t3: 16 },
        corvette: { m: 25, e: 15, i_t2: 10, i_t3: 20 },
        freighter: { m: 35, e: 20, i_t2: 12, i_t3: 22 },
        colony_ship: { m: 40, e: 25, i_t2: 12, i_t3: 22 },
        frigate: { m: 45, e: 25, i_t2: 14, i_t3: 26 },
        destroyer: { m: 60, e: 35, i_t2: 18, i_t3: 32 },
        heavy_destroyer: { m: 85, e: 45, i_t2: 24, i_t3: 42 },
        cruiser: { m: 90, e: 55, i_t2: 26, i_t3: 46 },
        battleship: { m: 120, e: 70, i_t2: 32, i_t3: 55 }
    }[shipType] || { m: 25, e: 15, i_t2: 10, i_t3: 20 };

    const metal = mults.m * level;
    const energy = mults.e * level;
    let isotope = 0;
    if (level >= 4 && level <= 6) {
        isotope = (level - 3) * mults.i_t2;
    } else if (level >= 7) {
        isotope = 3 * mults.i_t2 + (level - 6) * mults.i_t3;
    }
    return { cost_metal: metal, cost_energy: energy, cost_isotope: isotope };
}

function generateSubsystemLevels(shipType, slotKey) {
    const levels = [];
    const tables = SUBSYSTEM_BONUS_TABLES[shipType];
    if (!tables) return levels;

    const baseStats = {
        scout: { hull: 40, shield: 0, damage: 0, speed: 9.0 },
        interceptor: { hull: 70, shield: 25, damage: 45, speed: 10.0 },
        corvette: { hull: 120, shield: 40, damage: 35, speed: 5.5 },
        freighter: { hull: 350, shield: 60, damage: 20, speed: 4.0 },
        colony_ship: { hull: 200, shield: 50, damage: 0, speed: 3.0 },
        frigate: { hull: 280, shield: 120, damage: 85, speed: 4.5 },
        destroyer: { hull: 450, shield: 200, damage: 110, speed: 3.5 },
        heavy_destroyer: { hull: 950, shield: 70, damage: 260, speed: 2.4 },
        cruiser: { hull: 800, shield: 400, damage: 75, speed: 3.0 },
        battleship: { hull: 1600, shield: 800, damage: 380, speed: 2.0 }
    }[shipType] || { hull: 100, shield: 0, damage: 10, speed: 3.0 };

    for (let lvl = 1; lvl <= 10; lvl++) {
        const req_tier = lvl <= 3 ? 1 : (lvl <= 6 ? 2 : 3);
        const cost = calculateSubsystemCost(shipType, lvl);
        const name = `${ROMAN_NUMS[lvl - 1]} ${LEVEL_TITLES[lvl - 1]}`;
        let desc = '';
        let stats = {};

        if (slotKey === 'weapon') {
            if (shipType === 'scout') {
                const pen = (tables.enemy_accuracy_penalty && tables.enemy_accuracy_penalty[lvl]) || 0;
                stats = { enemy_accuracy_penalty: pen };
                desc = `-${Math.round(pen * 100)}% ellenséges pontosság az EMP mező miatt`;
            } else {
                const dmg = (tables.damage && tables.damage[lvl]) || 0;
                stats = { damage: dmg };
                desc = `+${dmg} sebzés (${baseStats.damage} -> ${baseStats.damage + dmg} DMG)`;
            }
        } else if (slotKey === 'hull') {
            const h = (tables.hull && tables.hull[lvl]) || 0;
            stats = { hull: h };
            desc = `+${h} hajótest HP (${baseStats.hull} -> ${baseStats.hull + h} HP)`;
        } else if (slotKey === 'shield') {
            const s = (tables.shield && tables.shield[lvl]) || 0;
            stats = { shield: s };
            if (shipType === 'destroyer') stats.shield_sync_boost = true;
            desc = `+${s} energiapajzs (${baseStats.shield} -> ${baseStats.shield + s} Pajzs)${shipType === 'destroyer' ? ' és szinkronizáció' : ''}`;
        } else if (slotKey === 'engine') {
            const sp = (tables.speed && tables.speed[lvl]) || 0;
            stats = { speed: sp };
            desc = `+${sp.toFixed(1)} sebesség (${baseStats.speed.toFixed(1)} -> ${(baseStats.speed + sp).toFixed(1)})`;
        } else if (slotKey === 'avionics') {
            if (shipType === 'corvette') {
                const eva = (tables.evasion && tables.evasion[lvl]) || 0;
                stats = { evasion: eva };
                desc = `+${Math.round(eva * 100)}% kitérési esély minden támadás ellen`;
            } else if (shipType === 'colony_ship') {
                const bm = tables.bonus_colony_metal[lvl] || 0;
                const be = tables.bonus_colony_energy[lvl] || 0;
                const bi = tables.bonus_colony_isotope[lvl] || 0;
                stats = { bonus_colony_metal: bm, bonus_colony_energy: be, bonus_colony_isotope: bi };
                desc = `Telepítéskor: +${bm} Fém, +${be} E${bi > 0 ? `, +${bi} Izotóp` : ''}`;
            } else if (shipType === 'frigate') {
                const acc = tables.accuracy[lvl] || 0;
                const eva = tables.evasion[lvl] || 0;
                stats = { accuracy: acc, evasion: eva };
                desc = `+${Math.round(acc * 100)}% torpedó pontosság, +${Math.round(eva * 100)}% kitérés`;
            } else if (shipType === 'destroyer') {
                const acc = tables.accuracy[lvl] || 0;
                const eva = tables.evasion[lvl] || 0;
                stats = { accuracy: acc, evasion: eva };
                desc = `+${Math.round(acc * 100)}% célzási pontosság, +${Math.round(eva * 100)}% kitérés`;
            } else if (shipType === 'heavy_destroyer') {
                const acc = tables.accuracy[lvl] || 0;
                stats = { accuracy: acc, siege_bonus: true };
                desc = `+${Math.round(acc * 100)}% ostrom pontosság és megnövelt hatóerő`;
            } else if (shipType === 'cruiser') {
                const eva = tables.evasion[lvl] || 0;
                stats = { evasion: eva, drone_support: true };
                desc = `+${Math.round(eva * 100)}% flotta kísérő kitérés és drónvédelem`;
            } else if (shipType === 'battleship') {
                const anti = tables.anti_corvette_accuracy[lvl] || 0;
                const eva = tables.evasion[lvl] || 0;
                stats = { anti_corvette_accuracy: anti, evasion: eva };
                desc = `+${Math.round(anti * 100)}% pontosság Korvettek ellen, +${Math.round(eva * 100)}% kitérés`;
            }
        }

        levels.push({
            level: lvl,
            name: `${ROMAN_NUMS[lvl - 1]} ${LEVEL_TITLES[lvl - 1]}`,
            cost_metal: cost.cost_metal,
            cost_energy: cost.cost_energy,
            cost_isotope: cost.cost_isotope,
            req_tier,
            desc,
            stats
        });
    }
    return levels;
}

const SHIP_SUBSYSTEMS = {
    scout: {
        weapon: { slotKey: 'weapon', name: 'EMP Zavaró Pulzus', icon: '⚡', legacyId: 'scout_emp_pulse', levels: generateSubsystemLevels('scout', 'weapon') },
        hull: { slotKey: 'hull', name: 'Könnyített Titán Páncél', icon: '🛡️', legacyId: 'scout_hull_reinforce', levels: generateSubsystemLevels('scout', 'hull') },
        engine: { slotKey: 'engine', name: 'Tachion Hajtómű & Fúvókák', icon: '🚀', legacyId: 'scout_tachyon_sensor', levels: generateSubsystemLevels('scout', 'engine') }
    },
    interceptor: {
        weapon: { slotKey: 'weapon', name: 'Iker Plazmaágyúk', icon: '🔫', legacyId: 'int_plasma_cannons', levels: generateSubsystemLevels('interceptor', 'weapon') },
        hull: { slotKey: 'hull', name: 'Kompakt Titánváz', icon: '🛡️', legacyId: 'int_titanium_frame', levels: generateSubsystemLevels('interceptor', 'hull') },
        shield: { slotKey: 'shield', name: 'Mikropajzs Generátor', icon: '🌐', legacyId: 'int_micro_shield', levels: generateSubsystemLevels('interceptor', 'shield') },
        engine: { slotKey: 'engine', name: 'Hiperszonikus Utánégetők', icon: '🚀', legacyId: 'int_afterburners', requiredTech: 'ion_thrusters', levels: generateSubsystemLevels('interceptor', 'engine') }
    },
    corvette: {
        weapon: { slotKey: 'weapon', name: 'Túltöltött Pulzuslézerek', icon: '🔫', legacyId: 'corv_overcharged_lasers', levels: generateSubsystemLevels('corvette', 'weapon') },
        hull: { slotKey: 'hull', name: 'Karbonszálas Hull Páncél', icon: '🛡️', legacyId: 'corv_carbon_hull', levels: generateSubsystemLevels('corvette', 'hull') },
        shield: { slotKey: 'shield', name: 'Fázispajzs-Generátor', icon: '🌐', legacyId: 'corv_phase_shield', levels: generateSubsystemLevels('corvette', 'shield') },
        engine: { slotKey: 'engine', name: 'Ionos Utánégetők', icon: '🚀', legacyId: 'corv_afterburners', levels: generateSubsystemLevels('corvette', 'engine') },
        avionics: { slotKey: 'avionics', name: 'Mélyűr Zavarórendszer', icon: '📻', legacyId: 'corv_jamming_suite', requiredTech: 'dark_matter_reactor', levels: generateSubsystemLevels('corvette', 'avionics') }
    },
    freighter: {
        weapon: { slotKey: 'weapon', name: 'Önvédelmi Védelmi Gépágyú', icon: '🎯', legacyId: 'freight_defense_cannon', levels: generateSubsystemLevels('freighter', 'weapon') },
        hull: { slotKey: 'hull', name: 'Megerősített Teherkonténer Váz', icon: '🛡️', legacyId: 'freight_cargo_hull', requiredTech: 'heavy_metallurgy', levels: generateSubsystemLevels('freighter', 'hull') },
        shield: { slotKey: 'shield', name: 'Védőhálós Szállítópajzs', icon: '🌐', legacyId: 'freight_barrier_shield', levels: generateSubsystemLevels('freighter', 'shield') },
        engine: { slotKey: 'engine', name: 'Nehézteher Hajtómű-Array', icon: '🚀', legacyId: 'freight_hauler_drives', levels: generateSubsystemLevels('freighter', 'engine') }
    },
    colony_ship: {
        weapon: { slotKey: 'weapon', name: 'Automata Pontvédelmi Ágyú', icon: '🎯', legacyId: 'colony_point_defense', levels: generateSubsystemLevels('colony_ship', 'weapon') },
        hull: { slotKey: 'hull', name: 'Megerősített Élettér Kamrák', icon: '🚪', legacyId: 'colony_reinforced_bulkhead', levels: generateSubsystemLevels('colony_ship', 'hull') },
        shield: { slotKey: 'shield', name: 'Kupolapajzs-Burok', icon: '🫧', legacyId: 'colony_shield_bubble', levels: generateSubsystemLevels('colony_ship', 'shield') },
        avionics: { slotKey: 'avionics', name: 'Krio-Sztázis Kolóniamodul', icon: '❄️', legacyId: 'colony_cryo_stasis', levels: generateSubsystemLevels('colony_ship', 'avionics') }
    },
    frigate: {
        weapon: { slotKey: 'weapon', name: 'Kvantum-Torpedó Kilövők', icon: '💥', legacyId: 'frig_quantum_torpedo', requiredTech: 'extended_shielding', levels: generateSubsystemLevels('frigate', 'weapon') },
        hull: { slotKey: 'hull', name: 'Lopakodó Ék-Páncél', icon: '🛡️', legacyId: 'frig_stealth_wedge', levels: generateSubsystemLevels('frigate', 'hull') },
        shield: { slotKey: 'shield', name: 'Torzító Mezőgenerátor', icon: '🌐', legacyId: 'frig_warp_barrier', levels: generateSubsystemLevels('frigate', 'shield') },
        engine: { slotKey: 'engine', name: 'Lopakodó Ionhajtómű', icon: '🚀', legacyId: 'frig_stealth_engine', levels: generateSubsystemLevels('frigate', 'engine') },
        avionics: { slotKey: 'avionics', name: 'Torpedó Célkövető Szenzor', icon: '📡', legacyId: 'frig_target_tracking', levels: generateSubsystemLevels('frigate', 'avionics') }
    },
    destroyer: {
        weapon: { slotKey: 'weapon', name: 'Gauss Nehézágyúk & Silók', icon: '💥', legacyId: 'dest_gauss_cannons', levels: generateSubsystemLevels('destroyer', 'weapon') },
        hull: { slotKey: 'hull', name: 'Ablatív Kompozit Páncél', icon: '🛡️', legacyId: 'dest_ablative_plating', levels: generateSubsystemLevels('destroyer', 'hull') },
        shield: { slotKey: 'shield', name: 'Pajzs-Szinkronizáló Erősítő', icon: '🔋', legacyId: 'dest_shield_amplifier', requiredTech: 'extended_shielding', levels: generateSubsystemLevels('destroyer', 'shield') },
        engine: { slotKey: 'engine', name: 'Fényalatti Hajtómű-Turbina', icon: '☄️', legacyId: 'dest_sublight_overdrive', levels: generateSubsystemLevels('destroyer', 'engine') },
        avionics: { slotKey: 'avionics', name: 'Torpedó-Elhárító & Célzórendszer', icon: '🚀', legacyId: 'dest_missile_intercept', levels: generateSubsystemLevels('destroyer', 'avionics') }
    },
    heavy_destroyer: {
        weapon: { slotKey: 'weapon', name: 'Iker Ostrom-Mauler Ágyúk', icon: '💥', legacyId: 'hdest_siege_mauler', requiredTech: 'siege_warheads', levels: generateSubsystemLevels('heavy_destroyer', 'weapon') },
        hull: { slotKey: 'hull', name: 'Vastagított Titán Páncélzat', icon: '🛡️', legacyId: 'hdest_heavy_plating', levels: generateSubsystemLevels('heavy_destroyer', 'hull') },
        shield: { slotKey: 'shield', name: 'Rezonáns Védőpajzs', icon: '🌐', legacyId: 'hdest_fragile_shield', levels: generateSubsystemLevels('heavy_destroyer', 'shield') },
        engine: { slotKey: 'engine', name: 'Nehéz Tolóerő Turbinák', icon: '🚀', legacyId: 'hdest_thrust_turbines', levels: generateSubsystemLevels('heavy_destroyer', 'engine') },
        avionics: { slotKey: 'avionics', name: 'Ballisztikai Ostrom-Komputer', icon: '🎯', legacyId: 'hdest_siege_computer', levels: generateSubsystemLevels('heavy_destroyer', 'avionics') }
    },
    cruiser: {
        weapon: { slotKey: 'weapon', name: 'Drónhangár & Indítósínek', icon: '🛸', legacyId: 'cruiser_drone_hangar', levels: generateSubsystemLevels('cruiser', 'weapon') },
        hull: { slotKey: 'hull', name: 'Rétegelt Hordozó Váz', icon: '🛡️', legacyId: 'cruiser_carrier_hull', levels: generateSubsystemLevels('cruiser', 'hull') },
        shield: { slotKey: 'shield', name: 'Hordozópajzs Generátor', icon: '🌐', legacyId: 'cruiser_fortress_shield', levels: generateSubsystemLevels('cruiser', 'shield') },
        engine: { slotKey: 'engine', name: 'Vektoros Cirkáló Hajtómű', icon: '🚀', legacyId: 'cruiser_vector_engine', levels: generateSubsystemLevels('cruiser', 'engine') },
        avionics: { slotKey: 'avionics', name: 'Drón-Rajvezérlő Mátrix', icon: '📡', legacyId: 'cruiser_drone_matrix', requiredTech: 'superconductor_grid', levels: generateSubsystemLevels('cruiser', 'avionics') }
    },
    battleship: {
        weapon: { slotKey: 'weapon', name: 'Spinalis Gerinc-Railgun', icon: '⚡', legacyId: 'bb_spinal_railgun', requiredTech: 'siege_warheads', levels: generateSubsystemLevels('battleship', 'weapon') },
        hull: { slotKey: 'hull', name: 'Dreadnought Páncéllemezek', icon: '🧱', legacyId: 'bb_dreadnought_armor', levels: generateSubsystemLevels('battleship', 'hull') },
        shield: { slotKey: 'shield', name: 'Erődpajzs Generátor', icon: '🛡️', legacyId: 'bb_fortress_shields', levels: generateSubsystemLevels('battleship', 'shield') },
        engine: { slotKey: 'engine', name: 'Antianyag Térhajtómű', icon: '🌌', legacyId: 'bb_antimatter_drives', levels: generateSubsystemLevels('battleship', 'engine') },
        avionics: { slotKey: 'avionics', name: 'Flak Elhárító & Harcirányítás', icon: '🎯', legacyId: 'bb_point_defense_flak', levels: generateSubsystemLevels('battleship', 'avionics') }
    }
};

// Visszafelé kompatibilis SHIP_UPGRADE_MODULES lista generálása
const SHIP_UPGRADE_MODULES = {};
for (const [shipType, slots] of Object.entries(SHIP_SUBSYSTEMS)) {
    SHIP_UPGRADE_MODULES[shipType] = Object.values(slots).map(slot => {
        const lv1 = slot.levels[0];
        return {
            id: slot.legacyId,
            slotKey: slot.slotKey,
            name: slot.name,
            icon: slot.icon,
            cost_metal: lv1.cost_metal,
            cost_energy: lv1.cost_energy,
            cost_isotope: lv1.cost_isotope,
            desc: lv1.desc,
            stats: lv1.stats
        };
    });
}

class DatabaseService {
    constructor(dbPath = DB_FILE) {
        this.db = new DatabaseSync(dbPath);
        this.initSchema();
    }

    initSchema() {
        const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
        this.db.exec(schemaSql);
        this.seedInitialWorld();
        this.seedMissions();
        this.seedBotPlanets();
    }

    seedMissions() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS missions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                reward_text TEXT NOT NULL,
                reward_metal REAL DEFAULT 0,
                reward_energy REAL DEFAULT 0,
                reward_isotope REAL DEFAULT 0,
                reward_data REAL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'active',
                sort_order INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS research_queue (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                tech_id TEXT NOT NULL,
                start_tick INTEGER NOT NULL,
                finish_tick INTEGER NOT NULL,
                duration_ticks INTEGER NOT NULL,
                UNIQUE(player_id, tech_id)
            );

            CREATE TABLE IF NOT EXISTS boss_state (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                hull REAL NOT NULL,
                max_hull REAL NOT NULL,
                shield REAL NOT NULL,
                max_shield REAL NOT NULL,
                pos_x REAL NOT NULL,
                pos_y REAL NOT NULL,
                state TEXT NOT NULL DEFAULT 'dormant',
                defeated_at_tick INTEGER NULL,
                salvage_metal REAL NOT NULL DEFAULT 2000.0,
                salvage_isotope REAL NOT NULL DEFAULT 1000.0
            );

            CREATE TABLE IF NOT EXISTS ship_upgrades (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                ship_type TEXT NOT NULL,
                selected_modules TEXT NOT NULL DEFAULT '[]',
                UNIQUE(player_id, ship_type)
            );
        `);

        // Migrációk meglévő adatbázis sémákhoz
        try { this.db.prepare("ALTER TABLE players ADD COLUMN glory_points REAL NOT NULL DEFAULT 0.0").run(); } catch(e) {}
        try { this.db.prepare("ALTER TABLE boss_state ADD COLUMN damage REAL NOT NULL DEFAULT 300.0").run(); } catch(e) {}
        try { this.db.prepare("ALTER TABLE missions ADD COLUMN reward_buff_type TEXT NULL").run(); } catch(e) {}
        try { this.db.prepare("ALTER TABLE missions ADD COLUMN reward_buff_value REAL DEFAULT 0").run(); } catch(e) {}
        try { this.db.prepare("ALTER TABLE missions ADD COLUMN reward_buff_duration INTEGER DEFAULT 0").run(); } catch(e) {}
        try { this.db.prepare("ALTER TABLE missions ADD COLUMN reward_artifact_id TEXT NULL").run(); } catch(e) {}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0").run(); } catch(e) {}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN bot_type TEXT NULL").run(); } catch(e) {}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN loot_type TEXT NULL").run(); } catch(e) {}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN loot_data TEXT NULL").run(); } catch(e) {}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN loot_revealed INTEGER NOT NULL DEFAULT 0").run(); } catch(e) {}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN defeated_by_player_id TEXT NULL").run(); } catch(e) {}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN difficulty_tier INTEGER NOT NULL DEFAULT 1").run(); } catch(e) {}

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS player_buffs (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                buff_type TEXT NOT NULL,
                buff_value REAL NOT NULL,
                expires_at_tick INTEGER NOT NULL,
                name TEXT NOT NULL,
                icon TEXT NOT NULL DEFAULT '⚡'
            );

            CREATE TABLE IF NOT EXISTS player_artifacts (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                artifact_id TEXT NOT NULL,
                name TEXT NOT NULL,
                icon TEXT NOT NULL DEFAULT '🏺',
                acquired_at_tick INTEGER NOT NULL,
                UNIQUE(player_id, artifact_id)
            );

            CREATE TABLE IF NOT EXISTS glory_attack_history (
                id TEXT PRIMARY KEY,
                attacker_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                target_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                attack_tick INTEGER NOT NULL,
                glory_awarded REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                sender_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                sender_name TEXT NOT NULL,
                message TEXT NOT NULL,
                tick_number INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3 Fő Boss Bolygó (Prekurzor Citadellák - Végjáték Titánok)
        const bossList = [
            { id: 'boss_1', name: 'CYGNUS BASTION // ŐSI ELŐŐRS', hull: 4500.0, max_hull: 4500.0, shield: 2500.0, max_shield: 2500.0, damage: 350.0, pos_x: 180.0, pos_y: 140.0, salvage_metal: 2500.0, salvage_isotope: 1000.0 },
            { id: 'boss_2', name: 'VOID CITADEL // ÜRESSÉG CITADELLÁJA', hull: 7500.0, max_hull: 7500.0, shield: 4500.0, max_shield: 4500.0, damage: 550.0, pos_x: 360.0, pos_y: 180.0, salvage_metal: 4500.0, salvage_isotope: 2000.0 },
            { id: 'boss_3', name: 'OMEGA-ARK-0 // KRONOS-LEVIATÁN', hull: 12000.0, max_hull: 12000.0, shield: 7000.0, max_shield: 7000.0, damage: 850.0, pos_x: 280.0, pos_y: 200.0, salvage_metal: 8000.0, salvage_isotope: 4000.0 }
        ];

        for (const b of bossList) {
            const exists = this.db.prepare('SELECT id FROM boss_state WHERE id = ?').get(b.id);
            if (!exists) {
                this.db.prepare(`
                    INSERT INTO boss_state (id, name, hull, max_hull, shield, max_shield, damage, pos_x, pos_y, state, defeated_at_tick, salvage_metal, salvage_isotope)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'dormant', NULL, ?, ?)
                `).run(b.id, b.name, b.hull, b.max_hull, b.shield, b.max_shield, b.damage, b.pos_x, b.pos_y, b.salvage_metal, b.salvage_isotope);
            }
        }

        // Bővített 9 Küldetés (Missions) bónuszokkal és relikviákkal
        const newMissions = [
            { id: 'm1', title: 'Bázisfejlesztés', description: 'Fejleszd a Kronos-IV bolygó Ipari Központját Lv.2-re!', reward_text: '+150 Fém, +50 E, ⛏️ +25% Bányászat (5 kör)', reward_metal: 150, reward_energy: 50, reward_isotope: 0, reward_data: 0, reward_buff_type: 'mining_boost', reward_buff_value: 0.25, reward_buff_duration: 5, reward_artifact_id: null, sort_order: 1 },
            { id: 'm2', title: 'Kozmikus Felderítés', description: 'Építs egy Felderítő Szondát és küldd felderíteni a Zephyr-7-et!', reward_text: '+40 Izotóp, +50 Adat, 🚀 +20% Flotta Sebesség (6 kör)', reward_metal: 0, reward_energy: 0, reward_isotope: 40, reward_data: 50, reward_buff_type: 'speed_boost', reward_buff_value: 0.20, reward_buff_duration: 6, reward_artifact_id: null, sort_order: 2 },
            { id: 'm3', title: 'Hadiflotta Alapítása', description: 'Bővítsd a haderőd legalább 8 Korvettre vagy 3 Rombolóra!', reward_text: '+200 Fém, +100 E, 🏺 KVANTUM CHRONO-MAG', reward_metal: 200, reward_energy: 100, reward_isotope: 0, reward_data: 0, reward_buff_type: null, reward_buff_value: 0, reward_buff_duration: 0, reward_artifact_id: 'artifact_chrono_core', sort_order: 3 },
            { id: 'm4', title: 'Kolónia-alapítás', description: 'Építs Kolóniahajót és kolonizáld a Zephyr-7 vagy Nexus-Alpha világot!', reward_text: '+250 Fém, +150 E, 🛡️ +20% Pajzskapacitás (8 kör)', reward_metal: 250, reward_energy: 150, reward_isotope: 50, reward_data: 0, reward_buff_type: 'shield_overcharge', reward_buff_value: 0.20, reward_buff_duration: 8, reward_artifact_id: null, sort_order: 4 },
            { id: 'm5', title: 'Mélységi Expanzió & Dominancia', description: 'Birtokolj legalább 3 bolygót a szektorban!', reward_text: '+500 Fém, +300 Adat, 💎 SÖTÉT ANYAG REZONÁTOR', reward_metal: 500, reward_energy: 250, reward_isotope: 100, reward_data: 300, reward_buff_type: null, reward_buff_value: 0, reward_buff_duration: 0, reward_artifact_id: 'artifact_dark_resonator', sort_order: 5 },
            { id: 'm6', title: 'Birodalmi Hadúr & Dicsőség', description: 'Gyűjts össze legalább 100 Dicsőség Pontot rivális játékosok megtámadásával!', reward_text: '+500 Fém, 🔮 PREKURZOR HOZZÁFÉRÉSI KÓDEX, ⚔️ +20% Sebzés (8 kör)', reward_metal: 500, reward_energy: 200, reward_isotope: 100, reward_data: 200, reward_buff_type: 'combat_dmg_buff', reward_buff_value: 0.20, reward_buff_duration: 8, reward_artifact_id: 'artifact_codex', sort_order: 6 },
            { id: 'm7', title: 'Cygnus Bastion Elpusztítása', description: 'Pusztítsd el az Ősi Cygnus Előőrsöt (Boss 1)!', reward_text: '+1500 Fém, +100 Dicsőség, 🛡️ +25% Hull HP (10 kör)', reward_metal: 1500, reward_energy: 500, reward_isotope: 500, reward_data: 500, reward_buff_type: 'combat_hull_buff', reward_buff_value: 0.25, reward_buff_duration: 10, reward_artifact_id: null, sort_order: 7 },
            { id: 'm8', title: 'Void Citadel Felszámolása', description: 'Törd át az Üresség Citadellájának (Boss 2) védelmi falát!', reward_text: '+2500 Fém, +200 Dicsőség, 💥 +25% Tűzerő (12 kör)', reward_metal: 2500, reward_energy: 1000, reward_isotope: 1000, reward_data: 1000, reward_buff_type: 'combat_dmg_buff', reward_buff_value: 0.25, reward_buff_duration: 12, reward_artifact_id: null, sort_order: 8 },
            { id: 'm9', title: 'Omega-Protokoll: Leviatán Bukása', description: 'Semmisítsd meg az OMEGA-ARK-0 Kronos-Leviatánt (Boss 3)!', reward_text: 'Teljes Galaktikus Megdicsőülés & Végső Győzelem!', reward_metal: 5000, reward_energy: 3000, reward_isotope: 2000, reward_data: 2000, reward_buff_type: null, reward_buff_value: 0, reward_buff_duration: 0, reward_artifact_id: null, sort_order: 9 }
        ];

        const mStmt = this.db.prepare(`
            INSERT INTO missions (id, title, description, reward_text, reward_metal, reward_energy, reward_isotope, reward_data, reward_buff_type, reward_buff_value, reward_buff_duration, reward_artifact_id, status, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
            ON CONFLICT(id) DO UPDATE SET 
                title=excluded.title, 
                description=excluded.description, 
                reward_text=excluded.reward_text,
                reward_buff_type=excluded.reward_buff_type,
                reward_buff_value=excluded.reward_buff_value,
                reward_buff_duration=excluded.reward_buff_duration,
                reward_artifact_id=excluded.reward_artifact_id,
                sort_order=excluded.sort_order
        `);
        for (const nm of newMissions) {
            mStmt.run(nm.id, nm.title, nm.description, nm.reward_text, nm.reward_metal, nm.reward_energy, nm.reward_isotope, nm.reward_data, nm.reward_buff_type, nm.reward_buff_value, nm.reward_buff_duration, nm.reward_artifact_id, nm.sort_order);
        }
    }


    seedBotPlanets() {
        this.db.prepare(`
            INSERT OR IGNORE INTO players (id, username, color_hex, metal, energy, isotope, data_points, is_ai)
            VALUES ('bot_hostile', 'Kozmikus Renegátok (Bot)', '#f59e0b', 0, 0, 0, 0, 1)
        `).run();
        this.db.prepare(`
            INSERT OR IGNORE INTO players (id, username, color_hex, metal, energy, isotope, data_points, is_ai)
            VALUES ('precursor_boss', 'Prekurzor Ős-Kolosszusok', '#dc2626', 0, 0, 0, 0, 1)
        `).run();

        // 3 Fő Boss Citadella (Végjáték Prekurzor Bástyák)
        const bossPlanets = [
            {
                id: 'boss_1',
                name: 'CYGNUS BASTION // ŐSI ELŐŐRS',
                pos_x: 180, pos_y: 140, size_slots: 6,
                is_bot: 1, bot_type: 'boss', difficulty_tier: 3,
                loot_type: 'resources',
                loot_data: JSON.stringify({ metal: 3000, energy: 1500, isotope: 800, data: 800, glory: 150 }),
                planetary_shield_hp: 2500.0, max_shield_hp: 2500.0, railgun_count: 3,
                ships: { frigate: 6, destroyer: 4, heavy_destroyer: 3, cruiser: 1 }
            },
            {
                id: 'boss_2',
                name: 'VOID CITADEL // ÜRESSÉG CITADELLÁJA',
                pos_x: 360, pos_y: 180, size_slots: 6,
                is_bot: 1, bot_type: 'boss', difficulty_tier: 4,
                loot_type: 'resources',
                loot_data: JSON.stringify({ metal: 5000, energy: 2500, isotope: 1500, data: 1500, glory: 300 }),
                planetary_shield_hp: 5000.0, max_shield_hp: 5000.0, railgun_count: 5,
                ships: { destroyer: 6, heavy_destroyer: 4, cruiser: 4, battleship: 2 }
            },
            {
                id: 'boss_3',
                name: 'OMEGA-ARK-0 // KRONOS-LEVIATÁN',
                pos_x: 280, pos_y: 200, size_slots: 6,
                is_bot: 1, bot_type: 'boss', difficulty_tier: 5,
                loot_type: 'resources',
                loot_data: JSON.stringify({ metal: 10000, energy: 5000, isotope: 3000, data: 3000, glory: 600 }),
                planetary_shield_hp: 10000.0, max_shield_hp: 10000.0, railgun_count: 8,
                ships: { heavy_destroyer: 8, cruiser: 6, battleship: 4 }
            }
        ];

        // 30 Kis Ellenséges Bot Bolygó a rejtett zsákmányokkal (Tier 1-3)
        const botOutposts = [
            // --- TIER 1 (10 Bolygó: Kalózok, Bányásztelepek, Drónok) ---
            {
                id: 'bot_p1', name: 'DRAKON KALÓZTÁMASZPONT',
                pos_x: 80, pos_y: 220, size_slots: 3,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 1,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 1200, energy: 500, isotope: 180, data: 120 }),
                planetary_shield_hp: 200.0, max_shield_hp: 200.0, railgun_count: 1,
                ships: { interceptor: 5, corvette: 4 }
            },
            {
                id: 'bot_p2', name: 'RENEGÁT IZOTÓP-BÁNYA',
                pos_x: 240, pos_y: 50, size_slots: 3,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 1,
                loot_type: 'glory', loot_data: JSON.stringify({ glory: 15 }),
                planetary_shield_hp: 150.0, max_shield_hp: 150.0, railgun_count: 1,
                ships: { corvette: 5, frigate: 2 }
            },
            {
                id: 'bot_p3', name: 'PREKURZOR KRIPTA-HOLD',
                pos_x: 390, pos_y: 70, size_slots: 3,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 1,
                loot_type: 'artifact', loot_data: JSON.stringify({ artifact_id: 'artifact_chrono_core', name: 'Kvantum Chrono-Mag' }),
                planetary_shield_hp: 250.0, max_shield_hp: 250.0, railgun_count: 1,
                ships: { interceptor: 6, corvette: 3 }
            },
            {
                id: 'bot_p4', name: 'ASZTEROIDA-CSOMÓPONT',
                pos_x: 90, pos_y: 340, size_slots: 3,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 1,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 1100, energy: 450, isotope: 160, data: 110 }),
                planetary_shield_hp: 180.0, max_shield_hp: 180.0, railgun_count: 1,
                ships: { interceptor: 4, corvette: 4 }
            },
            {
                id: 'bot_p5', name: 'ORBITÁLIS KALÓZ-DOKK',
                pos_x: 170, pos_y: 440, size_slots: 3,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 1,
                loot_type: 'glory', loot_data: JSON.stringify({ glory: 18 }),
                planetary_shield_hp: 200.0, max_shield_hp: 200.0, railgun_count: 1,
                ships: { corvette: 6, frigate: 1 }
            },
            {
                id: 'bot_p6', name: 'REJTETT DRÓN-SZONDAŐR',
                pos_x: 480, pos_y: 60, size_slots: 3,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 1,
                loot_type: 'artifact', loot_data: JSON.stringify({ artifact_id: 'artifact_chrono_core', name: 'Kvantum Chrono-Mag' }),
                planetary_shield_hp: 220.0, max_shield_hp: 220.0, railgun_count: 1,
                ships: { scout: 4, interceptor: 6 }
            },
            {
                id: 'bot_p7', name: 'RONGÁLT ADAT-SZIGET',
                pos_x: 520, pos_y: 150, size_slots: 3,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 1,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 1300, energy: 600, isotope: 200, data: 180 }),
                planetary_shield_hp: 200.0, max_shield_hp: 200.0, railgun_count: 1,
                ships: { corvette: 5, frigate: 2 }
            },
            {
                id: 'bot_p8', name: 'KALÓZ ÜZEMANYAG-RAKTÁR',
                pos_x: 70, pos_y: 150, size_slots: 3,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 1,
                loot_type: 'glory', loot_data: JSON.stringify({ glory: 20 }),
                planetary_shield_hp: 220.0, max_shield_hp: 220.0, railgun_count: 1,
                ships: { interceptor: 7, corvette: 3 }
            },
            {
                id: 'bot_p9', name: 'ELHAGYOTT SZENZOR-ÁLLOMÁS',
                pos_x: 300, pos_y: 450, size_slots: 3,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 1,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 1250, energy: 550, isotope: 190, data: 160 }),
                planetary_shield_hp: 210.0, max_shield_hp: 210.0, railgun_count: 1,
                ships: { corvette: 6, frigate: 2 }
            },
            {
                id: 'bot_p10', name: 'REZONÁTOR-KRÁTER',
                pos_x: 440, pos_y: 460, size_slots: 3,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 1,
                loot_type: 'artifact', loot_data: JSON.stringify({ artifact_id: 'artifact_dark_resonator', name: 'Sötét Anyag Rezonátor' }),
                planetary_shield_hp: 260.0, max_shield_hp: 260.0, railgun_count: 1,
                ships: { interceptor: 8, frigate: 2 }
            },

            // --- TIER 2 (10 Bolygó: Gépgyárak, Nehéz Roncsok, Erődítmények) ---
            {
                id: 'bot_p11', name: 'ROBOT GÉPGYÁR ALFA',
                pos_x: 160, pos_y: 240, size_slots: 4,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 2,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 1800, energy: 800, isotope: 300, data: 220 }),
                planetary_shield_hp: 400.0, max_shield_hp: 400.0, railgun_count: 2,
                ships: { corvette: 8, destroyer: 2 }
            },
            {
                id: 'bot_p12', name: 'KOZMIKUS RONCS-ERŐD',
                pos_x: 350, pos_y: 260, size_slots: 4,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 2,
                loot_type: 'glory', loot_data: JSON.stringify({ glory: 25 }),
                planetary_shield_hp: 450.0, max_shield_hp: 450.0, railgun_count: 2,
                ships: { destroyer: 4, cruiser: 1 }
            },
            {
                id: 'bot_p13', name: 'SÖTÉT CSILLAG ŐRHELY',
                pos_x: 480, pos_y: 230, size_slots: 4,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 2,
                loot_type: 'artifact', loot_data: JSON.stringify({ artifact_id: 'artifact_dark_resonator', name: 'Sötét Anyag Rezonátor' }),
                planetary_shield_hp: 500.0, max_shield_hp: 500.0, railgun_count: 2,
                ships: { frigate: 4, destroyer: 3, cruiser: 1 }
            },
            {
                id: 'bot_p14', name: 'KVANTUM-SZERELŐCSARNOK',
                pos_x: 270, pos_y: 160, size_slots: 4,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 2,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 2000, energy: 900, isotope: 350, data: 250 }),
                planetary_shield_hp: 450.0, max_shield_hp: 450.0, railgun_count: 2,
                ships: { corvette: 6, frigate: 4, destroyer: 2 }
            },
            {
                id: 'bot_p15', name: 'PLAZMA-ÁGYÚTORONY BÁZIS',
                pos_x: 390, pos_y: 410, size_slots: 4,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 2,
                loot_type: 'glory', loot_data: JSON.stringify({ glory: 30 }),
                planetary_shield_hp: 550.0, max_shield_hp: 550.0, railgun_count: 3,
                ships: { heavy_destroyer: 2, destroyer: 3 }
            },
            {
                id: 'bot_p16', name: 'PREKURZOR KÓDEX-SZENTÉLY',
                pos_x: 580, pos_y: 100, size_slots: 4,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 2,
                loot_type: 'artifact', loot_data: JSON.stringify({ artifact_id: 'artifact_codex', name: 'Prekurzor Hozzáférési Kódex' }),
                planetary_shield_hp: 500.0, max_shield_hp: 500.0, railgun_count: 2,
                ships: { frigate: 5, destroyer: 3 }
            },
            {
                id: 'bot_p17', name: 'NEHÉZIPARI KOHÓ-BÁRKA',
                pos_x: 600, pos_y: 210, size_slots: 4,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 2,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 2200, energy: 1000, isotope: 400, data: 300 }),
                planetary_shield_hp: 480.0, max_shield_hp: 480.0, railgun_count: 2,
                ships: { corvette: 8, heavy_destroyer: 2 }
            },
            {
                id: 'bot_p18', name: 'CIKLON-KORSZAK ERŐDÍTÉS',
                pos_x: 530, pos_y: 330, size_slots: 4,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 2,
                loot_type: 'glory', loot_data: JSON.stringify({ glory: 30 }),
                planetary_shield_hp: 520.0, max_shield_hp: 520.0, railgun_count: 2,
                ships: { frigate: 4, destroyer: 4 }
            },
            {
                id: 'bot_p19', name: 'KÜLSŐ TACHION-VISSZHANG',
                pos_x: 650, pos_y: 310, size_slots: 4,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 2,
                loot_type: 'artifact', loot_data: JSON.stringify({ artifact_id: 'artifact_chrono_core', name: 'Kvantum Chrono-Mag' }),
                planetary_shield_hp: 490.0, max_shield_hp: 490.0, railgun_count: 2,
                ships: { interceptor: 8, destroyer: 3 }
            },
            {
                id: 'bot_p20', name: 'TITÁN-SZIKLA DEPO',
                pos_x: 210, pos_y: 520, size_slots: 4,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 2,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 2100, energy: 950, isotope: 380, data: 280 }),
                planetary_shield_hp: 460.0, max_shield_hp: 460.0, railgun_count: 2,
                ships: { corvette: 10, destroyer: 3 }
            },

            // --- TIER 3 (10 Bolygó: Prekurzor Bástyák, Haladó Hadiszektorok) ---
            {
                id: 'bot_p21', name: 'ELŐŐRS CITADELLA-ROM',
                pos_x: 110, pos_y: 480, size_slots: 5,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 3,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 3500, energy: 1500, isotope: 600, data: 500 }),
                planetary_shield_hp: 800.0, max_shield_hp: 800.0, railgun_count: 3,
                ships: { frigate: 5, heavy_destroyer: 3, cruiser: 2 }
            },
            {
                id: 'bot_p22', name: 'REZONANCIA-MAG ERŐD',
                pos_x: 360, pos_y: 500, size_slots: 5,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 3,
                loot_type: 'glory', loot_data: JSON.stringify({ glory: 40 }),
                planetary_shield_hp: 850.0, max_shield_hp: 850.0, railgun_count: 3,
                ships: { destroyer: 5, cruiser: 2, battleship: 1 }
            },
            {
                id: 'bot_p23', name: 'PREKURZOR ARCHÍVUM-NEXUS',
                pos_x: 680, pos_y: 130, size_slots: 5,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 3,
                loot_type: 'artifact', loot_data: JSON.stringify({ artifact_id: 'artifact_codex', name: 'Prekurzor Hozzáférési Kódex' }),
                planetary_shield_hp: 900.0, max_shield_hp: 900.0, railgun_count: 3,
                ships: { frigate: 6, destroyer: 4, cruiser: 2 }
            },
            {
                id: 'bot_p24', name: 'FEKETE-LYUK VÉDŐGYŰRŰ',
                pos_x: 590, pos_y: 440, size_slots: 5,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 3,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 3800, energy: 1800, isotope: 750, data: 600 }),
                planetary_shield_hp: 950.0, max_shield_hp: 950.0, railgun_count: 3,
                ships: { heavy_destroyer: 4, cruiser: 3, battleship: 1 }
            },
            {
                id: 'bot_p25', name: 'ANTIMATTER SILÓ-SZIKLA',
                pos_x: 690, pos_y: 420, size_slots: 5,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 3,
                loot_type: 'glory', loot_data: JSON.stringify({ glory: 45 }),
                planetary_shield_hp: 900.0, max_shield_hp: 900.0, railgun_count: 3,
                ships: { destroyer: 6, heavy_destroyer: 3, cruiser: 2 }
            },
            {
                id: 'bot_p26', name: 'KVANTUM-FOLYOSÓ ŐRSZEM',
                pos_x: 490, pos_y: 520, size_slots: 5,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 3,
                loot_type: 'artifact', loot_data: JSON.stringify({ artifact_id: 'artifact_dark_resonator', name: 'Sötét Anyag Rezonátor' }),
                planetary_shield_hp: 920.0, max_shield_hp: 920.0, railgun_count: 3,
                ships: { frigate: 6, cruiser: 3, battleship: 1 }
            },
            {
                id: 'bot_p27', name: 'OBLIVION OSTROMPLÁZA',
                pos_x: 670, pos_y: 230, size_slots: 5,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 3,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 4000, energy: 2000, isotope: 800, data: 650 }),
                planetary_shield_hp: 1000.0, max_shield_hp: 1000.0, railgun_count: 4,
                ships: { heavy_destroyer: 5, cruiser: 3, battleship: 1 }
            },
            {
                id: 'bot_p28', name: 'TITÁN-CSAPATOK KRIPTÁJA',
                pos_x: 740, pos_y: 330, size_slots: 5,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 3,
                loot_type: 'glory', loot_data: JSON.stringify({ glory: 50 }),
                planetary_shield_hp: 1100.0, max_shield_hp: 1100.0, railgun_count: 4,
                ships: { destroyer: 6, cruiser: 4, battleship: 2 }
            },
            {
                id: 'bot_p29', name: 'GIGÁSZ CSATAROBOT DOKK',
                pos_x: 590, pos_y: 520, size_slots: 5,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 3,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 4200, energy: 2200, isotope: 900, data: 700 }),
                planetary_shield_hp: 1150.0, max_shield_hp: 1150.0, railgun_count: 4,
                ships: { heavy_destroyer: 4, cruiser: 4, battleship: 2 }
            },
            {
                id: 'bot_p30', name: 'PREKURZOR OMEGA-BÁSTYA',
                pos_x: 720, pos_y: 220, size_slots: 5,
                is_bot: 1, bot_type: 'outpost', difficulty_tier: 3,
                loot_type: 'artifact', loot_data: JSON.stringify({ artifact_id: 'artifact_codex', name: 'Prekurzor Hozzáférési Kódex' }),
                planetary_shield_hp: 1200.0, max_shield_hp: 1200.0, railgun_count: 4,
                ships: { frigate: 8, heavy_destroyer: 4, cruiser: 4, battleship: 2 }
            }
        ];

        const allBots = [...bossPlanets, ...botOutposts];
        for (const bp of allBots) {
            const exists = this.db.prepare('SELECT id FROM planets WHERE id = ?').get(bp.id);
            const ownerId = bp.bot_type === 'boss' ? 'precursor_boss' : 'bot_hostile';
            if (!exists) {
                this.db.prepare(`
                    INSERT INTO planets (id, name, pos_x, pos_y, size_slots, owner_id, base_metal_rate, base_energy_rate, planetary_shield_hp, max_shield_hp, railgun_count, is_bot, bot_type, loot_type, loot_data, loot_revealed, difficulty_tier, status)
                    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 1, ?, ?, ?, 0, ?, 'normal')
                `).run(bp.id, bp.name, bp.pos_x, bp.pos_y, bp.size_slots, ownerId, bp.planetary_shield_hp, bp.max_shield_hp, bp.railgun_count, bp.bot_type, bp.loot_type, bp.loot_data, bp.difficulty_tier);

                this.createFleet(`f_${bp.id}`, ownerId, `${bp.name} Védelmi Erő`, bp.pos_x, bp.pos_y, bp.id, bp.ships);
            } else {
                // Biztosítjuk a bot mezők beállítását létező soroknál is
                this.db.prepare(`
                    UPDATE planets 
                    SET is_bot = 1, bot_type = ?, loot_type = ?, loot_data = ?, difficulty_tier = ?
                    WHERE id = ? AND (is_bot = 0 OR is_bot IS NULL)
                `).run(bp.bot_type, bp.loot_type, bp.loot_data, bp.difficulty_tier, bp.id);
            }
        }
    }

    claimBotLoot(planetId, playerId) {
        const planet = this.db.prepare('SELECT * FROM planets WHERE id = ?').get(planetId);
        if (!planet || !planet.is_bot) return null;
        let lootData = {};
        try { lootData = JSON.parse(planet.loot_data || '{}'); } catch(e) {}

        const player = this.getPlayer(playerId);
        let rewardSummary = '';

        if (planet.loot_type === 'resources') {
            const metal = lootData.metal || 0;
            const energy = lootData.energy || 0;
            const isotope = lootData.isotope || 0;
            const data = lootData.data || 0;
            const glory = lootData.glory || 0;
            if (player) {
                this.updatePlayerResources(playerId, player.metal + metal, player.energy + energy, player.isotope + isotope, player.data_points + data);
                if (glory > 0) this.addGloryPoints(playerId, glory);
            }
            rewardSummary = `+${metal} Fém, +${energy} E, +${isotope} Iso, +${data} Dat${glory > 0 ? `, +${glory} GP` : ''}`;
        } else if (planet.loot_type === 'artifact') {
            const artId = lootData.artifact_id || 'artifact_chrono_core';
            const artName = lootData.name || 'Ősi Ereklye';
            this.addPlayerArtifact(playerId, artId, artName);
            rewardSummary = `🏺 ${artName}`;
        } else if (planet.loot_type === 'glory') {
            const glory = lootData.glory || 20;
            this.addGloryPoints(playerId, glory);
            rewardSummary = `🏆 +${glory} Dicsőség Pont`;
        }

        this.db.prepare(`
            UPDATE planets 
            SET loot_revealed = 1, status = 'looted', defeated_by_player_id = ?
            WHERE id = ?
        `).run(playerId, planetId);

        if (planet.bot_type === 'boss') {
            this.db.prepare("UPDATE boss_state SET state = 'defeated', defeated_at_tick = ? WHERE id = ?")
                .run(this.getGameState(), planetId);
        }

        return {
            planetId,
            planetName: planet.name,
            lootType: planet.loot_type,
            lootData,
            rewardSummary
        };
    }

    addGloryPoints(playerId, amount) {
        this.db.prepare('UPDATE players SET glory_points = glory_points + ? WHERE id = ?').run(amount, playerId);
        return this.getPlayer(playerId);
    }

    getHumanPlayers(excludePlayerId = null) {
        const query = excludePlayerId 
            ? "SELECT id, username, color_hex, metal, energy, isotope, data_points, glory_points, is_ai, created_at FROM players WHERE id NOT IN ('bot_hostile', 'precursor_boss', ?)"
            : "SELECT id, username, color_hex, metal, energy, isotope, data_points, glory_points, is_ai, created_at FROM players WHERE id NOT IN ('bot_hostile', 'precursor_boss')";
        const players = excludePlayerId 
            ? this.db.prepare(query).all(excludePlayerId)
            : this.db.prepare(query).all();
        
        const curTick = this.getGameState();
        for (const p of players) {
            const basePlanet = this.db.prepare("SELECT id, name FROM planets WHERE owner_id = ? ORDER BY id ASC LIMIT 1").get(p.id);
            p.base_planet_id = basePlanet ? basePlanet.id : null;
            p.base_planet_name = basePlanet ? basePlanet.name : 'Ismeretlen Bázis';

            if (excludePlayerId) {
                const recentAttacks = this.db.prepare(`
                    SELECT COUNT(*) as count FROM glory_attack_history 
                    WHERE attacker_id = ? AND target_player_id = ? AND attack_tick >= ?
                `).get(excludePlayerId, p.id, curTick - 30);
                const count = recentAttacks ? recentAttacks.count : 0;
                let multiplier = 1.0;
                if (count === 1) multiplier = 0.60;
                else if (count === 2) multiplier = 0.35;
                else if (count === 3) multiplier = 0.20;
                else if (count >= 4) multiplier = 0.10;
                p.multiplier = multiplier;
                p.attacks_count = count;
            } else {
                p.multiplier = 1.0;
                p.attacks_count = 0;
            }
        }
        return players;
    }

    seedInitialWorld() {
        // Ellenőrizzük, hogy léteznek-e már játékosok
        this.db.prepare(`INSERT OR IGNORE INTO game_state (id, current_tick, next_tick_timestamp) VALUES (1, 1, datetime('now', '+1 hour'))`).run();
        const players = this.db.prepare('SELECT COUNT(*) as count FROM players').get();
        if (players.count > 0) return;

        // 1. Játékosok létrehozása (Emberi Parancsnok és Vektor-9 MI)
        this.db.prepare(`
            INSERT INTO players (id, username, color_hex, metal, energy, isotope, data_points, is_ai)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run('player', 'Parancsnok (Te)', '#0284c7', 1500.0, 350.0, 60.0, 150.0, 0);

        this.db.prepare(`
            INSERT INTO players (id, username, color_hex, metal, energy, isotope, data_points, is_ai)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run('enemy', 'Vektor-9 Szindikátus (MI)', '#dc2626', 1200.0, 300.0, 50.0, 100.0, 1);

        // 2. Bolygók létrehozása
        const insertPlanet = this.db.prepare(`
            INSERT INTO planets (id, name, pos_x, pos_y, size_slots, owner_id, base_metal_rate, base_energy_rate, planetary_shield_hp, max_shield_hp, railgun_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertPlanet.run('p1', 'KRONOS-IV', 140, 120, 4, 'player', 40.0, 15.0, 500.0, 500.0, 0);
        insertPlanet.run('p2', 'ZEPHYR-7', 320, 80, 3, null, 25.0, 10.0, 0.0, 0.0, 0);
        insertPlanet.run('p3', 'NEXUS-ALPHA', 220, 310, 5, null, 45.0, 20.0, 0.0, 0.0, 0);
        insertPlanet.run('p4', 'VEKTOR-9', 420, 350, 4, 'enemy', 40.0, 15.0, 400.0, 400.0, 1);

        // 3. Kezdő építmények
        const insertStruct = this.db.prepare(`
            INSERT INTO planet_structures (id, planet_id, slot_index, branch_type, structure_type, level)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        insertStruct.run('s1', 'p1', 0, 'economy', 'industrial_hub', 2);
        insertStruct.run('s2', 'p1', 1, 'defense', 'planetary_shield', 1);
        insertStruct.run('s3', 'p1', 2, 'infrastructure', 'automated_dock', 1);

        insertStruct.run('s4', 'p4', 0, 'economy', 'industrial_hub', 1);
        insertStruct.run('s5', 'p4', 1, 'defense', 'orbital_railgun', 1);

        // 4. Kezdő állomásozó flották
        this.createFleet('f_p1', 'player', 'Kronos Védelmi Flotta', 140, 120, 'p1', { corvette: 12, destroyer: 3, battleship: 0 });
        this.createFleet('f_p4', 'enemy', 'Vektor-9 Főflotta', 420, 350, 'p4', { corvette: 8, destroyer: 4, battleship: 1 });
    }

        createFleet(id, ownerId, name, x, y, originPlanetId, shipCounts) {
        this.db.prepare(`
            INSERT INTO fleets (id, owner_id, name, current_x, current_y, origin_planet_id, state)
            VALUES (?, ?, ?, ?, ?, ?, 'stationed')
        `).run(id, ownerId, name, x, y, originPlanetId);

        const insertShip = this.db.prepare(`
            INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const baseHulls = {
            scout: 40, interceptor: 70, corvette: 120, freighter: 350, colony_ship: 200,
            frigate: 280, destroyer: 450, heavy_destroyer: 950, cruiser: 800, battleship: 1600
        };
        const baseShields = {
            scout: 0, interceptor: 25, corvette: 40, freighter: 60, colony_ship: 50,
            frigate: 120, destroyer: 200, heavy_destroyer: 70, cruiser: 400, battleship: 800
        };

        for (const st of ALL_SHIP_TYPES) {
            const count = shipCounts[st] || 0;
            if (count > 0) {
                const hp = baseHulls[st] || 100;
                const sp = baseShields[st] || 0;
                insertShip.run(`${id}_${st}`, id, st, count, count * hp, count * sp);
            }
        }
    }

    // --- Lekérdező és Módosító metódusok ---

    getGameState() {
        const state = this.db.prepare('SELECT current_tick FROM game_state WHERE id = 1').get();
        return state ? state.current_tick : 1;
    }

    advanceGameTick() {
        this.db.prepare('UPDATE game_state SET current_tick = current_tick + 1 WHERE id = 1').run();
        return this.getGameState();
    }

    getPlayer(playerId) {
        return this.db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    }

    getAllPlayers() {
        return this.db.prepare('SELECT id, username, color_hex, metal, energy, isotope, data_points, glory_points, is_ai, created_at FROM players').all();
    }

    setPlayerHuman(playerId, isHuman = true) {
        this.db.prepare('UPDATE players SET is_ai = ? WHERE id = ?').run(isHuman ? 0 : 1, playerId);
        return this.getPlayer(playerId);
    }

    addChatMessage(senderId, senderName, text, tickNumber = 0) {
        const id = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        this.db.prepare(`
            INSERT INTO chat_messages (id, sender_id, sender_name, message, tick_number)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, senderId, senderName, text, tickNumber);
        return { id, sender_id: senderId, sender_name: senderName, message: text, tick_number: tickNumber, created_at: new Date().toISOString() };
    }

    getChatMessages(limit = 40) {
        const rows = this.db.prepare(`
            SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT ?
        `).all(limit);
        return rows.reverse();
    }

    updatePlayerResources(playerId, metal, energy, isotope, data) {
        this.db.prepare(`
            UPDATE players 
            SET metal = ?, energy = ?, isotope = ?, data_points = ?
            WHERE id = ?
        `).run(metal, energy, isotope, data, playerId);
    }

    getAllPlanets() {
        const planets = this.db.prepare('SELECT * FROM planets').all();
        for (const p of planets) {
            p.structures = this.db.prepare('SELECT * FROM planet_structures WHERE planet_id = ? ORDER BY slot_index').all(p.id);
            // Állomásozó flotta keresése ezen a bolygón
            const fleet = this.db.prepare("SELECT * FROM fleets WHERE origin_planet_id = ? AND state = 'stationed'").get(p.id);
            p.stationedFleet = { fleetId: fleet ? fleet.id : null };
            for (const st of ALL_SHIP_TYPES) {
                p.stationedFleet[st] = 0;
            }
            if (fleet) {
                const ships = this.db.prepare('SELECT ship_type, count FROM fleet_ships WHERE fleet_id = ?').all(fleet.id);
                for (const s of ships) {
                    p.stationedFleet[s.ship_type] = s.count || 0;
                }
            }
        }
        return planets;
    }

    getMovingFleets() {
        const fleets = this.db.prepare("SELECT * FROM fleets WHERE state = 'in_transit'").all();
        for (const f of fleets) {
            const ships = this.db.prepare('SELECT ship_type, count FROM fleet_ships WHERE fleet_id = ?').all(f.id);
            f.ships = {};
            for (const st of ALL_SHIP_TYPES) f.ships[st] = 0;
            for (const s of ships) {
                f.ships[s.ship_type] = s.count || 0;
            }
        }
        return fleets;
    }

    upgradeStructure(planetId, slotIndex) {
        const struct = this.db.prepare('SELECT * FROM planet_structures WHERE planet_id = ? AND slot_index = ?').get(planetId, slotIndex);
        if (!struct) return { error: "Nincs épület ezen a sloton!" };
        if (struct.level >= 3) return { error: "Ez az épület már elérte a maximális szintet (Lv.3)!" };

        const costMetal = struct.level === 1 ? 120 : 250;
        const player = this.getPlayer('player');
        if (player.metal < costMetal) return { error: `Nincs elég Fém! (${costMetal} Fém szükséges)` };

        player.metal -= costMetal;
        this.updatePlayerResources('player', player.metal, player.energy, player.isotope, player.data_points);
        this.db.prepare('UPDATE planet_structures SET level = level + 1 WHERE id = ?').run(struct.id);
        return { success: true, newLevel: struct.level + 1, costMetal };
    }

    getMissions() {
        return this.db.prepare('SELECT * FROM missions ORDER BY sort_order ASC').all();
    }

    getPlayerBuffs(playerId, currentTick = this.getGameState()) {
        return this.db.prepare('SELECT * FROM player_buffs WHERE player_id = ? AND expires_at_tick > ?').all(playerId, currentTick);
    }

    addPlayerBuff(playerId, buffType, buffValue, durationTicks, name, icon = '⚡') {
        const currentTick = this.getGameState();
        const expiresAt = currentTick + Math.max(1, durationTicks);
        const id = `buff_${playerId}_${buffType}_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        this.db.prepare(`
            INSERT INTO player_buffs (id, player_id, buff_type, buff_value, expires_at_tick, name, icon)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, playerId, buffType, buffValue, expiresAt, name, icon);
        return { id, buffType, buffValue, expiresAt, name, icon };
    }

    processBuffExpirations(currentTick) {
        const expired = this.db.prepare('SELECT * FROM player_buffs WHERE expires_at_tick <= ?').all(currentTick);
        if (expired.length > 0) {
            this.db.prepare('DELETE FROM player_buffs WHERE expires_at_tick <= ?').run(currentTick);
        }
        return expired;
    }

    getPlayerArtifacts(playerId) {
        return this.db.prepare('SELECT * FROM player_artifacts WHERE player_id = ?').all(playerId);
    }

    hasArtifact(playerId, artifactId) {
        const r = this.db.prepare('SELECT id FROM player_artifacts WHERE player_id = ? AND artifact_id = ?').get(playerId, artifactId);
        return !!r;
    }

    addPlayerArtifact(playerId, artifactId, name, icon = '🏺') {
        const currentTick = this.getGameState();
        const id = `art_${playerId}_${artifactId}`;
        this.db.prepare(`
            INSERT INTO player_artifacts (id, player_id, artifact_id, name, icon, acquired_at_tick)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id, artifact_id) DO NOTHING
        `).run(id, playerId, artifactId, name, icon, currentTick);
        return { id, artifactId, name, icon, acquiredAtTick: currentTick };
    }

    calculateGloryAward(attackerId, defenderId, currentTick = this.getGameState(), baseGlory = 100) {
        const recentAttacks = this.db.prepare(`
            SELECT COUNT(*) as count FROM glory_attack_history 
            WHERE attacker_id = ? AND target_player_id = ? AND attack_tick >= ?
        `).get(attackerId, defenderId, currentTick - 30);
        
        const count = recentAttacks ? recentAttacks.count : 0;
        
        // Csökkenő hozadékú szorzó: 1. -> 100%, 2. -> 60%, 3. -> 35%, 4. -> 20%, 5.+ -> 10%
        let multiplier = 1.0;
        if (count === 1) multiplier = 0.60;
        else if (count === 2) multiplier = 0.35;
        else if (count === 3) multiplier = 0.20;
        else if (count >= 4) multiplier = 0.10;
        
        const awardedGlory = Math.max(5, Math.round(baseGlory * multiplier));
        
        const id = `glory_${attackerId}_${defenderId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        this.db.prepare(`
            INSERT INTO glory_attack_history (id, attacker_id, target_player_id, attack_tick, glory_awarded)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, attackerId, defenderId, currentTick, awardedGlory);
        
        this.db.prepare('UPDATE players SET glory_points = glory_points + ? WHERE id = ?').run(awardedGlory, attackerId);
        
        return {
            gloryAwarded: awardedGlory,
            multiplier,
            attackCount: count + 1,
            baseGlory
        };
    }

    claimMissionReward(playerIdOrMissionId, maybeMissionId) {
        let playerId = 'player';
        let missionId = playerIdOrMissionId;
        if (maybeMissionId) {
            playerId = playerIdOrMissionId;
            missionId = maybeMissionId;
        }
        const mission = this.db.prepare('SELECT * FROM missions WHERE id = ?').get(missionId);
        if (!mission || mission.status !== 'completed') return null;

        const player = this.getPlayer(playerId) || this.getPlayer('player');
        player.metal += (mission.reward_metal || 0);
        player.energy += (mission.reward_energy || 0);
        player.isotope += (mission.reward_isotope || 0);
        player.data_points += (mission.reward_data || 0);
        this.updatePlayerResources(player.id, player.metal, player.energy, player.isotope, player.data_points);

        let grantedBuff = null;
        if (mission.reward_buff_type && mission.reward_buff_duration > 0) {
            const buffNames = {
                mining_boost: 'Bányászati Túltöltés',
                speed_boost: 'Tachion Hajtómű-Gyorsítás',
                shield_overcharge: 'Pajzskapacitás Túlterhelés',
                combat_dmg_buff: 'Kvantum Tűzerő Erősítés',
                combat_hull_buff: 'Megerősített Titánburkolat'
            };
            const buffIcons = {
                mining_boost: '⛏️',
                speed_boost: '🚀',
                shield_overcharge: '🌐',
                combat_dmg_buff: '💥',
                combat_hull_buff: '🛡️'
            };
            grantedBuff = this.addPlayerBuff(
                player.id,
                mission.reward_buff_type,
                mission.reward_buff_value,
                mission.reward_buff_duration,
                buffNames[mission.reward_buff_type] || 'Birodalmi Bónusz',
                buffIcons[mission.reward_buff_type] || '⚡'
            );
        }

        let grantedArtifact = null;
        if (mission.reward_artifact_id) {
            const artNames = {
                artifact_chrono_core: 'Kvantum Chrono-Mag',
                artifact_dark_resonator: 'Sötét Anyag Rezonátor',
                artifact_codex: 'Prekurzor Hozzáférési Kódex'
            };
            const artIcons = {
                artifact_chrono_core: '🏺',
                artifact_dark_resonator: '💎',
                artifact_codex: '🔮'
            };
            grantedArtifact = this.addPlayerArtifact(
                player.id,
                mission.reward_artifact_id,
                artNames[mission.reward_artifact_id] || mission.reward_artifact_id,
                artIcons[mission.reward_artifact_id] || '🏺'
            );
        }

        this.db.prepare("UPDATE missions SET status = 'claimed' WHERE id = ?").run(missionId);
        return {
            ...mission,
            grantedBuff,
            grantedArtifact
        };
    }

    getPlayerResearch(playerId) {
        const rows = this.db.prepare('SELECT tech_id, tier, unlocked_at_tick FROM player_research WHERE player_id = ?').all(playerId);
        return rows.map(r => r.tech_id);
    }

    getPlayerResearchDetails(playerId) {
        return this.db.prepare('SELECT * FROM player_research WHERE player_id = ?').all(playerId);
    }

    unlockTech(playerId, techId, tier, costData, costIso) {
        const player = this.getPlayer(playerId);
        if (!player) return { error: "Ismeretlen játékos!" };

        const existing = this.db.prepare('SELECT id FROM player_research WHERE player_id = ? AND tech_id = ?').get(playerId, techId);
        if (existing) return { error: "Ez a technológia már ki van fejlesztve!" };

        if (player.data_points < costData) {
            return { error: `Nincs elég Adatpont! (${costData} szükséges, rendelkezésre áll: ${Math.floor(player.data_points)})` };
        }
        if (player.isotope < costIso) {
            return { error: `Nincs elég Sötét Izotóp! (${costIso} szükséges, rendelkezésre áll: ${Math.floor(player.isotope)})` };
        }

        // Költség levonása
        player.data_points -= costData;
        player.isotope -= costIso;
        this.updatePlayerResources(playerId, player.metal, player.energy, player.isotope, player.data_points);

        const currentTick = this.getGameState();
        const id = `res_${playerId}_${techId}`;
        this.db.prepare(`
            INSERT INTO player_research (id, player_id, tech_id, tier, unlocked_at_tick)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, playerId, techId, tier, currentTick);

        // Speciális globális hatás: Nano-összeszerelés (+1 slot minden bolygón)
        if (techId === 'nano_assembly') {
            this.db.prepare('UPDATE planets SET size_slots = size_slots + 1 WHERE owner_id = ?').run(playerId);
        }

        return { success: true, techId, tier, remainingData: player.data_points, remainingIsotope: player.isotope };
    }

    getActiveResearch(playerId) {
        const row = this.db.prepare('SELECT * FROM research_queue WHERE player_id = ?').get(playerId);
        if (!row) return null;
        const currentTick = this.getGameState();
        const remainingTicks = Math.max(0, row.finish_tick - currentTick);
        const elapsed = currentTick - row.start_tick;
        const progress = Math.min(1.0, Math.max(0, elapsed / Math.max(1, row.duration_ticks)));
        return {
            ...row,
            remaining_ticks: remainingTicks,
            progress: progress
        };
    }

    startResearch(playerId, techId, durationTicks, costData, costIso) {
        const player = this.getPlayer(playerId);
        if (!player) return { error: "Ismeretlen játékos!" };

        // 1. Van-e már aktív kutatás?
        const active = this.db.prepare('SELECT tech_id FROM research_queue WHERE player_id = ?').get(playerId);
        if (active) {
            return { error: "A Központi Kutatóbázis jelenleg foglalt! Várd meg az aktív kutatás befejeződését." };
        }

        // 2. Ki van-e már fejlesztve?
        const researched = this.db.prepare('SELECT id FROM player_research WHERE player_id = ? AND tech_id = ?').get(playerId, techId);
        if (researched) {
            return { error: "Ez a technológia már kifejlesztésre került!" };
        }

        // 3. Nyersanyag-ellenőrzés
        if (player.data_points < costData) {
            return { error: `Nincs elég Adatpont! (${costData} szükséges, rendelkezésre áll: ${Math.floor(player.data_points)})` };
        }
        if (player.isotope < costIso) {
            return { error: `Nincs elég Sötét Izotóp! (${costIso} szükséges, rendelkezésre áll: ${Math.floor(player.isotope)})` };
        }

        // Költség levonása
        player.data_points -= costData;
        player.isotope -= costIso;
        this.updatePlayerResources(playerId, player.metal, player.energy, player.isotope, player.data_points);

        const currentTick = this.getGameState();
        const finishTick = currentTick + Math.max(1, durationTicks);
        const id = `rq_${playerId}_${techId}_${currentTick}`;

        this.db.prepare(`
            INSERT INTO research_queue (id, player_id, tech_id, start_tick, finish_tick, duration_ticks)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, playerId, techId, currentTick, finishTick, durationTicks);

        return { 
            success: true, 
            techId, 
            startTick: currentTick, 
            finishTick, 
            durationTicks,
            remainingData: player.data_points, 
            remainingIsotope: player.isotope 
        };
    }

    completeResearch(playerId, techId, currentTick = this.getGameState(), tier = 1) {
        const id = `res_${playerId}_${techId}`;
        this.db.prepare(`
            INSERT OR IGNORE INTO player_research (id, player_id, tech_id, tier, unlocked_at_tick)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, playerId, techId, tier, currentTick);

        this.db.prepare('DELETE FROM research_queue WHERE player_id = ? AND tech_id = ?').run(playerId, techId);

        // Speciális azonnali hatás: Nano-összeszerelés (+1 slot minden bolygón)
        if (techId === 'nano_assembly') {
            this.db.prepare('UPDATE planets SET size_slots = size_slots + 1 WHERE owner_id = ?').run(playerId);
        }
        return true;
    }

    processResearchQueue(currentTick) {
        const completedRows = this.db.prepare('SELECT * FROM research_queue WHERE finish_tick <= ?').all(currentTick);
        const finished = [];
        for (const item of completedRows) {
            this.completeResearch(item.player_id, item.tech_id, currentTick);
            finished.push({ playerId: item.player_id, techId: item.tech_id });
        }
        return finished;
    }

    getCombatLogs(limit = 10) {
        return this.db.prepare('SELECT * FROM combat_logs ORDER BY tick_number DESC, created_at DESC LIMIT ?').all(limit);
    }

    saveCombatLog(tick, posX, posY, locName, attackerId, defenderId, winnerId, logText, metal, iso) {
        const id = 'log_' + Date.now() + '_' + Math.floor(Math.random()*1000);
        this.db.prepare(`
            INSERT INTO combat_logs (id, tick_number, pos_x, pos_y, location_name, attacker_id, defender_id, winner_id, log_text, salvage_metal, salvage_isotope)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, tick, posX, posY, locName, attackerId, defenderId, winnerId, logText, metal, iso);
    }

    getAllBosses() {
        return this.db.prepare('SELECT * FROM boss_state ORDER BY id ASC').all();
    }

    getBossState(bossId = 'boss_1') {
        let b = this.db.prepare('SELECT * FROM boss_state WHERE id = ?').get(bossId);
        if (!b) {
            b = this.db.prepare('SELECT * FROM boss_state ORDER BY id ASC LIMIT 1').get();
        }
        return b;
    }

    updateBossState(bossId, hull, shield, state, defeatedAtTick = null) {
        this.db.prepare(`
            UPDATE boss_state
            SET hull = ?, shield = ?, state = ?, defeated_at_tick = ?
            WHERE id = ?
        `).run(hull, shield, state, defeatedAtTick, bossId);
        return this.getBossState(bossId);
    }

    checkBossPrerequisites(playerId = 'player', bossId = 'boss_1') {
        const player = this.getPlayer(playerId);
        const playerTechs = this.getPlayerResearch(playerId);
        const allPlanets = this.getAllPlanets();
        const ownedPlanets = allPlanets.filter(p => p.owner_id === playerId);
        const boss = this.getBossState(bossId);
        const artifacts = this.getPlayerArtifacts(playerId).map(a => a.artifact_id);
        const glory = player ? (player.glory_points || 0) : 0;

        let totalBB = 0;
        let totalDestroyers = 0;
        let totalCorvettes = 0;
        let totalFrigates = 0;
        for (const p of ownedPlanets) {
            totalBB += (p.stationedFleet.battleship || 0);
            totalDestroyers += (p.stationedFleet.destroyer || 0);
            totalCorvettes += (p.stationedFleet.corvette || 0);
            totalFrigates += (p.stationedFleet.frigate || 0);
        }

        let requiredGlory = 100;
        let requiredArtifacts = ['artifact_chrono_core'];
        let reqIso = 50;
        let reqData = 100;
        let techMet = true;
        let techDetails = "Nincs speciális tech követelmény.";
        let fleetMet = false;
        let fleetDetails = "";

        if (bossId === 'boss_1') {
            requiredGlory = 100;
            requiredArtifacts = ['artifact_chrono_core'];
            reqIso = 50;
            reqData = 100;
            fleetMet = totalCorvettes >= 6 || totalDestroyers >= 2;
            fleetDetails = `Haderő: ${totalCorvettes}/6 Korvett VAGY ${totalDestroyers}/2 Romboló`;
            techMet = true;
            techDetails = "Alapszintű flotta-infrastruktúra elegendő.";
        } else if (bossId === 'boss_2') {
            requiredGlory = 250;
            requiredArtifacts = ['artifact_chrono_core', 'artifact_dark_resonator'];
            reqIso = 100;
            reqData = 200;
            fleetMet = totalDestroyers >= 4 && (totalFrigates >= 2 || totalCorvettes >= 8);
            fleetDetails = `Haderő: ${totalDestroyers}/4 Romboló és (${totalFrigates}/2 Fregatt vagy ${totalCorvettes}/8 Korvett)`;
            techMet = playerTechs.includes('extended_shielding') || playerTechs.includes('heavy_metallurgy');
            techDetails = techMet ? "Kifejlesztve: Kiterjesztett Pajzs VAGY Nehézfém Kohászat!" : "Szükséges: Kiterjesztett Pajzs VAGY Nehézfém Kohászat";
        } else {
            // boss_3 (Omega Leviatán)
            requiredGlory = 450;
            requiredArtifacts = ['artifact_chrono_core', 'artifact_dark_resonator', 'artifact_codex'];
            reqIso = 150;
            reqData = 300;
            fleetMet = totalBB >= 3 && totalDestroyers >= 6;
            fleetDetails = `Haderő: ${totalBB}/3 Csatahajó, ${totalDestroyers}/6 Romboló`;
            const hasSiege = playerTechs.includes('siege_warheads');
            const hasAdvancedEnergy = playerTechs.includes('antimatter_containment') || playerTechs.includes('hyperspace_gate');
            techMet = hasSiege && hasAdvancedEnergy;
            techDetails = techMet ? "Kifejlesztve: Ostrom-töltetek és Csúcstechnológia!" : "Szükséges: Ostrom-töltetek ÉS (Antianyag Csomópont VAGY Hipertér-Ugrómotor)";
        }

        const gloryMet = glory >= requiredGlory;
        const gloryDetails = `Dicsőség: ${Math.floor(glory)} / ${requiredGlory} Pont`;

        const missingArts = requiredArtifacts.filter(aId => !artifacts.includes(aId));
        const artMet = missingArts.length === 0;
        const artNames = {
            artifact_chrono_core: 'Kvantum Chrono-Mag',
            artifact_dark_resonator: 'Sötét Anyag Rezonátor',
            artifact_codex: 'Prekurzor Hozzáférési Kódex'
        };
        const artDetails = artMet 
            ? `Birtokolt ereklyék: ${requiredArtifacts.map(a => artNames[a]).join(', ')}`
            : `Hiányzó ereklye: ${missingArts.map(a => artNames[a]).join(', ')}`;

        const isoOk = player ? player.isotope >= reqIso : false;
        const dataOk = player ? player.data_points >= reqData : false;
        const resourcesMet = isoOk && dataOk;
        const resourcesDetails = player ? `Szükséges: ${reqIso} Iso (${Math.floor(player.isotope)}/${reqIso}), ${reqData} Dat (${Math.floor(player.data_points)}/${reqData})` : "Ismeretlen játékos";

        const canAttack = gloryMet && artMet && techMet && fleetMet && resourcesMet && boss && boss.state !== 'defeated';

        return {
            canAttack,
            boss,
            bossId,
            criteria: {
                glory: { met: gloryMet, title: "1. Birodalmi Dicsőség", details: gloryDetails },
                artifacts: { met: artMet, title: "2. Szükséges Prekurzor Ereklyék", details: artDetails },
                tech: { met: techMet, title: "3. Technológiai Áttörés", details: techDetails },
                fleet: { met: fleetMet, title: "4. Armada Csúcskapacitás", details: fleetDetails },
                resources: { met: resourcesMet, title: "5. Ugrókapu Rezonancia Költség", details: resourcesDetails }
            }
        };
    }

    // --- Hajófejlesztési és Modul Dokk Metódusok ---

        _normalizeSubsystems(shipType, raw) {
        const slots = SHIP_SUBSYSTEMS[shipType] || {};
        const defaultLevels = {};
        for (const k of Object.keys(slots)) defaultLevels[k] = 0;
        if (!raw) return defaultLevels;

        if (Array.isArray(raw)) {
            for (const item of raw) {
                for (const [sKey, sDef] of Object.entries(slots)) {
                    if (sDef.legacyId === item || sKey === item) {
                        defaultLevels[sKey] = 1;
                    }
                }
            }
            return defaultLevels;
        }

        if (typeof raw === 'object') {
            for (const k of Object.keys(slots)) {
                defaultLevels[k] = Number.isInteger(raw[k]) ? Math.max(0, Math.min(10, raw[k])) : 0;
            }
            return defaultLevels;
        }

        return defaultLevels;
    }

    getShipUpgrades(playerId) {
        const rows = this.db.prepare('SELECT ship_type, selected_modules FROM ship_upgrades WHERE player_id = ?').all(playerId);
        const result = {};
        for (const st of ALL_SHIP_TYPES) {
            result[st] = this._normalizeSubsystems(st, {});
        }
        for (const r of rows) {
            try {
                const parsed = JSON.parse(r.selected_modules);
                result[r.ship_type] = this._normalizeSubsystems(r.ship_type, parsed);
            } catch (e) {
                result[r.ship_type] = this._normalizeSubsystems(r.ship_type, {});
            }
        }
        return result;
    }

    getMaxShipUpgradeSlots(playerId, shipType = 'corvette') {
        const techs = this.getPlayerResearch(playerId);
        const tier3Techs = ['nano_assembly', 'antimatter_containment', 'siege_warheads', 'hyperspace_gate'];
        const tier2Techs = ['heavy_metallurgy', 'extended_shielding', 'automated_dock', 'superconductor_grid', 'isotope_compression'];

        const planets = this.getAllPlanets().filter(p => p.owner_id === playerId);
        const hasDockLv2 = planets.some(p => p.structures && p.structures.some(s => s.structure_type === 'automated_dock' && s.level >= 2));

        const hasTier3 = techs.some(t => tier3Techs.includes(t));
        const hasTier2 = techs.some(t => tier2Techs.includes(t)) || hasDockLv2;

        const shipDef = SHIP_SUBSYSTEMS[shipType] || SHIP_SUBSYSTEMS.corvette;
        const slotCount = Object.keys(shipDef).length; // 3, 4 vagy 5 alrendszer
        const totalPossibleLevels = slotCount * 10;
        const maxCapTotal = Math.round(totalPossibleLevels * 0.60); // 18, 24 vagy 30 szint!
        const tier1Budget = Math.round(totalPossibleLevels * 0.20); // 6, 8 vagy 10 szint
        const tier2Budget = Math.round(totalPossibleLevels * 0.40); // 12, 16 vagy 20 szint

        if (hasTier3) {
            return {
                maxLevelBudget: maxCapTotal,
                maxSlots: slotCount,
                unlockedSlots: slotCount,
                maxCapPercentage: 60,
                maxTotalCap: maxCapTotal,
                totalPossibleLevels,
                tierReached: 3,
                explanation: `Maximális 60%-os szintkeret feloldva (összesen maximum ${maxCapTotal}/${totalPossibleLevels} szint fejleszthető)! Tier 3 kutatás aktív.`
            };
        } else if (hasTier2) {
            return {
                maxLevelBudget: tier2Budget,
                maxSlots: slotCount,
                unlockedSlots: slotCount,
                maxCapPercentage: 40,
                maxTotalCap: maxCapTotal,
                totalPossibleLevels,
                tierReached: 2,
                explanation: `Középfokú dokkkapacitás (${tier2Budget}/${totalPossibleLevels} szint fejleszthető - 40%). Tier 3 kutatás szükséges a maximális ${maxCapTotal} szinthez (60% plafon)!`
            };
        } else {
            return {
                maxLevelBudget: tier1Budget,
                maxSlots: slotCount,
                unlockedSlots: slotCount,
                maxCapPercentage: 20,
                maxTotalCap: maxCapTotal,
                totalPossibleLevels,
                tierReached: 1,
                explanation: `Alap dokk kapacitás (${tier1Budget}/${totalPossibleLevels} szint fejleszthető - 20%). Kutass Tier 2 technológiát vagy fejleszd a Dokkot Lv.2-re a ${tier2Budget} szintes kerethez!`
            };
        }
    }

    upgradeShipSubsystem(playerId, shipType, slotKey) {
        const shipDef = SHIP_SUBSYSTEMS[shipType];
        if (!shipDef || !shipDef[slotKey]) {
            return { error: `Érvénytelen alrendszer: ${shipType}.${slotKey}` };
        }
        const slotDef = shipDef[slotKey];
        const player = this.getPlayer(playerId);
        if (!player) return { error: `Nem található játékos: ${playerId}` };

        const allUpgrades = this.getShipUpgrades(playerId);
        const shipLevels = Object.assign({}, allUpgrades[shipType] || {});
        const currentLevel = shipLevels[slotKey] || 0;

        if (slotDef.requiredTech) {
            const playerTechs = this.getPlayerResearch(playerId);
            if (!playerTechs.includes(slotDef.requiredTech)) {
                return {
                    error: `A(z) ${slotDef.name} fejlesztéséhez a(z) '${slotDef.requiredTech}' technológia kifejlesztése szükséges a Tech Fán!`,
                    code: 'TECH_PREREQ_LOCKED',
                    requiredTech: slotDef.requiredTech
                };
            }
        }

        if (currentLevel >= 10) {
            return { error: `Az alrendszer (${slotDef.name}) már elérte a maximális (10.) szintet!`, code: 'MAX_LEVEL_REACHED' };
        }

        const totalLevels = Object.values(shipLevels).reduce((sum, lvl) => sum + (lvl || 0), 0);
        const slotInfo = this.getMaxShipUpgradeSlots(playerId, shipType);

        // Szigorú globális 60%-os korlát
        if (totalLevels >= slotInfo.maxTotalCap) {
            return {
                error: `Elérted a 60%-os fejlesztési plafont (összesen maximum ${slotInfo.maxTotalCap}/${slotInfo.totalPossibleLevels} szint fejleszthető hajónként)!`,
                code: "MAX_CAP_REACHED"
            };
        }

        // Jelenlegi technológiai feloldás korlát
        if (totalLevels >= slotInfo.maxLevelBudget) {
            return {
                error: `Még nem oldottad fel a további fejlesztési keretet! (Jelenlegi limit: ${slotInfo.maxLevelBudget}/${slotInfo.maxTotalCap} szint - ${slotInfo.maxCapPercentage}%). ${slotInfo.explanation}`,
                code: "BUDGET_LOCKED"
            };
        }

        const nextLevel = currentLevel + 1;
        const nextLevelSpec = slotDef.levels[nextLevel - 1];

        if (nextLevel >= 4 && nextLevel <= 6 && slotInfo.tierReached < 2) {
            return {
                error: `A(z) ${nextLevel}. szintű alrendszerhez legalább Tier 2 kutatás vagy Lv.2 Dokk szükséges!`,
                code: "TECH_TIER_LOCKED"
            };
        }
        if (nextLevel >= 7 && slotInfo.tierReached < 3) {
            return {
                error: `A(z) ${nextLevel}. szintű csúcs-alrendszerhez Tier 3 kutatás szükséges!`,
                code: "TECH_TIER_LOCKED"
            };
        }

        if (player.metal < nextLevelSpec.cost_metal || player.energy < nextLevelSpec.cost_energy || player.isotope < nextLevelSpec.cost_isotope) {
            return {
                error: `Nincs elég nyersanyag a fejlesztéshez! Szükséges: ${nextLevelSpec.cost_metal} Fém, ${nextLevelSpec.cost_energy} E, ${nextLevelSpec.cost_isotope} Iso.`,
                code: "INSUFFICIENT_RESOURCES"
            };
        }

        player.metal -= nextLevelSpec.cost_metal;
        player.energy -= nextLevelSpec.cost_energy;
        player.isotope -= nextLevelSpec.cost_isotope;
        this.updatePlayerResources(playerId, player.metal, player.energy, player.isotope, player.data_points);

        shipLevels[slotKey] = nextLevel;
        this._saveShipUpgrade(playerId, shipType, shipLevels);

        return {
            success: true,
            action: 'upgraded',
            shipType,
            slotKey,
            newLevel: nextLevel,
            levels: shipLevels,
            totalLevels: totalLevels + 1,
            slotInfo: this.getMaxShipUpgradeSlots(playerId, shipType),
            playerResources: { metal: player.metal, energy: player.energy, isotope: player.isotope }
        };
    }

    resetShipSubsystem(playerId, shipType, slotKey) {
        const shipDef = SHIP_SUBSYSTEMS[shipType];
        if (!shipDef || !shipDef[slotKey]) {
            return { error: `Érvénytelen alrendszer: ${shipType}.${slotKey}` };
        }
        const slotDef = shipDef[slotKey];
        const player = this.getPlayer(playerId);
        if (!player) return { error: `Nem található játékos: ${playerId}` };

        const allUpgrades = this.getShipUpgrades(playerId);
        const shipLevels = Object.assign({}, allUpgrades[shipType] || {});
        const currentLevel = shipLevels[slotKey] || 0;

        if (currentLevel === 0) {
            return { error: "Ez az alrendszer már inaktív (Szint 0)!", code: "ALREADY_INACTIVE" };
        }

        let totalInvestedMetal = 0;
        let totalInvestedEnergy = 0;
        let totalInvestedIsotope = 0;

        for (let lvl = 1; lvl <= currentLevel; lvl++) {
            const spec = slotDef.levels[lvl - 1];
            totalInvestedMetal += spec.cost_metal;
            totalInvestedEnergy += spec.cost_energy;
            totalInvestedIsotope += spec.cost_isotope;
        }

        const refundMetal = Math.floor(totalInvestedMetal * 0.50);
        const refundEnergy = Math.floor(totalInvestedEnergy * 0.50);
        const refundIsotope = Math.floor(totalInvestedIsotope * 0.50);

        player.metal += refundMetal;
        player.energy += refundEnergy;
        player.isotope += refundIsotope;
        this.updatePlayerResources(playerId, player.metal, player.energy, player.isotope, player.data_points);

        shipLevels[slotKey] = 0;
        this._saveShipUpgrade(playerId, shipType, shipLevels);

        const newTotalLevels = Object.values(shipLevels).reduce((sum, lvl) => sum + (lvl || 0), 0);

        return {
            success: true,
            action: 'reset',
            shipType,
            slotKey,
            newLevel: 0,
            refund: { metal: refundMetal, energy: refundEnergy, isotope: refundIsotope },
            levels: shipLevels,
            totalLevels: newTotalLevels,
            slotInfo: this.getMaxShipUpgradeSlots(playerId, shipType),
            playerResources: { metal: player.metal, energy: player.energy, isotope: player.isotope }
        };
    }

    toggleShipUpgrade(playerId, shipType, moduleIdOrSlotKey) {
        // Visszafelé kompatibilitás: megkeressük, melyik alrendszerhez tartozik az ID vagy kulcs
        const shipDef = SHIP_SUBSYSTEMS[shipType];
        if (!shipDef) return { error: `Érvénytelen hajóosztály: ${shipType}` };

        let targetSlotKey = null;
        for (const [sKey, sDef] of Object.entries(shipDef)) {
            if (sKey === moduleIdOrSlotKey || sDef.legacyId === moduleIdOrSlotKey) {
                targetSlotKey = sKey;
                break;
            }
        }
        if (!targetSlotKey) return { error: `Érvénytelen alrendszer azonosító: ${moduleIdOrSlotKey}` };

        const allUpgrades = this.getShipUpgrades(playerId);
        const shipLevels = allUpgrades[shipType] || {};
        const curLvl = shipLevels[targetSlotKey] || 0;

        if (curLvl > 0) {
            const res = this.resetShipSubsystem(playerId, shipType, targetSlotKey);
            if (res.error) return res;
            const activeModules = [];
            for (const [sk, slvl] of Object.entries(res.levels)) {
                if (slvl > 0 && shipDef[sk]) activeModules.push(shipDef[sk].legacyId);
            }
            return {
                success: true,
                action: 'uninstalled',
                shipType,
                moduleId: moduleIdOrSlotKey,
                activeModules,
                levels: res.levels,
                slotInfo: res.slotInfo
            };
        } else {
            const res = this.upgradeShipSubsystem(playerId, shipType, targetSlotKey);
            if (res.error) return res;
            const activeModules = [];
            for (const [sk, slvl] of Object.entries(res.levels)) {
                if (slvl > 0 && shipDef[sk]) activeModules.push(shipDef[sk].legacyId);
            }
            return {
                success: true,
                action: 'installed',
                shipType,
                moduleId: moduleIdOrSlotKey,
                activeModules,
                levels: res.levels,
                slotInfo: res.slotInfo
            };
        }
    }

    _saveShipUpgrade(playerId, shipType, levels) {
        const json = JSON.stringify(levels);
        const id = `su_${playerId}_${shipType}`;
        this.db.prepare(`
            INSERT INTO ship_upgrades (id, player_id, ship_type, selected_modules)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(player_id, ship_type) DO UPDATE SET selected_modules = excluded.selected_modules
        `).run(id, playerId, shipType, json);
    }
}

module.exports = { DatabaseService, DB_FILE, ALL_SHIP_TYPES, SHIP_TECH_REQUIREMENTS, SHIP_UPGRADE_MODULES, SHIP_SUBSYSTEMS, SUBSYSTEM_HOTSPOTS, SUBSYSTEM_BONUS_TABLES };
