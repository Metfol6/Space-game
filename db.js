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
    'frigate', 'destroyer', 'repair_ship', 'cruiser', 'battleship'
];

const SHIP_TECH_REQUIREMENTS = {
    scout: null,
    corvette: null,
    freighter: null,
    interceptor: 'ion_thrusters',
    colony_ship: 'automated_dock',
    frigate: 'extended_shielding',
    destroyer: 'heavy_metallurgy',
    repair_ship: 'automated_dock',
    cruiser: 'antimatter_containment',
    battleship: 'hyperspace_gate'
};

const SUBSYSTEM_HOTSPOTS = {
    scout: {
        stealth: { x: 20, y: 50, label: 'Álcázó Mező & Lopakodás', icon: '🕵️' },
        hull: { x: 50, y: 55, label: 'Könnyített Titán Törzs', icon: '🛡️' },
        sensors: { x: 82, y: 50, label: 'Mélyűri Tachion Szkenner', icon: '📡' }
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
        cargo_hold: { x: 82, y: 52, label: 'Kvantum Raktérkapacitás', icon: '📦' },
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
    repair_ship: {
        weapon: { x: 70, y: 30, label: 'Nano-Rezgődokk & Javítósugár', icon: '🔧' },
        hull: { x: 45, y: 50, label: 'Vastagított Segélyhajó Páncél', icon: '🛡️' },
        shield: { x: 65, y: 50, label: 'Kvantum Védőháló & Elhárító', icon: '🌐' },
        engine: { x: 16, y: 50, label: 'Taktikai Vészhelyzeti Tolóerő', icon: '🚀' },
        avionics: { x: 52, y: 20, label: 'Központi Triage & Kapacitásvezérlő', icon: '📡' }
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
        stealth: [0, 0.25, 0.32, 0.40, 0.48, 0.56, 0.65, 0.74, 0.82, 0.90, 0.98],
        hull: [0, 15, 30, 50, 75, 105, 140, 180, 225, 275, 330],
        sensors: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
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
        cargo_hold: [0, 450, 900, 1400, 1950, 2550, 3200, 3900, 4650, 5450, 6500],
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
    repair_ship: {
        repair_boost_hull: [0, 0.015, 0.03, 0.045, 0.06, 0.075, 0.09, 0.105, 0.12, 0.135, 0.15],
        repair_boost_shield: [0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18, 0.20],
        fleet_dmg_reduction: [0, 0.06, 0.075, 0.09, 0.105, 0.12, 0.135, 0.15, 0.165, 0.18, 0.20],
        hull: [0, 150, 310, 480, 660, 850, 1050, 1260, 1480, 1710, 1950],
        shield: [0, 60, 130, 210, 300, 400, 510, 630, 760, 900, 1050],
        speed: [0, 0.5, 1.0, 1.6, 2.3, 3.0, 3.8, 4.7, 5.7, 6.8, 8.0],
        extra_targets: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]
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
        repair_ship: { m: 65, e: 35, i_t2: 18, i_t3: 32 },
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
        freighter: { hull: 350, shield: 60, damage: 0, speed: 4.0, cargo: 500 },
        colony_ship: { hull: 200, shield: 50, damage: 0, speed: 3.0 },
        frigate: { hull: 280, shield: 120, damage: 85, speed: 4.5 },
        destroyer: { hull: 450, shield: 200, damage: 110, speed: 3.5 },
        repair_ship: { hull: 500, shield: 250, damage: 15, speed: 3.5 },
        cruiser: { hull: 800, shield: 400, damage: 75, speed: 3.0 },
        battleship: { hull: 1600, shield: 800, damage: 380, speed: 2.0 }
    }[shipType] || { hull: 100, shield: 0, damage: 10, speed: 3.0 };

    for (let lvl = 1; lvl <= 10; lvl++) {
        const req_tier = lvl <= 3 ? 1 : (lvl <= 6 ? 2 : 3);
        const cost = calculateSubsystemCost(shipType, lvl);
        const name = `${ROMAN_NUMS[lvl - 1]} ${LEVEL_TITLES[lvl - 1]}`;
        let desc = '';
        let stats = {};

        if (slotKey === 'stealth') {
            const st = (tables.stealth && tables.stealth[lvl]) || (0.20 + lvl * 0.075);
            stats = { stealth: st };
            desc = `+${Math.round(st * 100)}% lopakodási és álcázási túlélési esély kémkedéskor`;
        } else if (slotKey === 'sensors') {
            const pwr = (tables.sensors && tables.sensors[lvl]) || lvl;
            stats = { recon_power: pwr };
            desc = `+${pwr} felderítő erő / szonda (${1 + pwr} pont / egység)`;
        } else if (slotKey === 'cargo_hold') {
            const c = (tables.cargo_hold && tables.cargo_hold[lvl]) || (450 * lvl);
            stats = { cargo_hold: c };
            desc = `+${c} raktér (500 -> ${500 + c} kapacitás / hajó)`;
        } else if (slotKey === 'weapon') {
            const dmg = (tables.damage && tables.damage[lvl]) || 0;
            stats = { damage: dmg };
            desc = `+${dmg} sebzés (${baseStats.damage} -> ${baseStats.damage + dmg} DMG)`;
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
            } else if (shipType === 'repair_ship') {
                const boost = tables.repair_boost_hull ? (tables.repair_boost_hull[lvl] || 0) : 0;
                const targets = tables.extra_targets ? (tables.extra_targets[lvl] || 0) : 0;
                stats = { repair_boost: boost, extra_targets: targets };
                desc = `+${Math.round(boost * 100)}% extra kör végi javítás, +${targets} célpontkapacitás`;
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
        stealth: { slotKey: 'stealth', name: 'Álcázó Mező & Lopakodás', icon: '🕵️', legacyId: 'scout_stealth', levels: generateSubsystemLevels('scout', 'stealth') },
        hull: { slotKey: 'hull', name: 'Könnyített Titán Páncél', icon: '🛡️', legacyId: 'scout_hull_reinforce', levels: generateSubsystemLevels('scout', 'hull') },
        sensors: { slotKey: 'sensors', name: 'Mélyűri Tachion Szkenner', icon: '📡', legacyId: 'scout_sensors', levels: generateSubsystemLevels('scout', 'sensors') }
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
        cargo_hold: { slotKey: 'cargo_hold', name: 'Kvantum Raktérkapacitás', icon: '📦', legacyId: 'freight_cargo_hold', levels: generateSubsystemLevels('freighter', 'cargo_hold') },
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
    repair_ship: {
        weapon: { slotKey: 'weapon', name: 'Nano-Rezgődokk & Javítósugár', icon: '🔧', legacyId: 'rep_nano_emitter', levels: generateSubsystemLevels('repair_ship', 'weapon') },
        hull: { slotKey: 'hull', name: 'Vastagított Segélyhajó Páncélzat', icon: '🛡️', legacyId: 'rep_reinforced_plating', levels: generateSubsystemLevels('repair_ship', 'hull') },
        shield: { slotKey: 'shield', name: 'Kvantum Védőháló & Elhárító', icon: '🌐', legacyId: 'rep_defense_aura', levels: generateSubsystemLevels('repair_ship', 'shield') },
        engine: { slotKey: 'engine', name: 'Taktikai Vészhelyzeti Tolóerő', icon: '🚀', legacyId: 'rep_emergency_thrust', levels: generateSubsystemLevels('repair_ship', 'engine') },
        avionics: { slotKey: 'avionics', name: 'Központi Triage & Kapacitás-Komputer', icon: '📡', legacyId: 'rep_triage_core', levels: generateSubsystemLevels('repair_ship', 'avionics') }
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

// ============================================================================
// BOLYGÓI ÉPÜLETEK ÉS SLOT RENDSZER DEFINÍCIÓI (6 KATEGÓRIA, 10 ÉPÜLETTÍPUS)
// ============================================================================
const BUILDING_SPECS = {
    terraformer: {
        id: 'terraformer',
        name: 'Terraformáló Állomás',
        category: 'terraformer',
        tier: 1,
        icon: '🌍',
        maxLevel: 5,
        baseSlots: 0, // Nem foglal slotot, hanem növeli a bolygó slotjait (+4 / +5 / +6 per szint)!
        upgradeSlotCost: 0,
        uniquePerPlanet: true,
        baseCostMetal: 180,
        baseCostEnergy: 90,
        baseCostIsotope: 15,
        desc: '5 szintig fejleszthető. Minden szint újabb slotokat ad a bolygóhoz (Kicsi: +4, Közepes: +5, Nagy: +6 slot/szint).'
    },
    ship_dock: {
        id: 'ship_dock',
        name: 'Hajódokk',
        category: 'dock',
        tier: 1,
        icon: '⚓',
        maxLevel: 5,
        baseSlots: 1,
        upgradeSlotCost: 1,
        uniquePerPlanet: true,
        baseCostMetal: 150,
        baseCostEnergy: 75,
        baseCostIsotope: 10,
        desc: 'Megépítése után állomásozhat itt védőflotta (nem fordul vissza haza), és lehetővé teszi a hajógyártást a bolygón (+250 Pajzs HP/szint).'
    },
    // 1. Fémtermelő épületek
    surface_mine: {
        id: 'surface_mine',
        name: 'Felszíni bányatelep',
        category: 'metal',
        resource: 'metal',
        tier: 1,
        icon: '⛏️',
        maxLevel: 10,
        baseSlots: 1,
        upgradeSlotCost: 1,
        baseCostMetal: 75,
        baseCostEnergy: 25,
        baseCostIsotope: 0,
        baseProduction: 25,
        desc: 'Alap fémkitermelő telep (1 slot). Olcsó és megbízható (+25 Fém/óra szintenként).'
    },
    deep_core_drill: {
        id: 'deep_core_drill',
        name: 'Mélységi Mag-fúró',
        category: 'metal',
        resource: 'metal',
        tier: 2,
        icon: '🌋',
        maxLevel: 10,
        baseSlots: 2,
        upgradeSlotCost: 1,
        prereqBuilding: 'surface_mine',
        prereqLevel: 1,
        baseCostMetal: 300,
        baseCostEnergy: 130,
        baseCostIsotope: 25,
        baseProduction: 110,
        desc: 'Nehéz fémkitermelő komplexum (alapból 2 slot, fejlesztés +1 slot). Hatalmas hozam (+110 Fém/óra szintenként). Előfeltétel: Felszíni bányatelep (vagy Nagy bolygó Fém bónusz).'
    },
    // 2. Energiatermelő épületek
    solar_farm: {
        id: 'solar_farm',
        name: 'Szolár-farm',
        category: 'energy',
        resource: 'energy',
        tier: 1,
        icon: '☀️',
        maxLevel: 10,
        baseSlots: 1,
        upgradeSlotCost: 1,
        baseCostMetal: 65,
        baseCostEnergy: 20,
        baseCostIsotope: 0,
        baseProduction: 20,
        desc: 'Felszíni napenergia-kollektor (1 slot). Stabil energiatermelés (+20 Energia/óra szintenként).'
    },
    fusion_plant: {
        id: 'fusion_plant',
        name: 'Fúziós Erőmű',
        category: 'energy',
        resource: 'energy',
        tier: 2,
        icon: '⚛️',
        maxLevel: 10,
        baseSlots: 2,
        upgradeSlotCost: 1,
        prereqBuilding: 'solar_farm',
        prereqLevel: 1,
        baseCostMetal: 270,
        baseCostEnergy: 110,
        baseCostIsotope: 25,
        baseProduction: 90,
        desc: 'Nagy teljesítményű magfúziós reaktor (alapból 2 slot, fejlesztés +1 slot). (+90 Energia/óra szintenként). Előfeltétel: Szolár-farm (vagy Nagy bolygó Energia bónusz).'
    },
    // 3. Izotóp termelő épületek
    isotope_filter: {
        id: 'isotope_filter',
        name: 'Izotóp szűrő állomás',
        category: 'isotope',
        resource: 'isotope',
        tier: 1,
        icon: '🧪',
        maxLevel: 10,
        baseSlots: 1,
        upgradeSlotCost: 1,
        baseCostMetal: 95,
        baseCostEnergy: 45,
        baseCostIsotope: 0,
        baseProduction: 8,
        desc: 'Könnyű izotóp-kivonó állomás (1 slot). (+8 Izotóp/óra szintenként).'
    },
    enrichment_complex: {
        id: 'enrichment_complex',
        name: 'Dúsító Komplexum',
        category: 'isotope',
        resource: 'isotope',
        tier: 2,
        icon: '☣️',
        maxLevel: 10,
        baseSlots: 2,
        upgradeSlotCost: 1,
        prereqBuilding: 'isotope_filter',
        prereqLevel: 1,
        baseCostMetal: 340,
        baseCostEnergy: 160,
        baseCostIsotope: 35,
        baseProduction: 36,
        desc: 'Ipari sötétizotóp-dúsító (alapból 2 slot, fejlesztés +1 slot). (+36 Izotóp/óra szintenként). Előfeltétel: Izotóp szűrő állomás (vagy Nagy bolygó Izotóp bónusz).'
    },
    // 4. Adat termelő épületek
    relay_station: {
        id: 'relay_station',
        name: 'Reléállomás',
        category: 'data',
        resource: 'data',
        tier: 1,
        icon: '📡',
        maxLevel: 10,
        baseSlots: 1,
        upgradeSlotCost: 1,
        baseCostMetal: 85,
        baseCostEnergy: 40,
        baseCostIsotope: 0,
        baseProduction: 10,
        desc: 'Orbitális adat- és kommunikációs relé (1 slot). (+10 Adat/óra szintenként).'
    },
    quantum_server_park: {
        id: 'quantum_server_park',
        name: 'Kvantum Szerverpark',
        category: 'data',
        resource: 'data',
        tier: 2,
        icon: '🖥️',
        maxLevel: 10,
        baseSlots: 2,
        upgradeSlotCost: 1,
        prereqBuilding: 'relay_station',
        prereqLevel: 1,
        baseCostMetal: 320,
        baseCostEnergy: 150,
        baseCostIsotope: 30,
        baseProduction: 45,
        desc: 'Mélyűri kvantumszámítógép-központ (alapból 2 slot, fejlesztés +1 slot). (+45 Adat/óra szintenként). Előfeltétel: Reléállomás (vagy Nagy bolygó Adat bónusz).'
    }
};

const LEGACY_BUILDING_MAP = {
    industrial_hub: 'surface_mine',
    trade_network: 'relay_station',
    planetary_shield: 'ship_dock',
    orbital_railgun: 'solar_farm',
    automated_dock: 'ship_dock',
    sensor_array: 'relay_station'
};

const GALAXY_CENTER = { x: 500, y: 500 };
const MAX_COLONIES_PER_PLAYER = 5; // Főbolygón kívül max 5 kolónia (összesen 6 bolygó)


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

        // 10. Szövetségi Rendszer és Közös Hadműveletek Táblái
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS alliances (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                tag TEXT NOT NULL UNIQUE,
                description TEXT,
                leader_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS alliance_members (
                id TEXT PRIMARY KEY,
                alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
                player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                role TEXT NOT NULL DEFAULT 'member',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(player_id)
            );

            CREATE TABLE IF NOT EXISTS alliance_operations (
                id TEXT PRIMARY KEY,
                alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
                creator_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                target_name TEXT NOT NULL,
                target_tick INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'recruiting',
                max_participants INTEGER NOT NULL,
                created_at_tick INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS alliance_operation_participants (
                id TEXT PRIMARY KEY,
                operation_id TEXT NOT NULL REFERENCES alliance_operations(id) ON DELETE CASCADE,
                player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                ships TEXT NOT NULL DEFAULT '{}',
                joined_at_tick INTEGER NOT NULL,
                UNIQUE(operation_id, player_id)
            );

            CREATE TABLE IF NOT EXISTS trade_expeditions (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                fleet_id TEXT NOT NULL,
                origin_planet_id TEXT NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
                state TEXT NOT NULL DEFAULT 'inbound',
                departure_tick INTEGER NOT NULL,
                arrival_tick INTEGER NOT NULL,
                dock_start_tick INTEGER NULL,
                dock_duration_ticks INTEGER NOT NULL DEFAULT 3,
                return_departure_tick INTEGER NULL,
                return_arrival_tick INTEGER NULL,
                travel_ticks INTEGER NOT NULL DEFAULT 2,
                ships_json TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS allied_defense_fleets (
                id TEXT PRIMARY KEY,
                planet_id TEXT NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
                owner_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                fleet_id TEXT NOT NULL,
                arrival_tick INTEGER NOT NULL,
                state TEXT NOT NULL DEFAULT 'stationed'
            );
        `);

        // 9. Kereskedelmi Állomás, Kémkedési és Új Bolygó/Gyűrű oszlopok migrációja
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN is_trade_station INTEGER NOT NULL DEFAULT 0").run(); } catch(e){}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN scouted_by_player INTEGER NOT NULL DEFAULT 0").run(); } catch(e){}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN ring_index INTEGER NOT NULL DEFAULT 1").run(); } catch(e){}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN planet_type TEXT NOT NULL DEFAULT 'colony'").run(); } catch(e){}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN colony_size TEXT NULL DEFAULT 'small'").run(); } catch(e){}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN bonus_resource TEXT NULL").run(); } catch(e){}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN is_homeworld INTEGER NOT NULL DEFAULT 0").run(); } catch(e){}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN terraform_level INTEGER NOT NULL DEFAULT 0").run(); } catch(e){}
        try { this.db.prepare("ALTER TABLE planets ADD COLUMN artifact_tier TEXT NULL").run(); } catch(e){}

        // Kereskedelmi Konzorcium magvetése
        this.db.prepare(`
            INSERT OR IGNORE INTO players (id, username, color_hex, metal, energy, isotope, data_points, is_ai)
            VALUES ('neutral', 'Galaktikus Kereskedelmi Konzorcium', '#38bdf8', 0, 0, 0, 0, 1)
        `).run();

        // 3 Fő Boss Bolygó (Prekurzor Citadellák - Végjáték Titánok)
        const bossList = [
            { id: 'boss_1', name: 'CYGNUS BASTION // ŐSI ELŐŐRS', hull: 12000.0, max_hull: 12000.0, shield: 7000.0, max_shield: 7000.0, damage: 900.0, pos_x: 240.0, pos_y: 240.0, salvage_metal: 7500.0, salvage_isotope: 3000.0 },
            { id: 'boss_2', name: 'VOID CITADEL // ÜRESSÉG CITADELLÁJA', hull: 20000.0, max_hull: 20000.0, shield: 12000.0, max_shield: 12000.0, damage: 1450.0, pos_x: 760.0, pos_y: 240.0, salvage_metal: 14000.0, salvage_isotope: 6000.0 },
            { id: 'boss_3', name: 'OMEGA-ARK-0 // KRONOS-LEVIATÁN', hull: 32000.0, max_hull: 32000.0, shield: 18000.0, max_shield: 18000.0, damage: 2200.0, pos_x: 500.0, pos_y: 120.0, salvage_metal: 25000.0, salvage_isotope: 12000.0 }
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
            { id: 'm1', title: 'Bázisfejlesztés', description: 'Építs vagy fejlessz egy Felszíni bányatelepet Lv.2-re a főbolygódon!', reward_text: '+150 Fém, +50 E, ⛏️ +25% Bányászat (5 kör)', reward_metal: 150, reward_energy: 50, reward_isotope: 0, reward_data: 0, reward_buff_type: 'mining_boost', reward_buff_value: 0.25, reward_buff_duration: 5, reward_artifact_id: null, sort_order: 1 },
            { id: 'm2', title: 'Kozmikus Felderítés', description: 'Építs egy Felderítő Szondát és deríts fel egy titkos bolygót az 1. gyűrűn!', reward_text: '+40 Izotóp, +50 Adat, 🚀 +20% Flotta Sebesség (6 kör)', reward_metal: 0, reward_energy: 0, reward_isotope: 40, reward_data: 50, reward_buff_type: 'speed_boost', reward_buff_value: 0.20, reward_buff_duration: 6, reward_artifact_id: null, sort_order: 2 },
            { id: 'm3', title: 'Hadiflotta Alapítása', description: 'Bővítsd a haderőd legalább 8 Korvettre vagy 3 Rombolóra!', reward_text: '+200 Fém, +100 E, 🏺 KVANTUM CHRONO-MAG', reward_metal: 200, reward_energy: 100, reward_isotope: 0, reward_data: 0, reward_buff_type: null, reward_buff_value: 0, reward_buff_duration: 0, reward_artifact_id: 'artifact_chrono_core', sort_order: 3 },
            { id: 'm4', title: 'Kolónia-alapítás', description: 'Építs Kolóniahajót és kolonizálj egy felderített Kolónia bolygót!', reward_text: '+250 Fém, +150 E, 🛡️ +20% Pajzskapacitás (8 kör)', reward_metal: 250, reward_energy: 150, reward_isotope: 50, reward_data: 0, reward_buff_type: 'shield_overcharge', reward_buff_value: 0.20, reward_buff_duration: 8, reward_artifact_id: null, sort_order: 4 },
            { id: 'm5', title: 'Mélységi Expanzió & Dominancia', description: 'Birtokolj legalább 3 bolygót a szektorban (max. Főbolygó + 5 kolónia)!', reward_text: '+500 Fém, +300 Adat, 💎 SÖTÉT ANYAG REZONÁTOR', reward_metal: 500, reward_energy: 250, reward_isotope: 100, reward_data: 300, reward_buff_type: null, reward_buff_value: 0, reward_buff_duration: 0, reward_artifact_id: 'artifact_dark_resonator', sort_order: 5 },
            { id: 'm6', title: 'Birodalmi Hadúr & Dicsőség', description: 'Gyűjts össze legalább 100 Dicsőség Pontot!', reward_text: '+500 Fém, 🔮 PREKURZOR HOZZÁFÉRÉSI KÓDEX, ⚔️ +20% Sebzés (8 kör)', reward_metal: 500, reward_energy: 200, reward_isotope: 100, reward_data: 200, reward_buff_type: 'combat_dmg_buff', reward_buff_value: 0.20, reward_buff_duration: 8, reward_artifact_id: 'artifact_codex', sort_order: 6 },
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
            VALUES ('bot_hostile', 'Kozmikus Őrszemek (Bot)', '#f59e0b', 0, 0, 0, 0, 1)
        `).run();
        this.db.prepare(`
            INSERT OR IGNORE INTO players (id, username, color_hex, metal, energy, isotope, data_points, is_ai)
            VALUES ('precursor_boss', 'Prekurzor Ős-Kolosszusok', '#dc2626', 0, 0, 0, 0, 1)
        `).run();

        // Ellenőrizzük, hogy az új 4-bolygótípusos, 10-gyűrűs galaxis be van-e már töltve
        const hasNewGalaxy = this.db.prepare("SELECT COUNT(*) as c FROM planets WHERE planet_type IN ('dead_colony', 'technology')").get();
        if (hasNewGalaxy && hasNewGalaxy.c > 0) {
            return;
        }

        // Ha régi adatbázis van, tisztítsuk meg a régi bot bolygókat és építsük fel a 10 koncentrikus gyűrűt
        this.db.prepare("DELETE FROM fleet_ships WHERE fleet_id LIKE 'f_bot_%'").run();
        this.db.prepare("DELETE FROM fleets WHERE id LIKE 'f_bot_%'").run();
        this.db.prepare("DELETE FROM planets WHERE id LIKE 'bot_p%'").run();

        // Segédfüggvény polár koordinátákhoz a Galaxis Középpontja (500, 500) körül
        const ringPos = (ringIdx, angleDeg) => {
            const radius = ringIdx === 0 ? 55 : (75 + ringIdx * 65);
            const rad = (angleDeg * Math.PI) / 180.0;
            return {
                x: Math.round(GALAXY_CENTER.x + Math.cos(rad) * radius),
                y: Math.round(GALAXY_CENTER.y + Math.sin(rad) * radius)
            };
        };

        // Frissítsük a Főbolygókat (Ring 0) és a Kereskedelmi Központot (Ring 1)
        const p1Pos = ringPos(0, -135);
        this.db.prepare(`
            INSERT INTO planets (id, name, pos_x, pos_y, ring_index, planet_type, colony_size, bonus_resource, is_homeworld, size_slots, terraform_level, owner_id, base_metal_rate, base_energy_rate, planetary_shield_hp, max_shield_hp, railgun_count, status, is_bot, scouted_by_player)
            VALUES ('p1', 'KRONOS-IV (Főbolygó)', ?, ?, 0, 'colony', 'medium', NULL, 1, 10, 0, 'player', 40.0, 20.0, 500.0, 500.0, 0, 'normal', 0, 1)
            ON CONFLICT(id) DO UPDATE SET
                name='KRONOS-IV (Főbolygó)', pos_x=excluded.pos_x, pos_y=excluded.pos_y,
                ring_index=0, planet_type='colony', colony_size='medium', is_homeworld=1,
                size_slots=MAX(planets.size_slots, 10), scouted_by_player=1
        `).run(p1Pos.x, p1Pos.y);
        this.db.prepare("UPDATE fleets SET current_x = ?, current_y = ? WHERE origin_planet_id = 'p1' AND state = 'stationed'").run(p1Pos.x, p1Pos.y);

        const p4Pos = ringPos(0, 45);
        this.db.prepare(`
            INSERT INTO planets (id, name, pos_x, pos_y, ring_index, planet_type, colony_size, bonus_resource, is_homeworld, size_slots, terraform_level, owner_id, base_metal_rate, base_energy_rate, planetary_shield_hp, max_shield_hp, railgun_count, status, is_bot, scouted_by_player)
            VALUES ('p4', 'VEKTOR-9 (Főbolygó)', ?, ?, 0, 'colony', 'medium', NULL, 1, 10, 0, 'enemy', 40.0, 20.0, 400.0, 400.0, 1, 'normal', 0, 0)
            ON CONFLICT(id) DO UPDATE SET
                name='VEKTOR-9 (Főbolygó)', pos_x=excluded.pos_x, pos_y=excluded.pos_y,
                ring_index=0, planet_type='colony', colony_size='medium', is_homeworld=1,
                size_slots=MAX(planets.size_slots, 10)
        `).run(p4Pos.x, p4Pos.y);
        this.db.prepare("UPDATE fleets SET current_x = ?, current_y = ? WHERE origin_planet_id = 'p4' AND state = 'stationed'").run(p4Pos.x, p4Pos.y);

        // Kezdő épületek frissítése az új épülettípusokra (p1 és p4), ha még régiek vannak
        const existingP1Structs = this.db.prepare("SELECT * FROM planet_structures WHERE planet_id = 'p1'").all();
        const hasNewStructs = existingP1Structs.some(s => BUILDING_SPECS[s.structure_type]);
        if (!hasNewStructs) {
            this.db.prepare("DELETE FROM planet_structures WHERE planet_id IN ('p1', 'p4')").run();
            const insSt = this.db.prepare("INSERT INTO planet_structures (id, planet_id, slot_index, branch_type, structure_type, level) VALUES (?, ?, ?, ?, ?, ?)");
            insSt.run('s_p1_dock', 'p1', 0, 'dock', 'ship_dock', 1);
            insSt.run('s_p1_mine', 'p1', 1, 'metal', 'surface_mine', 2);
            insSt.run('s_p1_solar', 'p1', 2, 'energy', 'solar_farm', 1);
            insSt.run('s_p1_iso', 'p1', 3, 'isotope', 'isotope_filter', 1);
            insSt.run('s_p1_data', 'p1', 4, 'data', 'relay_station', 1);

            insSt.run('s_p4_dock', 'p4', 0, 'dock', 'ship_dock', 1);
            insSt.run('s_p4_mine', 'p4', 1, 'metal', 'surface_mine', 1);
            insSt.run('s_p4_solar', 'p4', 2, 'energy', 'solar_farm', 1);
        }

        const tradePos = ringPos(1, -45);
        this.db.prepare(`
            INSERT INTO planets (id, name, pos_x, pos_y, ring_index, planet_type, colony_size, size_slots, owner_id, base_metal_rate, base_energy_rate, planetary_shield_hp, max_shield_hp, railgun_count, status, is_bot, difficulty_tier, is_trade_station, scouted_by_player)
            VALUES ('station_trade', 'NEXUS KERESKEDELMI KÖZPONT', ?, ?, 1, 'trade_station', NULL, 4, 'neutral', 0, 0, 500, 500, 0, 'normal', 0, 1, 1, 1)
            ON CONFLICT(id) DO UPDATE SET pos_x=excluded.pos_x, pos_y=excluded.pos_y, ring_index=1, planet_type='trade_station', is_trade_station=1, scouted_by_player=1
        `).run(tradePos.x, tradePos.y);
        this.db.prepare("INSERT OR IGNORE INTO fleets (id, owner_id, name, current_x, current_y, state) VALUES ('fleet_station_trade', 'neutral', 'Kereskedelmi Állomás Helyőrség', ?, ?, 'stationed')").run(tradePos.x, tradePos.y);

        // ====================================================================
        // 10 KONCENTRIKUS KÖRGYŰRŰ BOLYGÓI (4 BOLYGÓTÍPUS ARÁNYOSAN ELOSZTVA)
        // - Közelebbi gyűrűk (1-3): Kicsi kolónia bolygók (+4 slot/fejl.) és Halott kolónia bolygók
        // - Középső gyűrűk (3-7): Közepes kolónia bolygók (+5 slot/fejl.), Technológia bolygók, Kicsi és Közepes Artifact bolygók
        // - Távoli gyűrűk (7-10): Nagy kolónia bolygók (+6 slot/fejl. + nyersanyag bónusz), Erős Technológia bolygók és Nagy Artifact bolygók
        // - Összesen pontosan 9 Artifact bolygó (3 kicsi, 3 közepes, 3 nagy)
        // - Minden bolygó alapból TITKOS (scouted_by_player = 0), amíg szondával fel nem fedik!
        // ====================================================================
        const ringPlanets = [
            // --- 1. GYŰRŰ (1 kör út: Kicsi kolóniák & Halott kolóniák) ---
            { id: 'p2', name: 'ZEPHYR-7', ring: 1, angle: -155, type: 'colony', size: 'small', bonus: null },
            { id: 'col_r1_2', name: 'AURELIA-I', ring: 1, angle: 120, type: 'colony', size: 'small', bonus: null },
            { id: 'dead_r1_1', name: 'HAMU-HOLD X1', ring: 1, angle: 25, type: 'dead_colony', size: 'small', bonus: null },
            { id: 'dead_r1_2', name: 'KRÁTER-SZIKLA V2', ring: 1, angle: -95, type: 'dead_colony', size: 'small', bonus: null },

            // --- 2. GYŰRŰ (2 kör út: Kicsi kolóniák & Halott kolóniák) ---
            { id: 'col_r2_1', name: 'BOREALIS-II', ring: 2, angle: -175, type: 'colony', size: 'small', bonus: null },
            { id: 'col_r2_2', name: 'HELIOS-PEREM', ring: 2, angle: -65, type: 'colony', size: 'small', bonus: null },
            { id: 'col_r2_3', name: 'KORALL-4', ring: 2, angle: 75, type: 'colony', size: 'small', bonus: null },
            { id: 'dead_r2_1', name: 'KIHALT KOLÓNIA B-4', ring: 2, angle: -15, type: 'dead_colony', size: 'small', bonus: null },
            { id: 'dead_r2_2', name: 'POR-VILÁG D-9', ring: 2, angle: 145, type: 'dead_colony', size: 'small', bonus: null },

            // --- 3. GYŰRŰ (3 kör út: Kicsi/Közepes kolónia, Halott kolónia, Tech #1, Kicsi Arti #1) ---
            { id: 'col_r3_1', name: 'VULCAN-MINOR', ring: 3, angle: -130, type: 'colony', size: 'small', bonus: null },
            { id: 'col_r3_2', name: 'SYLVANA-3', ring: 3, angle: 15, type: 'colony', size: 'small', bonus: null },
            { id: 'p3', name: 'NEXUS-ALPHA', ring: 3, angle: 105, type: 'colony', size: 'medium', bonus: null },
            { id: 'dead_r3_1', name: 'ÜSZKÖS VILÁG R-3', ring: 3, angle: -40, type: 'dead_colony', size: 'small', bonus: null },
            {
                id: 'tech_r3_1', name: 'TACHION KUTATÓBÁZIS', ring: 3, angle: 165, type: 'technology', tier: 1,
                shield: 240, railguns: 1, ships: { interceptor: 6, corvette: 5 },
                loot_data: { buff_type: 'speed_boost', buff_value: 0.25, buff_duration: 8, buff_name: 'Tachion Hajtómű Túltöltés (+25% Sebesség)', buff_icon: '🚀' }
            },
            {
                id: 'art_s1', name: 'KRIPTA-HOLD ALFA', ring: 3, angle: -85, type: 'artifact', artifact_tier: 'small', tier: 1,
                shield: 360, railguns: 1, ships: { interceptor: 8, corvette: 6, frigate: 2 },
                loot_data: { artifact_id: 'artifact_chrono_core', artifact_tier: 'small', name: 'Kicsi Ereklye: Kvantum Chrono-Mag (1/3)' }
            },

            // --- 4. GYŰRŰ (4 kör út: Közepes kolóniák, Tech #2, Kicsi Arti #2 és #3, Halott kolónia) ---
            { id: 'col_r4_1', name: 'ORION-KERT', ring: 4, angle: -150, type: 'colony', size: 'medium', bonus: null },
            { id: 'col_r4_2', name: 'VEGA-PRIME', ring: 4, angle: 50, type: 'colony', size: 'medium', bonus: null },
            { id: 'dead_r4_1', name: 'FAGYOTT SZEKTOR F-4', ring: 4, angle: -20, type: 'dead_colony', size: 'medium', bonus: null },
            {
                id: 'tech_r4_1', name: 'PAJZS-GENERÁTOR LABOR', ring: 4, angle: 130, type: 'technology', tier: 1,
                shield: 300, railguns: 1, ships: { corvette: 7, frigate: 3 },
                loot_data: { buff_type: 'shield_overcharge', buff_value: 0.25, buff_duration: 8, buff_name: 'Fázispajzs Túlterhelés (+25% Pajzs)', buff_icon: '🛡️' }
            },
            {
                id: 'art_s2', name: 'IDŐ-SZENTÉLY BÉTA', ring: 4, angle: -70, type: 'artifact', artifact_tier: 'small', tier: 1,
                shield: 400, railguns: 2, ships: { interceptor: 9, corvette: 6, frigate: 3 },
                loot_data: { artifact_id: 'artifact_chrono_core', artifact_tier: 'small', name: 'Kicsi Ereklye: Kvantum Chrono-Mag (2/3)' }
            },
            {
                id: 'art_s3', name: 'CHRONO-OBELISZK GAMMA', ring: 4, angle: -195, type: 'artifact', artifact_tier: 'small', tier: 1,
                shield: 420, railguns: 2, ships: { corvette: 8, frigate: 4, destroyer: 2 },
                loot_data: { artifact_id: 'artifact_chrono_core', artifact_tier: 'small', name: 'Kicsi Ereklye: Kvantum Chrono-Mag (3/3)' }
            },

            // --- 5. GYŰRŰ (5 kör út: Közepes kolóniák, Tech #3 és #4, Közepes Arti #1, Halott kolónia) ---
            { id: 'col_r5_1', name: 'LYRA-KÖZÉP', ring: 5, angle: -115, type: 'colony', size: 'medium', bonus: null },
            { id: 'col_r5_2', name: 'ALTAIR-VI', ring: 5, angle: 20, type: 'colony', size: 'medium', bonus: null },
            { id: 'dead_r5_1', name: 'HALOTT HOLD M-5', ring: 5, angle: 85, type: 'dead_colony', size: 'medium', bonus: null },
            {
                id: 'tech_r5_1', name: 'TITÁN-ÖTVÖZET MŰHELY', ring: 5, angle: -45, type: 'technology', tier: 2,
                shield: 480, railguns: 2, ships: { corvette: 9, destroyer: 3 },
                loot_data: { buff_type: 'combat_hull_buff', buff_value: 0.25, buff_duration: 9, buff_name: 'Megerősített Titánburkolat (+25% Hajótest HP)', buff_icon: '🧱' }
            },
            {
                id: 'tech_r5_2', name: 'MÉLYŰRI BÁNYÁSZATI KÖZPONT', ring: 5, angle: 150, type: 'technology', tier: 2,
                shield: 500, railguns: 2, ships: { frigate: 5, destroyer: 3 },
                loot_data: { buff_type: 'mining_boost', buff_value: 0.30, buff_duration: 9, buff_name: 'Ipari Termelés-Túltöltés (+30% Termelés)', buff_icon: '⛏️' }
            },
            {
                id: 'art_m1', name: 'SÖTÉT REZONÁTOR ALFA', ring: 5, angle: -170, type: 'artifact', artifact_tier: 'medium', tier: 2,
                shield: 650, railguns: 2, ships: { frigate: 6, destroyer: 5, cruiser: 2 },
                loot_data: { artifact_id: 'artifact_dark_resonator', artifact_tier: 'medium', name: 'Közepes Ereklye: Sötét Anyag Rezonátor (1/3)' }
            },

            // --- 6. GYŰRŰ (6 kör út: Közepes kolóniák, Tech #5, Közepes Arti #2, Halott kolónia) ---
            { id: 'col_r6_1', name: 'DRACO-VÖLGY', ring: 6, angle: -140, type: 'colony', size: 'medium', bonus: null },
            { id: 'col_r6_2', name: 'SIRIUS-DELTA', ring: 6, angle: 60, type: 'colony', size: 'medium', bonus: null },
            { id: 'dead_r6_1', name: 'KIÉGETT KOLÓNIA K-6', ring: 6, angle: -10, type: 'dead_colony', size: 'medium', bonus: null },
            {
                id: 'tech_r6_1', name: 'PLAZMA-KALIBRÁLÓ ERŐD', ring: 6, angle: 120, type: 'technology', tier: 2,
                shield: 580, railguns: 2, ships: { frigate: 5, destroyer: 4, repair_ship: 2 },
                loot_data: { buff_type: 'combat_dmg_buff', buff_value: 0.25, buff_duration: 10, buff_name: 'Plazma Tűzerő Kalibráció (+25% Sebzés)', buff_icon: '💥' }
            },
            {
                id: 'art_m2', name: 'SÖTÉT REZONÁTOR BÉTA', ring: 6, angle: -75, type: 'artifact', artifact_tier: 'medium', tier: 2,
                shield: 720, railguns: 3, ships: { frigate: 7, destroyer: 5, cruiser: 3 },
                loot_data: { artifact_id: 'artifact_dark_resonator', artifact_tier: 'medium', name: 'Közepes Ereklye: Sötét Anyag Rezonátor (2/3)' }
            },

            // --- 7. GYŰRŰ (7 kör út: Nagy kolónia [Fém], Közepes kolónia, Tech #6, Közepes Arti #3, Halott kolónia) ---
            { id: 'col_r7_1', name: 'TITÁN-ÓRIÁS I', ring: 7, angle: -160, type: 'colony', size: 'large', bonus: 'metal' },
            { id: 'col_r7_2', name: 'CENTAURI-8', ring: 7, angle: 35, type: 'colony', size: 'medium', bonus: null },
            { id: 'dead_r7_1', name: 'CSENDES SZEKTOR S-7', ring: 7, angle: -35, type: 'dead_colony', size: 'large', bonus: 'energy' },
            {
                id: 'tech_r7_1', name: 'KVANTUM PAJZS-AKADÉMIA', ring: 7, angle: 100, type: 'technology', tier: 2,
                shield: 750, railguns: 3, ships: { destroyer: 6, repair_ship: 3, cruiser: 2 },
                loot_data: { buff_type: 'shield_overcharge', buff_value: 0.35, buff_duration: 10, buff_name: 'Kvantum Pajzspajzs-Mátrix (+35% Pajzs)', buff_icon: '🌐' }
            },
            {
                id: 'art_m3', name: 'SÖTÉT REZONÁTOR GAMMA', ring: 7, angle: 165, type: 'artifact', artifact_tier: 'medium', tier: 2,
                shield: 800, railguns: 3, ships: { frigate: 8, destroyer: 6, cruiser: 3 },
                loot_data: { artifact_id: 'artifact_dark_resonator', artifact_tier: 'medium', name: 'Közepes Ereklye: Sötét Anyag Rezonátor (3/3)' }
            },

            // --- 8. GYŰRŰ (8 kör út: Nagy kolóniák [Energia, Fém], Tech #7, Nagy Arti #1, Halott kolónia) ---
            { id: 'col_r8_1', name: 'SOLARIS-GIGÁSZ', ring: 8, angle: -125, type: 'colony', size: 'large', bonus: 'energy' },
            { id: 'col_r8_2', name: 'HYPERION-PRIME', ring: 8, angle: 15, type: 'colony', size: 'large', bonus: 'metal' },
            { id: 'dead_r8_1', name: 'RONCS-VILÁG Z-8', ring: 8, angle: 75, type: 'dead_colony', size: 'large', bonus: 'isotope' },
            {
                id: 'tech_r8_1', name: 'NEHÉZPÁNCÉL KÍSÉRLETI TELEP', ring: 8, angle: -55, type: 'technology', tier: 3,
                shield: 950, railguns: 3, ships: { destroyer: 6, repair_ship: 4, cruiser: 3 },
                loot_data: { buff_type: 'combat_hull_buff', buff_value: 0.35, buff_duration: 12, buff_name: 'Dreadnought Nano-Páncélzat (+35% Hajótest HP)', buff_icon: '🛡️' }
            },
            {
                id: 'art_l1', name: 'PREKURZOR KÓDEX-TEMPLOM I', ring: 8, angle: 140, type: 'artifact', artifact_tier: 'large', tier: 3,
                shield: 1150, railguns: 4, ships: { frigate: 8, repair_ship: 4, cruiser: 4, battleship: 2 },
                loot_data: { artifact_id: 'artifact_codex', artifact_tier: 'large', name: 'Nagy Ereklye: Prekurzor Hozzáférési Kódex (1/3)' }
            },

            // --- 9. GYŰRŰ (9 kör út: Nagy kolóniák [Izotóp, Adat], Tech #8, Nagy Arti #2) ---
            { id: 'col_r9_1', name: 'NEBULA-ÓRIÁS', ring: 9, angle: -145, type: 'colony', size: 'large', bonus: 'isotope' },
            { id: 'col_r9_2', name: 'CASSIOPEIA-MAG', ring: 9, angle: 45, type: 'colony', size: 'large', bonus: 'data' },
            {
                id: 'tech_r9_1', name: 'ANTIANYAG TERMELÉSI NEXUS', ring: 9, angle: -25, type: 'technology', tier: 3,
                shield: 1050, railguns: 3, ships: { destroyer: 7, cruiser: 4, battleship: 2 },
                loot_data: { buff_type: 'mining_boost', buff_value: 0.45, buff_duration: 12, buff_name: 'Antianyag Kitermelő Rezonancia (+45% Termelés)', buff_icon: '⚡' }
            },
            {
                id: 'art_l2', name: 'PREKURZOR KÓDEX-TEMPLOM II', ring: 9, angle: 115, type: 'artifact', artifact_tier: 'large', tier: 3,
                shield: 1280, railguns: 4, ships: { destroyer: 8, repair_ship: 5, cruiser: 5, battleship: 3 },
                loot_data: { artifact_id: 'artifact_codex', artifact_tier: 'large', name: 'Nagy Ereklye: Prekurzor Hozzáférési Kódex (2/3)' }
            },

            // --- 10. GYŰRŰ (10 kör út: Nagy kolóniák [Izotóp, Adat], Tech #9, Nagy Arti #3) ---
            { id: 'col_r10_1', name: 'APEX-LEVIATÁN VILÁG', ring: 10, angle: -110, type: 'colony', size: 'large', bonus: 'isotope' },
            { id: 'col_r10_2', name: 'OMICRON-SZUPERVILÁG', ring: 10, angle: 10, type: 'colony', size: 'large', bonus: 'data' },
            {
                id: 'tech_r10_1', name: 'OMEGA FEGYVERKÍSÉRLETI BÁZIS', ring: 10, angle: -175, type: 'technology', tier: 3,
                shield: 1200, railguns: 4, ships: { repair_ship: 5, cruiser: 5, battleship: 3 },
                loot_data: { buff_type: 'combat_dmg_buff', buff_value: 0.40, buff_duration: 12, buff_name: 'Omega Szingularitás Tűzerő (+40% Sebzés)', buff_icon: '🔥' }
            },
            {
                id: 'art_l3', name: 'PREKURZOR KÓDEX-TEMPLOM III', ring: 10, angle: 85, type: 'artifact', artifact_tier: 'large', tier: 3,
                shield: 1450, railguns: 4, ships: { frigate: 10, repair_ship: 6, cruiser: 6, battleship: 4 },
                loot_data: { artifact_id: 'artifact_codex', artifact_tier: 'large', name: 'Nagy Ereklye: Prekurzor Hozzáférési Kódex (3/3)' }
            }
        ];

        const insPlanet = this.db.prepare(`
            INSERT INTO planets (
                id, name, pos_x, pos_y, ring_index, planet_type, colony_size, bonus_resource, is_homeworld,
                size_slots, terraform_level, owner_id, base_metal_rate, base_energy_rate,
                planetary_shield_hp, max_shield_hp, railgun_count, is_bot, bot_type, artifact_tier,
                loot_type, loot_data, loot_revealed, difficulty_tier, status, scouted_by_player
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 10, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'normal', 0)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name, pos_x=excluded.pos_x, pos_y=excluded.pos_y,
                ring_index=excluded.ring_index, planet_type=excluded.planet_type,
                colony_size=excluded.colony_size, bonus_resource=excluded.bonus_resource,
                is_bot=excluded.is_bot, bot_type=excluded.bot_type, artifact_tier=excluded.artifact_tier,
                loot_type=excluded.loot_type, loot_data=excluded.loot_data, difficulty_tier=excluded.difficulty_tier
        `);

        for (const rp of ringPlanets) {
            const pos = ringPos(rp.ring, rp.angle);
            const isBot = (rp.type === 'artifact' || rp.type === 'technology') ? 1 : 0;
            const ownerId = isBot ? 'bot_hostile' : null;
            const botType = isBot ? rp.type : null;
            const lootType = rp.type === 'artifact' ? 'artifact' : (rp.type === 'technology' ? 'tech_buff' : null);
            const lootData = rp.loot_data ? JSON.stringify(rp.loot_data) : null;
            const baseMetal = rp.type === 'colony' ? (rp.size === 'large' ? 45 : (rp.size === 'medium' ? 35 : 25)) : 0;
            const baseEnergy = rp.type === 'colony' ? (rp.size === 'large' ? 20 : (rp.size === 'medium' ? 15 : 10)) : 0;
            const shield = rp.shield || 0;
            const railguns = rp.railguns || 0;
            const tier = rp.tier || Math.max(1, Math.ceil(rp.ring / 3.5));

            insPlanet.run(
                rp.id, rp.name, pos.x, pos.y, rp.ring, rp.type, rp.size || null, rp.bonus || null,
                ownerId, baseMetal, baseEnergy, shield, shield, railguns,
                isBot, botType, rp.artifact_tier || null, lootType, lootData, tier
            );

            // Állomásozó flotta létrehozása
            const existingFleet = this.db.prepare("SELECT id FROM fleets WHERE id = ?").get(`f_${rp.id}`);
            if (!existingFleet) {
                this.createFleet(`f_${rp.id}`, ownerId || 'neutral', `${rp.name} Helyőrség`, pos.x, pos.y, rp.id, rp.ships || {});
            }
        }

        // 3 Fő Boss Citadella (Végjáték Prekurzor Bástyák)
        const bossPlanets = [
            {
                id: 'boss_1', name: 'CYGNUS BASTION // ŐSI ELŐŐRS',
                pos_x: 240, pos_y: 240, ring: 4, size_slots: 6,
                is_bot: 1, bot_type: 'boss', difficulty_tier: 3,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 7500, energy: 3750, isotope: 2000, data: 2000, glory: 400 }),
                planetary_shield_hp: 7000.0, max_shield_hp: 7000.0, railgun_count: 5,
                ships: { frigate: 16, destroyer: 12, repair_ship: 8, cruiser: 4 }
            },
            {
                id: 'boss_2', name: 'VOID CITADEL // ÜRESSÉG CITADELLÁJA',
                pos_x: 760, pos_y: 240, ring: 7, size_slots: 6,
                is_bot: 1, bot_type: 'boss', difficulty_tier: 4,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 14000, energy: 6500, isotope: 4000, data: 4000, glory: 800 }),
                planetary_shield_hp: 12000.0, max_shield_hp: 12000.0, railgun_count: 8,
                ships: { destroyer: 16, repair_ship: 12, cruiser: 12, battleship: 6 }
            },
            {
                id: 'boss_3', name: 'OMEGA-ARK-0 // KRONOS-LEVIATÁN',
                pos_x: 500, pos_y: 120, ring: 10, size_slots: 6,
                is_bot: 1, bot_type: 'boss', difficulty_tier: 5,
                loot_type: 'resources', loot_data: JSON.stringify({ metal: 28000, energy: 14000, isotope: 8000, data: 8000, glory: 1600 }),
                planetary_shield_hp: 26000.0, max_shield_hp: 26000.0, railgun_count: 16,
                ships: { repair_ship: 24, cruiser: 18, battleship: 12 }
            }
        ];

        for (const bp of bossPlanets) {
            const exists = this.db.prepare('SELECT id FROM planets WHERE id = ?').get(bp.id);
            if (!exists) {
                this.db.prepare(`
                    INSERT INTO planets (id, name, pos_x, pos_y, ring_index, planet_type, size_slots, owner_id, base_metal_rate, base_energy_rate, planetary_shield_hp, max_shield_hp, railgun_count, is_bot, bot_type, loot_type, loot_data, loot_revealed, difficulty_tier, status, scouted_by_player)
                    VALUES (?, ?, ?, ?, ?, 'boss', ?, 'precursor_boss', 0, 0, ?, ?, ?, 1, 'boss', ?, ?, 0, ?, 'normal', 1)
                `).run(bp.id, bp.name, bp.pos_x, bp.pos_y, bp.ring, bp.size_slots, bp.planetary_shield_hp, bp.max_shield_hp, bp.railgun_count, bp.loot_type, bp.loot_data, bp.difficulty_tier);
                this.createFleet(`f_${bp.id}`, 'precursor_boss', `${bp.name} Védelmi Erő`, bp.pos_x, bp.pos_y, bp.id, bp.ships);
            } else {
                this.db.prepare("UPDATE planets SET planet_type = 'boss', ring_index = ?, is_bot = 1, bot_type = 'boss' WHERE id = ?").run(bp.ring, bp.id);
            }
        }
    }

    claimBotLoot(planetId, playerId) {
        const planet = this.db.prepare('SELECT * FROM planets WHERE id = ?').get(planetId);
        if (!planet || (!planet.is_bot && planet.planet_type !== 'artifact' && planet.planet_type !== 'technology')) return null;
        let lootData = {};
        try { lootData = JSON.parse(planet.loot_data || '{}'); } catch(e) {}

        const player = this.getPlayer(playerId);
        let rewardSummary = '';
        let grantedBuff = null;
        let grantedArtifact = null;

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
        } else if (planet.loot_type === 'artifact' || planet.planet_type === 'artifact') {
            const artId = lootData.artifact_id || (planet.artifact_tier === 'large' ? 'artifact_codex' : (planet.artifact_tier === 'medium' ? 'artifact_dark_resonator' : 'artifact_chrono_core'));
            const artName = lootData.name || 'Ősi Prekurzor Ereklye';
            const artIcon = planet.artifact_tier === 'large' ? '🔮' : (planet.artifact_tier === 'medium' ? '💎' : '🏺');
            grantedArtifact = this.addPlayerArtifact(playerId, artId, artName, artIcon);
            if (player) {
                const bonusMetal = planet.artifact_tier === 'large' ? 2500 : (planet.artifact_tier === 'medium' ? 1500 : 800);
                const bonusIso = planet.artifact_tier === 'large' ? 600 : (planet.artifact_tier === 'medium' ? 350 : 180);
                this.updatePlayerResources(playerId, player.metal + bonusMetal, player.energy, player.isotope + bonusIso, player.data_points);
                this.addGloryPoints(playerId, planet.artifact_tier === 'large' ? 60 : (planet.artifact_tier === 'medium' ? 40 : 25));
                rewardSummary = `${artIcon} ${artName} (+${bonusMetal} Fém, +${bonusIso} Iso)`;
            } else {
                rewardSummary = `${artIcon} ${artName}`;
            }
        } else if (planet.loot_type === 'tech_buff' || planet.planet_type === 'technology') {
            const bType = lootData.buff_type || 'shield_overcharge';
            const bVal = lootData.buff_value || 0.25;
            const bDur = lootData.buff_duration || 8;
            const bName = lootData.buff_name || 'Technológiai Bolygó Bónusz';
            const bIcon = lootData.buff_icon || '⚡';
            grantedBuff = this.addPlayerBuff(playerId, bType, bVal, bDur, bName, bIcon);
            if (player) {
                this.updatePlayerResources(playerId, player.metal + 600, player.energy + 300, player.isotope + 120, player.data_points + 250);
                this.addGloryPoints(playerId, 30);
            }
            rewardSummary = `${bIcon} ${bName} (${bDur} körig aktív!) + 250 Adat`;
        } else if (planet.loot_type === 'glory') {
            const glory = lootData.glory || 20;
            this.addGloryPoints(playerId, glory);
            rewardSummary = `🏆 +${glory} Dicsőség Pont`;
        }

        this.db.prepare(`
            UPDATE planets 
            SET loot_revealed = 1, status = 'looted', defeated_by_player_id = ?, scouted_by_player = 1
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
            grantedBuff,
            grantedArtifact,
            rewardSummary
        };
    }

    addGloryPoints(playerId, amount) {
        this.db.prepare('UPDATE players SET glory_points = glory_points + ? WHERE id = ?').run(amount, playerId);
        return this.getPlayer(playerId);
    }

    getHumanPlayers(excludePlayerId = null) {
        const query = excludePlayerId 
            ? "SELECT id, username, color_hex, metal, energy, isotope, data_points, glory_points, is_ai, created_at FROM players WHERE id NOT IN ('bot_hostile', 'precursor_boss', 'neutral', ?)"
            : "SELECT id, username, color_hex, metal, energy, isotope, data_points, glory_points, is_ai, created_at FROM players WHERE id NOT IN ('bot_hostile', 'precursor_boss', 'neutral')";
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

        // 2. Kezdő bolygók (seedBotPlanets kiegészíti a teljes 10 gyűrűvel)
        const insertPlanet = this.db.prepare(`
            INSERT INTO planets (id, name, pos_x, pos_y, ring_index, planet_type, colony_size, is_homeworld, size_slots, terraform_level, owner_id, base_metal_rate, base_energy_rate, planetary_shield_hp, max_shield_hp, railgun_count, scouted_by_player)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertPlanet.run('p1', 'KRONOS-IV (Főbolygó)', 461, 461, 0, 'colony', 'medium', 1, 10, 'player', 40.0, 20.0, 500.0, 500.0, 0, 1);
        insertPlanet.run('p2', 'ZEPHYR-7', 375, 442, 1, 'colony', 'small', 0, 10, null, 25.0, 10.0, 0.0, 0.0, 0, 0);
        insertPlanet.run('p3', 'NEXUS-ALPHA', 430, 761, 3, 'colony', 'medium', 0, 10, null, 35.0, 15.0, 0.0, 0.0, 0, 0);
        insertPlanet.run('p4', 'VEKTOR-9 (Főbolygó)', 539, 539, 0, 'colony', 'medium', 1, 10, 'enemy', 40.0, 20.0, 400.0, 400.0, 1, 0);

        // 3. Kezdő építmények az új 6-kategóriás rendszerben (6/10 slot foglalt, 4 szabad slot!)
        const insertStruct = this.db.prepare(`
            INSERT INTO planet_structures (id, planet_id, slot_index, branch_type, structure_type, level)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        insertStruct.run('s_p1_dock', 'p1', 0, 'dock', 'ship_dock', 1);
        insertStruct.run('s_p1_mine', 'p1', 1, 'metal', 'surface_mine', 2);
        insertStruct.run('s_p1_solar', 'p1', 2, 'energy', 'solar_farm', 1);
        insertStruct.run('s_p1_iso', 'p1', 3, 'isotope', 'isotope_filter', 1);
        insertStruct.run('s_p1_data', 'p1', 4, 'data', 'relay_station', 1);

        insertStruct.run('s_p4_dock', 'p4', 0, 'dock', 'ship_dock', 1);
        insertStruct.run('s_p4_mine', 'p4', 1, 'metal', 'surface_mine', 1);
        insertStruct.run('s_p4_solar', 'p4', 2, 'energy', 'solar_farm', 1);

        // 4. Kezdő állomásozó flották
        this.createFleet('f_p1', 'player', 'Kronos Védelmi Flotta', 461, 461, 'p1', { scout: 1, corvette: 12, destroyer: 3, battleship: 0 });
        this.createFleet('f_p4', 'enemy', 'Vektor-9 Főflotta', 539, 539, 'p4', { corvette: 8, destroyer: 4, battleship: 1 });
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
            frigate: 280, destroyer: 450, repair_ship: 950, cruiser: 800, battleship: 1600
        };
        const baseShields = {
            scout: 0, interceptor: 25, corvette: 40, freighter: 60, colony_ship: 50,
            frigate: 120, destroyer: 200, repair_ship: 70, cruiser: 400, battleship: 800
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

    calculateRingTravelTicks(originPlanet, targetPlanet) {
        if (!originPlanet || !targetPlanet) return 1;
        const r1 = Number.isInteger(originPlanet.ring_index) ? originPlanet.ring_index : 0;
        const r2 = Number.isInteger(targetPlanet.ring_index) ? targetPlanet.ring_index : 1;
        // Ha a főbolygóról (ring 0) indulunk, az 1. gyűrű = 1 kör, 2. gyűrű = 2 kör, ..., 10. gyűrű = 10 kör.
        // Két gyűrű között a gyűrű-különbség (azonos gyűrűn belül minimum 1 kör).
        return Math.max(1, Math.abs(r2 - r1));
    }

    getPlayerColonyCount(playerId = 'player') {
        const owned = this.db.prepare("SELECT id, is_homeworld, planet_type FROM planets WHERE owner_id = ? AND planet_type = 'colony'").all(playerId);
        const homeworlds = owned.filter(p => p.is_homeworld === 1).length;
        const colonies = owned.filter(p => !p.is_homeworld || p.is_homeworld === 0).length;
        return {
            homeworldCount: homeworlds,
            colonyCount: colonies,
            totalPlanets: owned.length,
            maxColonies: MAX_COLONIES_PER_PLAYER,
            canColonizeMore: colonies < MAX_COLONIES_PER_PLAYER
        };
    }

    checkAndUnlockDeadColonies(forceUnlockOne = false) {
        const humanAndAiPlayers = this.db.prepare("SELECT COUNT(*) as c FROM players WHERE id NOT IN ('bot_hostile', 'precursor_boss', 'neutral')").get();
        const playerCount = humanAndAiPlayers ? humanAndAiPlayers.c : 2;
        const freeColonies = this.db.prepare("SELECT COUNT(*) as c FROM planets WHERE planet_type = 'colony' AND (owner_id IS NULL OR owner_id = 'neutral')").get();
        const freeCount = freeColonies ? freeColonies.c : 0;

        // Ha a szabad kolónia bolygók száma lecsökken (pl. kevesebb mint 3, vagy játékosszám * 2 alatt), feloldunk halott kolóniákat
        if (forceUnlockOne || freeCount <= Math.max(2, playerCount)) {
            const deadPlanets = this.db.prepare("SELECT * FROM planets WHERE planet_type = 'dead_colony' ORDER BY ring_index ASC LIMIT ?").all(forceUnlockOne ? 1 : 2);
            const unlocked = [];
            for (const dp of deadPlanets) {
                const newSize = dp.ring_index >= 7 ? 'large' : (dp.ring_index >= 4 ? 'medium' : 'small');
                const newBonus = newSize === 'large' ? (dp.bonus_resource || ['metal', 'energy', 'isotope', 'data'][dp.ring_index % 4]) : null;
                const baseM = newSize === 'large' ? 45 : (newSize === 'medium' ? 35 : 25);
                const baseE = newSize === 'large' ? 20 : (newSize === 'medium' ? 15 : 10);
                const cleanName = dp.name.replace(/HAMU-HOLD|KRÁTER-SZIKLA|KIHALT KOLÓNIA|POR-VILÁG|ÜSZKÖS VILÁG|FAGYOTT SZEKTOR|HALOTT HOLD|KIÉGETT KOLÓNIA|CSENDES SZEKTOR|RONCS-VILÁG/i, 'ÚJJÁSZÜLETETT KOLÓNIA');

                this.db.prepare(`
                    UPDATE planets
                    SET planet_type = 'colony',
                        colony_size = ?,
                        bonus_resource = ?,
                        size_slots = 10,
                        terraform_level = 0,
                        base_metal_rate = ?,
                        base_energy_rate = ?,
                        name = ?,
                        status = 'normal'
                    WHERE id = ?
                `).run(newSize, newBonus, baseM, baseE, cleanName, dp.id);
                unlocked.push({ id: dp.id, name: cleanName, colony_size: newSize, ring_index: dp.ring_index });
            }
            return unlocked;
        }
        return [];
    }

    unlockDeadColonyById(planetId) {
        const dp = this.db.prepare("SELECT * FROM planets WHERE id = ?").get(planetId);
        if (!dp) return { error: "A bolygó nem található!" };
        if (dp.planet_type !== 'dead_colony') return { error: "Ez a bolygó nem Halott Kolónia Bolygó!" };

        const newSize = dp.ring_index >= 7 ? 'large' : (dp.ring_index >= 4 ? 'medium' : 'small');
        const newBonus = newSize === 'large' ? (dp.bonus_resource || ['metal', 'energy', 'isotope', 'data'][dp.ring_index % 4]) : null;
        const baseM = newSize === 'large' ? 45 : (newSize === 'medium' ? 35 : 25);
        const baseE = newSize === 'large' ? 20 : (newSize === 'medium' ? 15 : 10);
        const cleanName = dp.name + ' (Terra-Feloldva)';

        this.db.prepare(`
            UPDATE planets
            SET planet_type = 'colony',
                colony_size = ?,
                bonus_resource = ?,
                size_slots = 10,
                terraform_level = 0,
                base_metal_rate = ?,
                base_energy_rate = ?,
                name = ?,
                status = 'normal',
                scouted_by_player = 1
            WHERE id = ?
        `).run(newSize, newBonus, baseM, baseE, cleanName, dp.id);

        return {
            success: true,
            planetId: dp.id,
            name: cleanName,
            colony_size: newSize,
            bonus_resource: newBonus,
            message: `${cleanName} sikeresen feloldva mint ${newSize === 'large' ? 'Nagy' : (newSize === 'medium' ? 'Közepes' : 'Kicsi')} Kolónia Bolygó (10 alap slot)!`
        };
    }

    getAllPlanets() {
        const planets = this.db.prepare('SELECT * FROM planets ORDER BY ring_index ASC, id ASC').all();
        for (const p of planets) {
            const rawStructures = this.db.prepare('SELECT * FROM planet_structures WHERE planet_id = ? ORDER BY slot_index ASC').all(p.id);
            
            // Normalizáljuk az épületeket és kiszámítjuk a slot-foglalást
            let terraformLevel = p.terraform_level || 0;
            let usedSlots = 0;
            let hasShipDock = p.is_homeworld === 1;
            let shipDockLevel = p.is_homeworld === 1 ? 1 : 0;

            p.structures = rawStructures.map(s => {
                const mappedType = BUILDING_SPECS[s.structure_type] ? s.structure_type : (LEGACY_BUILDING_MAP[s.structure_type] || 'surface_mine');
                const spec = BUILDING_SPECS[mappedType] || BUILDING_SPECS.surface_mine;
                const lvl = Math.max(1, s.level || 1);

                let slotsOccupied = 0;
                if (mappedType === 'terraformer') {
                    terraformLevel = Math.max(terraformLevel, lvl);
                    slotsOccupied = 0; // A Terraformáló Állomás slotokat AD a bolygóhoz
                } else if (spec.tier === 2) {
                    // Nagyobb épület: alapból 2 slotot foglal, és minden fejlesztés (+szint) még 1 slotot foglal
                    slotsOccupied = 2 + (lvl - 1);
                    usedSlots += slotsOccupied;
                } else {
                    // Kisebb épület és Hajódokk: alapból 1 slotot foglal, és minden fejlesztés (+szint) 1 slotot foglal
                    slotsOccupied = lvl;
                    usedSlots += slotsOccupied;
                }

                if (mappedType === 'ship_dock') {
                    hasShipDock = true;
                    shipDockLevel = Math.max(shipDockLevel, lvl);
                }

                return {
                    ...s,
                    structure_type: mappedType,
                    name: spec.name,
                    icon: spec.icon,
                    category: spec.category,
                    tier: spec.tier,
                    resource: spec.resource || null,
                    level: lvl,
                    maxLevel: spec.maxLevel,
                    slotsOccupied
                };
            });

            const colSize = p.colony_size || 'small';
            const slotStep = colSize === 'large' ? 6 : (colSize === 'medium' ? 5 : 4);
            let maxSlots = p.planet_type === 'colony' ? (10 + terraformLevel * slotStep) : (p.size_slots || 0);

            if (p.owner_id && p.planet_type === 'colony') {
                const ownerTechs = this.getPlayerResearch(p.owner_id);
                if (ownerTechs.includes('nano_assembly')) {
                    maxSlots += 1;
                }
            }

            p.ring_index = Number.isInteger(p.ring_index) ? p.ring_index : 1;
            p.planet_type = p.planet_type || 'colony';
            p.colony_size = colSize;
            p.slot_step = slotStep;
            p.terraform_level = terraformLevel;
            p.max_slots = maxSlots;
            p.size_slots = maxSlots;
            p.used_slots = usedSlots;
            p.free_slots = Math.max(0, maxSlots - usedSlots);
            p.has_ship_dock = hasShipDock;
            p.ship_dock_level = shipDockLevel;

            // Termelési értékek kiszámítása a bolygón lévő épületekből + nagy bolygó bónuszból
            let prodMetal = p.planet_type === 'colony' ? (p.base_metal_rate || 0) : 0;
            let prodEnergy = p.planet_type === 'colony' ? (p.base_energy_rate || 0) : 0;
            let prodIsotope = p.is_homeworld ? 3 : 0;
            let prodData = p.is_homeworld ? 10 : 0;

            for (const s of p.structures) {
                const spec = BUILDING_SPECS[s.structure_type];
                if (!spec || !spec.baseProduction) continue;
                let amount = spec.baseProduction * s.level;
                // Nagy bolygó nyersanyag bónusz (+25% termelés a bónuszos nyersanyagra)
                if (p.colony_size === 'large' && p.bonus_resource === spec.resource) {
                    amount = Math.round(amount * 1.25);
                }
                if (spec.resource === 'metal') prodMetal += amount;
                else if (spec.resource === 'energy') prodEnergy += amount;
                else if (spec.resource === 'isotope') prodIsotope += amount;
                else if (spec.resource === 'data') prodData += amount;
            }

            p.prod_metal = prodMetal;
            p.prod_energy = prodEnergy;
            p.prod_isotope = prodIsotope;
            p.prod_data = prodData;

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

    getBuildingCost(planet, structureType, targetLevel = 1) {
        const spec = BUILDING_SPECS[structureType];
        if (!spec) return { metal: 100, energy: 50, isotope: 0, discounted: false };

        let mult = targetLevel;
        if (structureType === 'terraformer') {
            const tfMults = [1, 1.8, 2.9, 4.4, 6.5];
            mult = tfMults[Math.min(4, Math.max(0, targetLevel - 1))] || targetLevel;
        }

        let metal = Math.round(spec.baseCostMetal * mult);
        let energy = Math.round(spec.baseCostEnergy * mult);
        let isotope = Math.round((spec.baseCostIsotope || 0) * mult);

        // Nagy bolygó különlegessége: a bónuszos nyersanyagnál a nagyobbik (Tier 2) épület olcsóbban (-35%) építhető és fejleszthető!
        let discounted = false;
        if (planet && planet.colony_size === 'large' && spec.tier === 2 && planet.bonus_resource === spec.resource) {
            metal = Math.round(metal * 0.65);
            energy = Math.round(energy * 0.65);
            isotope = Math.round(isotope * 0.65);
            discounted = true;
        }

        return { metal, energy, isotope, discounted };
    }

    buildStructure(planetId, structureType, playerId = 'player') {
        const mappedType = BUILDING_SPECS[structureType] ? structureType : (LEGACY_BUILDING_MAP[structureType] || null);
        const spec = BUILDING_SPECS[mappedType];
        if (!spec) return { error: `Ismeretlen épülettípus: ${structureType}` };

        const planet = this.getAllPlanets().find(p => p.id === planetId);
        if (!planet) return { error: "Ismeretlen bolygó!" };
        if (planet.owner_id !== playerId) return { error: "Csak saját birtokolt bolygón építkezhetsz!" };
        if (planet.planet_type !== 'colony') return { error: "Csak Kolónia bolygóra építhetők épületek!" };

        // Ha Terraformáló Állomást választott és már van, akkor fejlessze azt
        if (mappedType === 'terraformer') {
            const existingTf = planet.structures.find(s => s.structure_type === 'terraformer');
            if (existingTf) {
                return this.upgradeStructure(planetId, existingTf.slot_index, playerId);
            }
            if (planet.terraform_level >= 5) {
                return { error: "A Terraformáló Állomás már elérte a maximális 5. szintet!" };
            }
        } else if (spec.uniquePerPlanet) {
            const existingUnique = planet.structures.find(s => s.structure_type === mappedType);
            if (existingUnique) {
                return { error: `Ebből az épületből (${spec.name}) legfeljebb 1 lehet a bolygón! Fejleszd a meglévőt.` };
            }
        }

        // Szabad slot ellenőrzése (Terraformáló nem foglal slotot, Tier 1 = 1 slot, Tier 2 = 2 slot)
        const requiredSlots = spec.baseSlots;
        if (requiredSlots > 0 && planet.free_slots < requiredSlots) {
            return {
                error: `Nincs elég szabad slot a bolygón! A(z) ${spec.name} megépítéséhez ${requiredSlots} szabad slot szükséges (Jelenleg szabad: ${planet.free_slots}/${planet.max_slots}). Fejleszd a Terraformáló Állomást (+${planet.slot_step} slot/szint)!`
            };
        }

        // Tier 2 (nagyobbik épület) előfeltétel ellenőrzése:
        // Kisebb épület legalább Lv.3 szinten a bolygón, KIVÉVE Nagy bolygón a bónuszos nyersanyagra!
        const hasLargeBonus = (planet.colony_size === 'large' && planet.bonus_resource === spec.resource);
        if (spec.tier === 2 && spec.prereqBuilding && !hasLargeBonus) {
            const prereqSpec = BUILDING_SPECS[spec.prereqBuilding];
            const hasPrereq = planet.structures.some(s => s.structure_type === spec.prereqBuilding && s.level >= (spec.prereqLevel || 3));
            if (!hasPrereq) {
                return {
                    error: `A(z) ${spec.name} megépítéséhez előbb fejlessz fel legalább egy '${prereqSpec ? prereqSpec.name : spec.prereqBuilding}' épületet Lv.${spec.prereqLevel || 3} szintre ezen a bolygón! (Nagy bolygón ${spec.resource} bónusszal azonnal építhető.)`
                };
            }
        }

        const cost = this.getBuildingCost(planet, mappedType, 1);
        const player = this.getPlayer(playerId);
        if (!player) return { error: "Ismeretlen játékos!" };

        if (player.metal < cost.metal || player.energy < cost.energy || player.isotope < cost.isotope) {
            return {
                error: `Nincs elég nyersanyag! Szükséges: ${cost.metal} Fém, ${cost.energy} Energia${cost.isotope > 0 ? `, ${cost.isotope} Izotóp` : ''}.`
            };
        }

        // Levonás
        player.metal -= cost.metal;
        player.energy -= cost.energy;
        player.isotope -= cost.isotope;
        this.updatePlayerResources(playerId, player.metal, player.energy, player.isotope, player.data_points);

        // Következő szabad slot_index megkeresése az adatbázisban
        const maxIdxRow = this.db.prepare('SELECT MAX(slot_index) as maxIdx FROM planet_structures WHERE planet_id = ?').get(planetId);
        const nextSlotIndex = (maxIdxRow && maxIdxRow.maxIdx !== null && maxIdxRow.maxIdx !== undefined) ? (maxIdxRow.maxIdx + 1) : 0;
        const structId = `st_${planetId}_${mappedType}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        this.db.prepare(`
            INSERT INTO planet_structures (id, planet_id, slot_index, branch_type, structure_type, level)
            VALUES (?, ?, ?, ?, ?, 1)
        `).run(structId, planetId, nextSlotIndex, spec.category, mappedType);

        if (mappedType === 'terraformer') {
            const newTfLvl = 1;
            const newMaxSlots = 10 + newTfLvl * planet.slot_step;
            this.db.prepare('UPDATE planets SET terraform_level = ?, size_slots = ? WHERE id = ?').run(newTfLvl, newMaxSlots, planetId);
        } else if (mappedType === 'ship_dock') {
            this.db.prepare('UPDATE planets SET planetary_shield_hp = planetary_shield_hp + 250, max_shield_hp = max_shield_hp + 250 WHERE id = ?').run(planetId);
        }

        const updatedPlanet = this.getAllPlanets().find(p => p.id === planetId);
        return {
            success: true,
            structureId: structId,
            structureType: mappedType,
            name: spec.name,
            level: 1,
            cost,
            planet: updatedPlanet,
            player: this.getPlayer(playerId)
        };
    }

    upgradeStructure(planetId, slotIndex, playerId = 'player') {
        const planet = this.getAllPlanets().find(p => p.id === planetId);
        if (!planet) return { error: "Ismeretlen bolygó!" };
        if (planet.owner_id !== playerId) return { error: "Csak saját bolygón fejleszthetsz épületet!" };

        let struct = this.db.prepare('SELECT * FROM planet_structures WHERE planet_id = ? AND slot_index = ?').get(planetId, slotIndex);
        if (!struct && slotIndex === 'terraformer') {
            struct = this.db.prepare("SELECT * FROM planet_structures WHERE planet_id = ? AND structure_type = 'terraformer'").get(planetId);
            if (!struct) {
                return this.buildStructure(planetId, 'terraformer', playerId);
            }
        }
        if (!struct) return { error: "Nincs épület ezen a helyen!" };

        const mappedType = BUILDING_SPECS[struct.structure_type] ? struct.structure_type : (LEGACY_BUILDING_MAP[struct.structure_type] || 'surface_mine');
        const spec = BUILDING_SPECS[mappedType] || BUILDING_SPECS.surface_mine;
        const nextLevel = (struct.level || 1) + 1;

        if (nextLevel > spec.maxLevel) {
            return { error: `Ez az épület (${spec.name}) már elérte a maximális szintet (Lv.${spec.maxLevel})!` };
        }

        // Minden fejlesztés 1 szabad slotot foglal (kivéve a Terraformáló Állomást, ami új slotokat ad!)
        if (mappedType !== 'terraformer' && planet.free_slots < 1) {
            return {
                error: `Nincs szabad slot a fejlesztéshez! Minden épületfejlesztés +1 slotot foglal (Szabad slot: ${planet.free_slots}/${planet.max_slots}). Fejleszd a Terraformáló Állomást új slotokért!`
            };
        }

        const cost = this.getBuildingCost(planet, mappedType, nextLevel);
        const player = this.getPlayer(playerId);
        if (!player) return { error: "Ismeretlen játékos!" };

        if (player.metal < cost.metal || player.energy < cost.energy || player.isotope < cost.isotope) {
            return {
                error: `Nincs elég nyersanyag a fejlesztéshez! Szükséges: ${cost.metal} Fém, ${cost.energy} Energia${cost.isotope > 0 ? `, ${cost.isotope} Izotóp` : ''}.`
            };
        }

        player.metal -= cost.metal;
        player.energy -= cost.energy;
        player.isotope -= cost.isotope;
        this.updatePlayerResources(playerId, player.metal, player.energy, player.isotope, player.data_points);

        this.db.prepare('UPDATE planet_structures SET structure_type = ?, branch_type = ?, level = ? WHERE id = ?')
            .run(mappedType, spec.category, nextLevel, struct.id);

        if (mappedType === 'terraformer') {
            const newMaxSlots = 10 + nextLevel * planet.slot_step;
            this.db.prepare('UPDATE planets SET terraform_level = ?, size_slots = ? WHERE id = ?').run(nextLevel, newMaxSlots, planetId);
        } else if (mappedType === 'ship_dock') {
            this.db.prepare('UPDATE planets SET planetary_shield_hp = planetary_shield_hp + 250, max_shield_hp = max_shield_hp + 250 WHERE id = ?').run(planetId);
        }

        const updatedPlanet = this.getAllPlanets().find(p => p.id === planetId);
        return {
            success: true,
            newLevel: nextLevel,
            structureType: mappedType,
            name: spec.name,
            cost,
            costMetal: cost.metal,
            planet: updatedPlanet,
            player: this.getPlayer(playerId)
        };
    }

    demolishStructure(planetId, slotIndex, playerId = 'player') {
        const planet = this.getAllPlanets().find(p => p.id === planetId);
        if (!planet) return { error: "Ismeretlen bolygó!" };
        if (planet.owner_id !== playerId) return { error: "Csak saját bolygón bonthatsz le épületet!" };

        const struct = this.db.prepare('SELECT * FROM planet_structures WHERE planet_id = ? AND slot_index = ?').get(planetId, slotIndex);
        if (!struct) return { error: "Nem található épület ezen a sloton!" };
        if (struct.structure_type === 'terraformer') {
            return { error: "A Terraformáló Állomás nem bontható le!" };
        }

        this.db.prepare('DELETE FROM planet_structures WHERE id = ?').run(struct.id);
        const updatedPlanet = this.getAllPlanets().find(p => p.id === planetId);
        return {
            success: true,
            message: "Épület lebontva, a foglalt slotok felszabadultak!",
            planet: updatedPlanet
        };
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
            requiredGlory = 250;
            requiredArtifacts = ['artifact_chrono_core'];
            reqIso = 80;
            reqData = 150;
            fleetMet = totalCorvettes >= 15 || totalDestroyers >= 6;
            fleetDetails = `Haderő: ${totalCorvettes}/15 Korvett VAGY ${totalDestroyers}/6 Romboló`;
            techMet = true;
            techDetails = "Alapszintű flotta-infrastruktúra elegendő.";
        } else if (bossId === 'boss_2') {
            requiredGlory = 500;
            requiredArtifacts = ['artifact_chrono_core', 'artifact_dark_resonator'];
            reqIso = 160;
            reqData = 300;
            fleetMet = totalDestroyers >= 10 && (totalFrigates >= 6 || totalCorvettes >= 20);
            fleetDetails = `Haderő: ${totalDestroyers}/10 Romboló és (${totalFrigates}/6 Fregatt vagy ${totalCorvettes}/20 Korvett)`;
            techMet = playerTechs.includes('extended_shielding') || playerTechs.includes('heavy_metallurgy');
            techDetails = techMet ? "Kifejlesztve: Kiterjesztett Pajzs VAGY Nehézfém Kohászat!" : "Szükséges: Kiterjesztett Pajzs VAGY Nehézfém Kohászat";
        } else {
            // boss_3 (Omega Leviatán)
            requiredGlory = 850;
            requiredArtifacts = ['artifact_chrono_core', 'artifact_dark_resonator', 'artifact_codex'];
            reqIso = 250;
            reqData = 500;
            fleetMet = totalBB >= 8 && totalDestroyers >= 14;
            fleetDetails = `Haderő: ${totalBB}/8 Csatahajó, ${totalDestroyers}/14 Romboló`;
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

    getFreighterCargoCapacity(playerId = 'player') {
        const upg = this.getShipUpgrades(playerId);
        const cargoLvl = (upg.freighter && upg.freighter.cargo_hold) || 0;
        const bonusCargo = (SUBSYSTEM_BONUS_TABLES.freighter && SUBSYSTEM_BONUS_TABLES.freighter.cargo_hold && SUBSYSTEM_BONUS_TABLES.freighter.cargo_hold[cargoLvl]) || 0;
        const perShip = 500 + bonusCargo;
        
        let freighterCount = 0;
        const planets = this.getAllPlanets().filter(p => p.owner_id === playerId);
        for (const p of planets) {
            freighterCount += (p.stationedFleet && p.stationedFleet.freighter) || 0;
        }
        const fleets = this.db.prepare("SELECT id FROM fleets WHERE owner_id = ?").all(playerId);
        for (const f of fleets) {
            const shipRow = this.db.prepare("SELECT count FROM fleet_ships WHERE fleet_id = ? AND ship_type = 'freighter'").get(f.id);
            if (shipRow) freighterCount += (shipRow.count || 0);
        }
        return {
            freighterCount,
            perShipCapacity: perShip,
            totalCargoCapacity: Math.max(500, freighterCount * perShip)
        };
    }

    tradeResources(playerId = 'player', pairKey, amount) {
        amount = Math.max(1, Math.round(Number(amount) || 0));
        const player = this.getPlayer(playerId);
        if (!player) return { error: "Ismeretlen parancsnokság!" };

        const dockedCargo = this.getDockedTradeFleetCargo(playerId);
        const cargoInfo = dockedCargo.hasDockedExpedition ? dockedCargo : this.getFreighterCargoCapacity(playerId);
        if (amount > cargoInfo.totalCargoCapacity) {
            return { 
                error: `A művelet meghaladja a flottád raktérkapacitását! Max raktér: ${cargoInfo.totalCargoCapacity} egység (Teherszállítók száma: ${cargoInfo.freighterCount} db).`,
                maxCargo: cargoInfo.totalCargoCapacity
            };
        }

        const RATES = {
            'metal_to_energy':   { from: 'metal', to: 'energy',   ratio: 0.40, name: 'Fém -> Energia' },
            'metal_to_isotope':  { from: 'metal', to: 'isotope',  ratio: 0.10, name: 'Fém -> Izotóp' },
            'metal_to_data':     { from: 'metal', to: 'data_points', ratio: 0.15, name: 'Fém -> Adatpont' },
            'energy_to_metal':   { from: 'energy', to: 'metal',   ratio: 2.00, name: 'Energia -> Fém' },
            'energy_to_isotope': { from: 'energy', to: 'isotope', ratio: 0.20, name: 'Energia -> Izotóp' },
            'isotope_to_metal':  { from: 'isotope', to: 'metal',  ratio: 7.50, name: 'Izotóp -> Fém' },
            'isotope_to_energy': { from: 'isotope', to: 'energy', ratio: 4.00, name: 'Izotóp -> Energia' },
            'data_to_metal':     { from: 'data_points', to: 'metal', ratio: 4.00, name: 'Adatpont -> Fém' },
            'data_to_isotope':   { from: 'data_points', to: 'isotope', ratio: 0.50, name: 'Adatpont -> Izotóp' }
        };

        const config = RATES[pairKey];
        if (!config) return { error: "Érvénytelen kereskedelmi cserepár!" };

        if (player[config.from] < amount) {
            return { error: `Nincs elég forrásod ehhez az ügylethez! Rendelkezésre áll: ${Math.floor(player[config.from])}, szükséges: ${amount}` };
        }

        const received = Math.round(amount * config.ratio);
        player[config.from] -= amount;
        player[config.to] = (player[config.to] || 0) + received;

        this.updatePlayerResources(playerId, player.metal, player.energy, player.isotope, player.data_points);
        return {
            success: true,
            pairKey,
            spent: amount,
            fromResource: config.from,
            received,
            toResource: config.to,
            player: this.getPlayer(playerId)
        };
    }

    // =========================================================================
    // SZÖVETSÉGI RENDSZER (ALLIANCE SYSTEM) ÉS KÖZÖS HADMŰVELETEK
    // =========================================================================

    createAlliance(name, tag, leaderId, description = '') {
        const cleanName = (name || '').trim();
        let cleanTag = (tag || '').trim().toUpperCase().replace(/[\[\]]/g, '');
        if (!cleanName || cleanName.length < 3) return { error: "A szövetség nevének legalább 3 karakterből kell állnia!" };
        if (!cleanTag || cleanTag.length < 2 || cleanTag.length > 5) return { error: "A szövetségi tag 2-5 karakter hosszú lehet!" };

        // Ellenőrzés: a játékos nem lehet még szövetségben
        const existingMember = this.db.prepare("SELECT alliance_id FROM alliance_members WHERE player_id = ?").get(leaderId);
        if (existingMember) return { error: "Már tagja vagy egy szövetségnek! Előbb lépj ki onnan." };

        // Egyediség ellenőrzése
        const nameTaken = this.db.prepare("SELECT id FROM alliances WHERE name = ? OR tag = ?").get(cleanName, cleanTag);
        if (nameTaken) return { error: "Ez a szövetségnév vagy tag már foglalt!" };

        const allianceId = `alliance_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        this.db.prepare(`
            INSERT INTO alliances (id, name, tag, description, leader_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(allianceId, cleanName, `[${cleanTag}]`, description, leaderId);

        this.db.prepare(`
            INSERT INTO alliance_members (id, alliance_id, player_id, role)
            VALUES (?, ?, ?, 'leader')
        `).run(`mem_${Date.now()}_${leaderId}`, allianceId, leaderId);

        return { success: true, alliance: this.getAlliance(allianceId) };
    }

    getAlliance(allianceId) {
        const row = this.db.prepare("SELECT * FROM alliances WHERE id = ?").get(allianceId);
        if (!row) return null;

        const membersRows = this.db.prepare(`
            SELECT m.id, m.alliance_id, m.player_id, m.role, m.joined_at,
                   p.username, p.color_hex, p.glory_points, p.is_ai
            FROM alliance_members m
            JOIN players p ON m.player_id = p.id
            WHERE m.alliance_id = ?
            ORDER BY CASE m.role WHEN 'leader' THEN 1 WHEN 'officer' THEN 2 ELSE 3 END, m.joined_at ASC
        `).all(allianceId);

        for (const m of membersRows) {
            const basePlanet = this.db.prepare("SELECT id, name FROM planets WHERE owner_id = ? ORDER BY id ASC LIMIT 1").get(m.player_id);
            m.base_planet_name = basePlanet ? basePlanet.name : 'Mobil Bázis';
        }

        row.members = membersRows;
        row.memberCount = membersRows.length;
        const leader = membersRows.find(m => m.role === 'leader');
        row.leaderName = leader ? leader.username : 'Ismeretlen';
        return row;
    }

    getAllianceByPlayer(playerId) {
        const member = this.db.prepare("SELECT alliance_id, role FROM alliance_members WHERE player_id = ?").get(playerId);
        if (!member) return null;
        const alliance = this.getAlliance(member.alliance_id);
        if (alliance) {
            alliance.currentPlayerRole = member.role;
        }
        return alliance;
    }

    getAllAlliances() {
        const rows = this.db.prepare("SELECT * FROM alliances ORDER BY created_at DESC").all();
        return rows.map(r => this.getAlliance(r.id));
    }

    joinAlliance(allianceId, playerId) {
        const existingMember = this.db.prepare("SELECT alliance_id FROM alliance_members WHERE player_id = ?").get(playerId);
        if (existingMember) return { error: "Már tagja vagy egy szövetségnek! Előbb lépj ki onnan." };

        const alliance = this.db.prepare("SELECT * FROM alliances WHERE id = ?").get(allianceId);
        if (!alliance) return { error: "A megadott szövetség nem található!" };

        this.db.prepare(`
            INSERT INTO alliance_members (id, alliance_id, player_id, role)
            VALUES (?, ?, ?, 'member')
        `).run(`mem_${Date.now()}_${playerId}`, allianceId, playerId);

        return { success: true, alliance: this.getAlliance(allianceId) };
    }

    leaveAlliance(playerId) {
        const member = this.db.prepare("SELECT * FROM alliance_members WHERE player_id = ?").get(playerId);
        if (!member) return { error: "Nem vagy tagja egyetlen szövetségnek sem!" };

        const allianceId = member.alliance_id;
        const otherMembers = this.db.prepare("SELECT * FROM alliance_members WHERE alliance_id = ? AND player_id != ?").all(allianceId, playerId);

        if (member.role === 'leader') {
            if (otherMembers.length > 0) {
                // Új vezető kijelölése
                const newLeader = otherMembers[0];
                this.db.prepare("UPDATE alliances SET leader_id = ? WHERE id = ?").run(newLeader.player_id, allianceId);
                this.db.prepare("UPDATE alliance_members SET role = 'leader' WHERE id = ?").run(newLeader.id);
            } else {
                // Ha ő volt az egyetlen tag, a szövetség feloszlik
                this.db.prepare("DELETE FROM alliance_operations WHERE alliance_id = ?").run(allianceId);
                this.db.prepare("DELETE FROM alliances WHERE id = ?").run(allianceId);
            }
        }

        // Töröljük a tagságot
        this.db.prepare("DELETE FROM alliance_members WHERE player_id = ?").run(playerId);

        // Ha volt folyamatban lévő felajánlott hajója hadműveletben, visszakapja
        const opParts = this.db.prepare("SELECT * FROM alliance_operation_participants WHERE player_id = ?").all(playerId);
        for (const opPart of opParts) {
            const ships = JSON.parse(opPart.ships || '{}');
            const basePlanet = this.db.prepare("SELECT id FROM planets WHERE owner_id = ? ORDER BY id ASC LIMIT 1").get(playerId);
            if (basePlanet) {
                const sf = this.db.prepare("SELECT id FROM fleets WHERE origin_planet_id = ? AND state = 'stationed'").get(basePlanet.id);
                if (sf) {
                    for (const [st, cnt] of Object.entries(ships)) {
                        this.db.prepare("UPDATE fleet_ships SET count = count + ? WHERE fleet_id = ? AND ship_type = ?").run(cnt, sf.id, st);
                    }
                }
            }
            this.db.prepare("DELETE FROM alliance_operation_participants WHERE id = ?").run(opPart.id);
        }

        return { success: true };
    }

    isAllied(playerA, playerB) {
        if (!playerA || !playerB) return false;
        if (playerA === playerB) return true;
        const memA = this.db.prepare("SELECT alliance_id FROM alliance_members WHERE player_id = ?").get(playerA);
        const memB = this.db.prepare("SELECT alliance_id FROM alliance_members WHERE player_id = ?").get(playerB);
        if (!memA || !memB) return false;
        return memA.alliance_id === memB.alliance_id;
    }

    // =========================================================================
    // KÖZÖS TÁMADÁSI HADMŰVELETEK (WAR ROOM)
    // =========================================================================

    createAllianceOperation(allianceId, creatorId, targetType, targetId, targetTick, initialShips = {}) {
        // Ellenőrzés: a készítő szövetségtag
        const member = this.db.prepare("SELECT * FROM alliance_members WHERE alliance_id = ? AND player_id = ?").get(allianceId, creatorId);
        if (!member) return { error: "Csak szövetségi tag hozhat létre hadműveletet!" };

        // Szövetséges célpont ellenőrzése (nem támadhatjuk a szövetségest)
        if (targetType === 'player') {
            if (this.isAllied(creatorId, targetId)) {
                return { error: "Nem indíthatsz támadást a saját szövetségesed ellen!" };
            }
        } else if (targetType === 'planet') {
            const planet = this.db.prepare("SELECT owner_id FROM planets WHERE id = ?").get(targetId);
            if (planet && this.isAllied(creatorId, planet.owner_id)) {
                return { error: "Ez a bolygó egy szövetségesed birtokában van!" };
            }
        }

        // Célpont név és MAX LÉTSZÁM meghatározása:
        // Bossra: max 5 fő; Más játékosra / bolygóra: max 3 fő
        let maxParticipants = 3;
        let targetName = targetId;

        if (targetType === 'boss') {
            maxParticipants = 5;
            const b = this.getBossState(targetId);
            targetName = b ? b.name : `BOSS (${targetId})`;
        } else if (targetType === 'player') {
            maxParticipants = 3;
            const p = this.getPlayer(targetId);
            targetName = p ? `Parancsnok: ${p.username}` : `Játékos (${targetId})`;
        } else {
            maxParticipants = 3;
            const pl = this.db.prepare("SELECT name FROM planets WHERE id = ?").get(targetId);
            targetName = pl ? pl.name : `Bolygó (${targetId})`;
        }

        const curTick = this.getGameState();
        const execTick = Math.max(curTick + 1, parseInt(targetTick) || (curTick + 2));
        const opId = `op_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        this.db.prepare(`
            INSERT INTO alliance_operations (id, alliance_id, creator_id, target_type, target_id, target_name, target_tick, status, max_participants, created_at_tick)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'recruiting', ?, ?)
        `).run(opId, allianceId, creatorId, targetType, targetId, targetName, execTick, maxParticipants, curTick);

        // Készítő hajóinak felajánlása (ha adott meg)
        let hasShips = false;
        for (const cnt of Object.values(initialShips)) {
            if (cnt > 0) hasShips = true;
        }

        if (hasShips) {
            const joinRes = this.joinAllianceOperation(opId, creatorId, initialShips);
            if (joinRes.error) return joinRes;
        }

        return { success: true, operation: this.getOperation(opId) };
    }

    getAllianceOperations(allianceId) {
        const rows = this.db.prepare("SELECT * FROM alliance_operations WHERE alliance_id = ? ORDER BY status ASC, target_tick ASC").all(allianceId);
        return rows.map(r => this.getOperation(r.id));
    }

    getOperation(operationId) {
        const op = this.db.prepare("SELECT * FROM alliance_operations WHERE id = ?").get(operationId);
        if (!op) return null;

        const creator = this.getPlayer(op.creator_id);
        op.creatorName = creator ? creator.username : 'Ismeretlen';

        const parts = this.db.prepare(`
            SELECT p.id, p.operation_id, p.player_id, p.ships, p.joined_at_tick,
                   pl.username, pl.color_hex
            FROM alliance_operation_participants p
            JOIN players pl ON p.player_id = pl.id
            WHERE p.operation_id = ?
            ORDER BY p.joined_at_tick ASC
        `).all(operationId);

        let totalShipsCount = 0;
        for (const part of parts) {
            try {
                part.shipsParsed = JSON.parse(part.ships || '{}');
            } catch(e) {
                part.shipsParsed = {};
            }
            let pCount = 0;
            for (const cnt of Object.values(part.shipsParsed)) pCount += (cnt || 0);
            part.totalShips = pCount;
            totalShipsCount += pCount;
        }

        op.participants = parts;
        op.currentParticipants = parts.length;
        op.totalShipsCount = totalShipsCount;
        op.isFull = parts.length >= op.max_participants;
        return op;
    }

    joinAllianceOperation(operationId, playerId, ships) {
        const op = this.db.prepare("SELECT * FROM alliance_operations WHERE id = ?").get(operationId);
        if (!op) return { error: "A hadművelet nem található!" };
        if (op.status !== 'recruiting') return { error: "Ehhez a hadművelethez már nem lehet csatlakozni (lezárult vagy folyamatban van)!" };

        // Szövetségi tagság ellenőrzése
        const mem = this.db.prepare("SELECT * FROM alliance_members WHERE alliance_id = ? AND player_id = ?").get(op.alliance_id, playerId);
        if (!mem) return { error: "Csak a szövetség tagjai csatlakozhatnak a hadművelethez!" };

        // Már csatlakozott-e
        const existing = this.db.prepare("SELECT id FROM alliance_operation_participants WHERE operation_id = ? AND player_id = ?").get(operationId, playerId);
        if (existing) return { error: "Már felajánlottál flottát ehhez a hadművelethez!" };

        // Létszámkorlát ellenőrzése (Boss: max 5, Játékos/bolygó: max 3)
        const currentCountRow = this.db.prepare("SELECT COUNT(*) as count FROM alliance_operation_participants WHERE operation_id = ?").get(operationId);
        const currentCount = currentCountRow ? currentCountRow.count : 0;
        if (currentCount >= op.max_participants) {
            return { error: `A hadművelet elérte a maximális létszámot (${op.max_participants} fő)! Bossra max 5, játékosra max 3 fő mehet.` };
        }

        // Hajók ellenőrzése a játékos birtokolt bolygóin
        const playerPlanets = this.db.prepare("SELECT id FROM planets WHERE owner_id = ?").all(playerId);
        if (!playerPlanets || playerPlanets.length === 0) return { error: "Nincs birtokolt bolygód, ahonnan hajókat küldhetnél!" };

        let totalShipsSelected = 0;
        for (const [st, cnt] of Object.entries(ships)) {
            const requested = parseInt(cnt) || 0;
            if (requested > 0) {
                let totalAvail = 0;
                for (const p of playerPlanets) {
                    const sf = this.db.prepare("SELECT id FROM fleets WHERE origin_planet_id = ? AND state = 'stationed'").get(p.id);
                    if (sf) {
                        const row = this.db.prepare("SELECT count FROM fleet_ships WHERE fleet_id = ? AND ship_type = ?").get(sf.id, st);
                        if (row) totalAvail += row.count;
                    }
                }
                if (requested > totalAvail) {
                    return { error: `Nincs elég ${st} a flottáidban (${totalAvail} áll rendelkezésre, ${requested} felajánlva)!` };
                }
                totalShipsSelected += requested;
            }
        }

        if (totalShipsSelected === 0) {
            return { error: "Válassz ki legalább 1 hajót a közös hadművelethez!" };
        }

        // Hajók levonása a játékos állomásozó flottáiból
        for (const [st, cnt] of Object.entries(ships)) {
            let remainingToDeduct = parseInt(cnt) || 0;
            if (remainingToDeduct > 0) {
                for (const p of playerPlanets) {
                    if (remainingToDeduct <= 0) break;
                    const sf = this.db.prepare("SELECT id FROM fleets WHERE origin_planet_id = ? AND state = 'stationed'").get(p.id);
                    if (sf) {
                        const row = this.db.prepare("SELECT count FROM fleet_ships WHERE fleet_id = ? AND ship_type = ?").get(sf.id, st);
                        if (row && row.count > 0) {
                            const take = Math.min(row.count, remainingToDeduct);
                            this.db.prepare("UPDATE fleet_ships SET count = count - ? WHERE fleet_id = ? AND ship_type = ?").run(take, sf.id, st);
                            remainingToDeduct -= take;
                        }
                    }
                }
            }
        }

        const partId = `part_${Date.now()}_${playerId}`;
        this.db.prepare(`
            INSERT INTO alliance_operation_participants (id, operation_id, player_id, ships, joined_at_tick)
            VALUES (?, ?, ?, ?, ?)
        `).run(partId, operationId, playerId, JSON.stringify(ships), this.getGameState());

        return { success: true, operation: this.getOperation(operationId) };
    }

    cancelAllianceOperation(operationId, playerId) {
        const op = this.db.prepare("SELECT * FROM alliance_operations WHERE id = ?").get(operationId);
        if (!op) return { error: "A hadművelet nem található!" };

        const member = this.db.prepare("SELECT role FROM alliance_members WHERE alliance_id = ? AND player_id = ?").get(op.alliance_id, playerId);
        if (op.creator_id !== playerId && (!member || member.role !== 'leader')) {
            return { error: "Csak a készítő vagy a szövetség vezetője törölheti a hadműveletet!" };
        }

        // Hajók visszajuttatása a résztvevőknek
        const parts = this.db.prepare("SELECT * FROM alliance_operation_participants WHERE operation_id = ?").all(operationId);
        for (const part of parts) {
            const ships = JSON.parse(part.ships || '{}');
            const basePlanet = this.db.prepare("SELECT id FROM planets WHERE owner_id = ? ORDER BY id ASC LIMIT 1").get(part.player_id);
            if (basePlanet) {
                const sf = this.db.prepare("SELECT id FROM fleets WHERE origin_planet_id = ? AND state = 'stationed'").get(basePlanet.id);
                if (sf) {
                    for (const [st, cnt] of Object.entries(ships)) {
                        this.db.prepare("UPDATE fleet_ships SET count = count + ? WHERE fleet_id = ? AND ship_type = ?").run(cnt, sf.id, st);
                    }
                }
            }
        }

        this.db.prepare("UPDATE alliance_operations SET status = 'canceled' WHERE id = ?").run(operationId);
        return { success: true };
    }

    // =========================================================================
    // SZÖVETSÉGES VÉDELEM (ALLIED DEFENSE GARRISONS)
    // =========================================================================

    getStationedDefenseFleets(planetId) {
        const rows = this.db.prepare(`
            SELECT d.id, d.planet_id, d.owner_id, d.fleet_id, d.arrival_tick, d.state,
                   p.username as owner_name, p.color_hex as owner_color
            FROM allied_defense_fleets d
            JOIN players p ON d.owner_id = p.id
            WHERE d.planet_id = ? AND d.state = 'stationed'
        `).all(planetId);

        for (const row of rows) {
            const shipsRows = this.db.prepare("SELECT ship_type, count FROM fleet_ships WHERE fleet_id = ? AND count > 0").all(row.fleet_id);
            const ships = {};
            for (const s of shipsRows) ships[s.ship_type] = s.count;
            row.ships = ships;
        }
        return rows;
    }

    stationDefenseFleet(planetId, ownerId, fleetId, arrivalTick) {
        const id = `def_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        this.db.prepare(`
            INSERT INTO allied_defense_fleets (id, planet_id, owner_id, fleet_id, arrival_tick, state)
            VALUES (?, ?, ?, ?, ?, 'stationed')
        `).run(id, planetId, ownerId, fleetId, arrivalTick);
        return id;
    }

    recallDefenseFleet(alliedDefenseId, playerId) {
        const row = this.db.prepare("SELECT * FROM allied_defense_fleets WHERE id = ?").get(alliedDefenseId);
        if (!row) return { error: "A védelmi flotta nem található!" };
        if (row.owner_id !== playerId) return { error: "Csak a saját védelmi flottádat hívhatod vissza!" };

        // Védelmi hajók áthelyezése a játékos saját bázisára
        const basePlanet = this.db.prepare("SELECT id FROM planets WHERE owner_id = ? ORDER BY id ASC LIMIT 1").get(playerId);
        if (!basePlanet) return { error: "Nincs bázisbolygó a visszahíváshoz!" };

        const baseFleet = this.db.prepare("SELECT id FROM fleets WHERE origin_planet_id = ? AND state = 'stationed'").get(basePlanet.id);
        const shipsToReturn = this.db.prepare("SELECT ship_type, count FROM fleet_ships WHERE fleet_id = ? AND count > 0").all(row.fleet_id);

        for (const s of shipsToReturn) {
            const existing = this.db.prepare("SELECT id FROM fleet_ships WHERE fleet_id = ? AND ship_type = ?").get(baseFleet.id, s.ship_type);
            if (existing) {
                this.db.prepare("UPDATE fleet_ships SET count = count + ? WHERE fleet_id = ? AND ship_type = ?").run(s.count, baseFleet.id, s.ship_type);
            } else {
                this.db.prepare("INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total) VALUES (?, ?, ?, ?, ?, ?)")
                    .run(`${baseFleet.id}_${s.ship_type}`, baseFleet.id, s.ship_type, s.count, s.count * 100, 0);
            }
        }

        // Töröljük a védelmi helyőrséget
        this.db.prepare("DELETE FROM fleet_ships WHERE fleet_id = ?").run(row.fleet_id);
        this.db.prepare("DELETE FROM fleets WHERE id = ?").run(row.fleet_id);
        this.db.prepare("DELETE FROM allied_defense_fleets WHERE id = ?").run(alliedDefenseId);

        return { success: true, message: "A védelmi flotta sikeresen visszatért a bázisodra!" };
    }

    
    // =========================================================================
    // KERESKEDELMI EXPEDÍCIÓK (NEXUS PIAC: 50% IDŐ, 3 KÖR DOKKOLÁS, HAZAÚT)
    // =========================================================================

    launchTradeExpedition(playerId, originPlanetId, ships) {
        const player = this.getPlayer(playerId);
        if (!player) return { error: "Ismeretlen parancsnok!" };

        const planet = this.getAllPlanets().find(p => p.id === originPlanetId);
        if (!planet) return { error: "Ismeretlen kiindulási bolygó!" };
        if (planet.owner_id !== playerId) return { error: "Ez a bolygó nem a te birtokodban van!" };

        const totalShips = Object.values(ships || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
        if (totalShips <= 0) return { error: "Legalább 1 hajót ki kell jelölnöd a kereskedelmi expedícióhoz!" };

        const sf = planet.stationedFleet;
        if (!sf) return { error: "Nincs elérhető helyőrség a bolygón!" };

        for (const st of ALL_SHIP_TYPES) {
            const count = Number(ships[st]) || 0;
            if (count > 0) {
                const available = (sf[st] || 0);
                if (count > available) {
                    return { error: `Nincs elég hajó ebből a típusból (${st}) a(z) ${planet.name} bolygón! Elérhető: ${available}, igényelt: ${count}` };
                }
            }
        }

        const playerTechs = this.getPlayerResearch(playerId);
        const playerBuffs = this.getPlayerBuffs(playerId);
        const playerUpgrades = this.getShipUpgrades(playerId);

        const baseTravelTicks = 5;
        let speedDiscount = 0;
        if (playerTechs.includes('ion_thrusters')) speedDiscount += 1;
        if (playerTechs.includes('hyperspace_gate')) speedDiscount += 1;
        if (playerBuffs.some(b => b.buff_type === 'speed_boost')) speedDiscount += 1;

        let hasEngineUpg = false;
        for (const st of ALL_SHIP_TYPES) {
            if ((ships[st] || 0) > 0) {
                const upg = playerUpgrades[st] || {};
                if ((upg.engine || 0) >= 2) hasEngineUpg = true;
            }
        }
        if (hasEngineUpg) speedDiscount += 1;

        const normalTravelTicks = Math.max(1, baseTravelTicks - speedDiscount);
        // 50%-os menetidő oda és vissza
        const tradeTravelTicks = Math.max(1, Math.round(normalTravelTicks * 0.5));

        const SHIP_FUEL_WEIGHTS = { scout: 0.5, interceptor: 0.8, corvette: 1.0, freighter: 2.0, colony_ship: 2.0, frigate: 1.8, destroyer: 3.0, repair_ship: 4.0, cruiser: 4.5, battleship: 6.0 };
        const SHIP_HULL_SPECS = { scout: 40, interceptor: 70, corvette: 120, freighter: 350, colony_ship: 200, frigate: 280, destroyer: 450, repair_ship: 950, cruiser: 800, battleship: 1600 };
        const SHIP_SHIELD_SPECS = { scout: 0, interceptor: 25, corvette: 40, freighter: 60, colony_ship: 50, frigate: 120, destroyer: 200, repair_ship: 70, cruiser: 400, battleship: 800 };

        let totalFuelWeight = 0;
        for (const st of ALL_SHIP_TYPES) {
            const count = ships[st] || 0;
            if (count > 0) {
                totalFuelWeight += count * (SHIP_FUEL_WEIGHTS[st] || 1.0);
            }
        }
        const fuelMultiplier = playerTechs.includes('isotope_compression') ? 0.70 : 1.0;
        const fuelCost = Math.max(2, Math.ceil(totalFuelWeight * 2 * fuelMultiplier * 0.5));

        if (player.isotope < fuelCost) {
            return { error: `Nincs elég Izotóp üzemanyag az expedícióhoz! Szükséges: ${fuelCost} Izotóp (rendelkezésre áll: ${Math.floor(player.isotope)})` };
        }

        player.isotope -= fuelCost;
        this.updatePlayerResources(playerId, player.metal, player.energy, player.isotope, player.data_points);

        const updFleet = this.db.prepare(`UPDATE fleet_ships SET count = count - ? WHERE fleet_id = ? AND ship_type = ?`);
        for (const st of ALL_SHIP_TYPES) {
            const count = Number(ships[st]) || 0;
            if (count > 0) {
                updFleet.run(count, sf.fleetId, st);
            }
        }

        const curTick = this.getGameState();
        const fleetId = `f_trade_${playerId}_${Date.now()}`;
        const fleetName = `${player.username || 'Kereskedelmi'} Teherraj`;

        this.db.prepare(`
            INSERT INTO fleets (id, owner_id, name, current_x, current_y, dest_x, dest_y, origin_planet_id, target_planet_id, departure_tick, arrival_tick, state)
            VALUES (?, ?, ?, ?, ?, 410, 290, ?, 'station_trade', ?, ?, 'in_transit')
        `).run(fleetId, playerId, fleetName, planet.pos_x, planet.pos_y, planet.id, curTick, curTick + tradeTravelTicks);

        const insShip = this.db.prepare(`INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total) VALUES (?, ?, ?, ?, ?, ?)`);
        for (const st of ALL_SHIP_TYPES) {
            const count = Number(ships[st]) || 0;
            if (count > 0) {
                const hull = SHIP_HULL_SPECS[st] || 100;
                const shield = SHIP_SHIELD_SPECS[st] || 0;
                insShip.run(`${fleetId}_${st}`, fleetId, st, count, count * hull, count * shield);
            }
        }

        const expeditionId = `tr_exp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        this.db.prepare(`
            INSERT INTO trade_expeditions (
                id, player_id, fleet_id, origin_planet_id, state,
                departure_tick, arrival_tick, dock_start_tick, dock_duration_ticks,
                return_departure_tick, return_arrival_tick, travel_ticks, ships_json
            ) VALUES (?, ?, ?, ?, 'inbound', ?, ?, NULL, 3, NULL, NULL, ?, ?)
        `).run(expeditionId, playerId, fleetId, planet.id, curTick, curTick + tradeTravelTicks, tradeTravelTicks, JSON.stringify(ships));

        return {
            success: true,
            expeditionId,
            fleetId,
            originPlanetName: planet.name,
            departureTick: curTick,
            arrivalTick: curTick + tradeTravelTicks,
            travelTicks: tradeTravelTicks,
            fuelCost,
            ships
        };
    }

    getActiveTradeExpeditions(playerId = 'player') {
        const rows = this.db.prepare(`
            SELECT * FROM trade_expeditions 
            WHERE player_id = ? AND state != 'completed'
            ORDER BY created_at DESC
        `).all(playerId);

        const curTick = this.getGameState();
        const planets = this.getAllPlanets();
        const upg = this.getShipUpgrades(playerId);
        const cargoLvl = (upg.freighter && upg.freighter.cargo_hold) || 0;
        const bonusCargo = (SUBSYSTEM_BONUS_TABLES.freighter && SUBSYSTEM_BONUS_TABLES.freighter.cargo_hold && SUBSYSTEM_BONUS_TABLES.freighter.cargo_hold[cargoLvl]) || 0;
        const perShipCapacity = 500 + bonusCargo;

        return rows.map(r => {
            let ships = {};
            try { ships = JSON.parse(r.ships_json); } catch(e){}
            const originPlanet = planets.find(p => p.id === r.origin_planet_id);
            const freighterCount = Number(ships.freighter) || 0;
            const cargoCapacity = freighterCount * perShipCapacity;

            let remainingTicks = 0;
            let remainingDockTicks = 0;

            if (r.state === 'inbound') {
                remainingTicks = Math.max(0, r.arrival_tick - curTick);
            } else if (r.state === 'docked') {
                const elapsedDock = curTick - (r.dock_start_tick || curTick);
                remainingDockTicks = Math.max(0, r.dock_duration_ticks - elapsedDock);
            } else if (r.state === 'returning') {
                remainingTicks = Math.max(0, r.return_arrival_tick - curTick);
            }

            return {
                id: r.id,
                fleetId: r.fleet_id,
                playerId: r.player_id,
                originPlanetId: r.origin_planet_id,
                originPlanetName: originPlanet ? originPlanet.name : r.origin_planet_id,
                state: r.state,
                departureTick: r.departure_tick,
                arrivalTick: r.arrival_tick,
                dockStartTick: r.dock_start_tick,
                dockDurationTicks: r.dock_duration_ticks,
                returnDepartureTick: r.return_departure_tick,
                returnArrivalTick: r.return_arrival_tick,
                travelTicks: r.travel_ticks,
                remainingTicks,
                remainingDockTicks,
                ships,
                freighterCount,
                perShipCapacity,
                cargoCapacity,
                createdAt: r.created_at
            };
        });
    }

    getDockedTradeFleetCargo(playerId = 'player') {
        const active = this.getActiveTradeExpeditions(playerId);
        const docked = active.filter(e => e.state === 'docked');
        const upg = this.getShipUpgrades(playerId);
        const cargoLvl = (upg.freighter && upg.freighter.cargo_hold) || 0;
        const bonusCargo = (SUBSYSTEM_BONUS_TABLES.freighter && SUBSYSTEM_BONUS_TABLES.freighter.cargo_hold && SUBSYSTEM_BONUS_TABLES.freighter.cargo_hold[cargoLvl]) || 0;
        const perShipCapacity = 500 + bonusCargo;

        let totalDockedFreighters = 0;
        for (const exp of docked) {
            totalDockedFreighters += exp.freighterCount;
        }

        const totalDockedCargo = totalDockedFreighters * perShipCapacity;
        return {
            hasDockedExpedition: docked.length > 0,
            dockedCount: docked.length,
            freighterCount: totalDockedFreighters,
            perShipCapacity,
            totalCargoCapacity: totalDockedCargo > 0 ? totalDockedCargo : 500,
            dockedExpeditions: docked
        };
    }

    returnTradeExpedition(expeditionId, playerId = 'player') {
        const exp = this.db.prepare("SELECT * FROM trade_expeditions WHERE id = ? AND player_id = ?").get(expeditionId, playerId);
        if (!exp) return { error: "Ismeretlen kereskedelmi expedíció!" };
        if (exp.state !== 'docked') {
            return { error: `Csak a piacon dokkolt flotta indítható vissza (jelenlegi állapot: ${exp.state})!` };
        }

        const curTick = this.getGameState();
        const originPlanet = this.getAllPlanets().find(p => p.id === exp.origin_planet_id) || { pos_x: 200, pos_y: 200 };
        const returnArrivalTick = curTick + exp.travel_ticks;

        this.db.prepare(`
            UPDATE trade_expeditions
            SET state = 'returning',
                return_departure_tick = ?,
                return_arrival_tick = ?
            WHERE id = ?
        `).run(curTick, returnArrivalTick, exp.id);

        this.db.prepare(`
            UPDATE fleets
            SET state = 'in_transit',
                current_x = 410,
                current_y = 290,
                dest_x = ?,
                dest_y = ?,
                origin_planet_id = 'station_trade',
                target_planet_id = ?,
                departure_tick = ?,
                arrival_tick = ?
            WHERE id = ?
        `).run(originPlanet.pos_x, originPlanet.pos_y, exp.origin_planet_id, curTick, returnArrivalTick, exp.fleet_id);

        return {
            success: true,
            message: "A kereskedőflotta azonnal elindult haza a bázisra!",
            expeditionId: exp.id,
            departureTick: curTick,
            returnArrivalTick
        };
    }

    updateTradeExpeditionsTick(curTick) {
        const events = [];
        const allPlanets = this.getAllPlanets();

        // 1. Inbound flották megérkezése a Piacra
        const arriving = this.db.prepare("SELECT * FROM trade_expeditions WHERE state = 'inbound' AND ? >= arrival_tick").all(curTick);
        for (const exp of arriving) {
            this.db.prepare(`
                UPDATE trade_expeditions
                SET state = 'docked', dock_start_tick = ?
                WHERE id = ?
            `).run(curTick, exp.id);

            this.db.prepare(`
                UPDATE fleets
                SET state = 'stationed', current_x = 410, current_y = 290
                WHERE id = ?
            `).run(exp.fleet_id);

            events.push({
                type: 'trade_docked',
                expeditionId: exp.id,
                playerId: exp.player_id,
                message: `[KERESKEDELMI EXPEDÍCIÓ DOKKOLT] A flotta sikeresen megérkezett a Nexus Kereskedelmi Központba! 3 körös piacolási időablak aktív.`
            });
        }

        // 2. 3 körös piacolás letelte -> Automatikus hazaindulás
        const expiring = this.db.prepare("SELECT * FROM trade_expeditions WHERE state = 'docked' AND ? >= (dock_start_tick + dock_duration_ticks)").all(curTick);
        for (const exp of expiring) {
            const originPlanet = allPlanets.find(p => p.id === exp.origin_planet_id) || { pos_x: 200, pos_y: 200 };
            const returnArrivalTick = curTick + exp.travel_ticks;

            this.db.prepare(`
                UPDATE trade_expeditions
                SET state = 'returning',
                    return_departure_tick = ?,
                    return_arrival_tick = ?
                WHERE id = ?
            `).run(curTick, returnArrivalTick, exp.id);

            this.db.prepare(`
                UPDATE fleets
                SET state = 'in_transit',
                    current_x = 410,
                    current_y = 290,
                    dest_x = ?,
                    dest_y = ?,
                    origin_planet_id = 'station_trade',
                    target_planet_id = ?,
                    departure_tick = ?,
                    arrival_tick = ?
                WHERE id = ?
            `).run(originPlanet.pos_x, originPlanet.pos_y, exp.origin_planet_id, curTick, returnArrivalTick, exp.fleet_id);

            events.push({
                type: 'trade_auto_return',
                expeditionId: exp.id,
                playerId: exp.player_id,
                message: `[KERESKEDELMI EXPEDÍCIÓ AUTOMATIKUS HAZAINDULÁS] A 3 körös piacolási idő letelt! A flotta automatikusan útnak indult haza.`
            });
        }

        // 3. Returning flották hazaérkezése
        const returning = this.db.prepare("SELECT * FROM trade_expeditions WHERE state = 'returning' AND ? >= return_arrival_tick").all(curTick);
        for (const exp of returning) {
            let ships = {};
            try { ships = JSON.parse(exp.ships_json); } catch(e){}

            const originPlanet = allPlanets.find(p => p.id === exp.origin_planet_id);
            if (originPlanet && originPlanet.stationedFleet) {
                const sfId = originPlanet.stationedFleet.fleetId;
                const upd = this.db.prepare(`UPDATE fleet_ships SET count = count + ? WHERE fleet_id = ? AND ship_type = ?`);
                for (const st of ALL_SHIP_TYPES) {
                    const count = Number(ships[st]) || 0;
                    if (count > 0) {
                        const res = upd.run(count, sfId, st);
                        if (res.changes === 0) {
                            this.db.prepare(`INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total) VALUES (?, ?, ?, ?, ?, ?)`).run(`${sfId}_${st}`, sfId, st, count, count * 350, count * 60);
                        }
                    }
                }
            }

            this.db.prepare("DELETE FROM fleet_ships WHERE fleet_id = ?").run(exp.fleet_id);
            this.db.prepare("DELETE FROM fleets WHERE id = ?").run(exp.fleet_id);
            this.db.prepare("UPDATE trade_expeditions SET state = 'completed' WHERE id = ?").run(exp.id);

            events.push({
                type: 'trade_completed',
                expeditionId: exp.id,
                playerId: exp.player_id,
                message: `[KERESKEDELMI FLOTTA HAZATÉRT] A kereskedőflotta épségben visszaérkezett a(z) ${originPlanet ? originPlanet.name : 'bázis'} helyőrségébe!`
            });
        }

        return events;
    }

    scoutPlanet(planetId, playerId = 'player') {
        const planet = this.getAllPlanets().find(p => p.id === planetId);
        if (!planet) return { error: "Ismeretlen bolygó!" };
        this.db.prepare("UPDATE planets SET scouted_by_player = 1 WHERE id = ?").run(planetId);
        return {
            success: true,
            planetId,
            name: planet.name,
            ringIndex: planet.ring_index,
            planetType: planet.planet_type,
            colonySize: planet.colony_size,
            bonusResource: planet.bonus_resource,
            artifactTier: planet.artifact_tier,
            maxSlots: planet.max_slots,
            slotStep: planet.slot_step,
            lootType: planet.loot_type,
            lootData: planet.loot_data,
            stationedFleet: planet.stationedFleet,
            shieldHp: planet.shieldHp,
            railguns: planet.railgunCount
        };
    }
}

module.exports = { DatabaseService, DB_FILE, ALL_SHIP_TYPES, SHIP_TECH_REQUIREMENTS, SHIP_UPGRADE_MODULES, SHIP_SUBSYSTEMS, SUBSYSTEM_HOTSPOTS, SUBSYSTEM_BONUS_TABLES, BUILDING_SPECS, GALAXY_CENTER, MAX_COLONIES_PER_PLAYER };
