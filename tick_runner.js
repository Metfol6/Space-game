/**
 * SPACE 4X TACTICS - HEADLESS TICK ÉS HARCI SZIMULÁCIÓS MOTOR (Node.js)
 * Implementálja az óránkénti tick logikáját, a gazdaságot, az upkeept,
 * a mozgást és a pontos harci képletet a passzív képességekkel.
 */

const { SUBSYSTEM_BONUS_TABLES, ALL_SHIP_TYPES } = require('./db');

const SHIP_SPECS = {
    scout: {
        name: "Felderítő Szonda",
        symbol: "⌖",
        hull: 40.0,
        shield: 0.0,
        damage: 0.0,
        accuracy: 0.50,
        evasion: 0.50,
        speed: 9.0,
        upkeep_energy: 0.5,
        cost_metal: 30.0,
        cost_energy: 10.0,
        cost_isotope: 10.0,
        fuel_weight: 0.25,
        cargo_capacity: 0,
        recon_power: 1,
        ability_name: "Tachion Kémkedés & Lopakodás",
        ability_desc: "Harcképtelen. Képes felderíteni a védelmet és a rejtett zsákmányt. Lopakodással elkerüli a megsemmisülést."
    },
    interceptor: {
        name: "Gyors Elfogóvadász",
        symbol: "⚡",
        hull: 70.0,
        shield: 25.0,
        damage: 45.0,
        accuracy: 0.85,
        evasion: 0.35,
        speed: 10.0,
        upkeep_energy: 0.8,
        cost_metal: 45.0,
        cost_energy: 15.0,
        cost_isotope: 8.0,
        fuel_weight: 0.4,
        cargo_capacity: 50,
        ability_name: "Villámcsapás & Hiperszonikus Sebesség",
        ability_desc: "A leggyorsabb utazási idő. +25% sebzés az 1. harci körben."
    },
    corvette: {
        name: "Könnyű Korvett",
        symbol: "▲",
        hull: 120.0,
        shield: 40.0,
        damage: 35.0,
        accuracy: 0.80,
        evasion: 0.25,
        speed: 5.5,
        upkeep_energy: 1.0,
        cost_metal: 60.0,
        cost_energy: 20.0,
        cost_isotope: 5.0,
        fuel_weight: 1.0,
        cargo_capacity: 100,
        ability_name: "Zavarómező",
        ability_desc: "25% kitérés, a Csatahajók -40% pontossággal célozzák."
    },
    freighter: {
        name: "Nehéz Teherszállító",
        symbol: "📦",
        hull: 350.0,
        shield: 60.0,
        damage: 0.0,
        accuracy: 0.50,
        evasion: 0.05,
        speed: 4.0,
        upkeep_energy: 2.0,
        cost_metal: 180.0,
        cost_energy: 60.0,
        cost_isotope: 15.0,
        fuel_weight: 2.0,
        cargo_capacity: 500,
        ability_name: "Kereskedelmi Raktér & Logisztika",
        ability_desc: "Fegyvertelen nehéz logisztikai szállítóhajó. Szükséges a Kereskedelmi Állomáson való árucseréhez és nyersanyag-szállításhoz."
    },
    colony_ship: {
        name: "Kolóniahajó",
        symbol: "⚲",
        hull: 200.0,
        shield: 50.0,
        damage: 0.0,
        accuracy: 0.50,
        evasion: 0.05,
        speed: 3.0,
        upkeep_energy: 3.0,
        cost_metal: 300.0,
        cost_energy: 150.0,
        cost_isotope: 60.0,
        fuel_weight: 3.0,
        cargo_capacity: 300,
        ability_name: "Bioszféra Kolonizáció",
        ability_desc: "Semleges bolygók benépesítése bónusz kezdő készletekkel."
    },
    frigate: {
        name: "Lopakodó Torpedó Fregatt",
        symbol: "🗡️",
        hull: 280.0,
        shield: 120.0,
        damage: 85.0,
        accuracy: 0.80,
        evasion: 0.18,
        speed: 4.5,
        upkeep_energy: 2.5,
        cost_metal: 140.0,
        cost_energy: 50.0,
        cost_isotope: 18.0,
        fuel_weight: 1.8,
        cargo_capacity: 150,
        ability_name: "Pajzs-Átütő Torpedók",
        ability_desc: "A torpedók sebzésük 30%-át a pajzsot megkerülve közvetlenül a hajótestbe (Hull) juttatják."
    },
    destroyer: {
        name: "Romboló Cirkáló",
        symbol: "◆",
        hull: 450.0,
        shield: 200.0,
        damage: 110.0,
        accuracy: 0.75,
        evasion: 0.10,
        speed: 3.5,
        upkeep_energy: 4.0,
        cost_metal: 220.0,
        cost_energy: 80.0,
        cost_isotope: 20.0,
        fuel_weight: 2.5,
        cargo_capacity: 250,
        ability_name: "Pajzs-Szinkronizáció",
        ability_desc: ">=3 Romboló esetén körönként 15% pajzsot regenerál a flottának."
    },
    heavy_destroyer: {
        name: "Ostrom-Romboló",
        symbol: "💥",
        hull: 950.0,
        shield: 70.0,
        damage: 260.0,
        accuracy: 0.70,
        evasion: 0.02,
        speed: 2.4,
        upkeep_energy: 7.0,
        cost_metal: 480.0,
        cost_energy: 140.0,
        cost_isotope: 40.0,
        fuel_weight: 4.0,
        cargo_capacity: 350,
        ability_name: "Ostromágyú & Sérülékeny Pajzs",
        ability_desc: "3x sebzés bolygópajzsok és védelmi rendszerek ellen. Vékony pajzsa +50% sérülést kap."
    },
    cruiser: {
        name: "Drón-Hordozó Cirkáló",
        symbol: "🛸",
        hull: 800.0,
        shield: 400.0,
        damage: 75.0,
        accuracy: 0.75,
        evasion: 0.08,
        speed: 3.0,
        upkeep_energy: 8.0,
        cost_metal: 450.0,
        cost_energy: 180.0,
        cost_isotope: 50.0,
        fuel_weight: 4.5,
        cargo_capacity: 500,
        ability_name: "Drónraj Kíséret & ECM Mátrix",
        ability_desc: "+15% flotta szintű védelem és -15% ellenséges sebzés."
    },
    battleship: {
        name: "Csatahajó",
        symbol: "⬟",
        hull: 1600.0,
        shield: 800.0,
        damage: 380.0,
        accuracy: 0.65,
        evasion: 0.00,
        speed: 2.0,
        upkeep_energy: 15.0,
        cost_metal: 800.0,
        cost_energy: 300.0,
        cost_isotope: 80.0,
        fuel_weight: 6.0,
        cargo_capacity: 600,
        ability_name: "Spinalis Railgun & Blokád",
        ability_desc: "Megsemmisítő sebzés nehéz hajók ellen. Keringéskor blokkolja a bolygó termelését."
    }
};

class ShipInstance {
    constructor(shipType, techs = [], installedModules = [], buffs = []) {
        const spec = SHIP_SPECS[shipType] || SHIP_SPECS.corvette;
        this.shipType = shipType;

        this.subsystems = { weapon: 0, hull: 0, shield: 0, engine: 0, avionics: 0, cargo_hold: 0, stealth: 0, sensors: 0 };
        this.installedModules = [];

        const allSlotKeys = ['weapon', 'hull', 'shield', 'engine', 'avionics', 'cargo_hold', 'stealth', 'sensors'];
        if (Array.isArray(installedModules)) {
            this.installedModules = [...installedModules];
            for (const item of installedModules) {
                if (allSlotKeys.includes(item)) {
                    this.subsystems[item] = 1;
                }
            }
        } else if (typeof installedModules === 'object' && installedModules !== null) {
            for (const k of allSlotKeys) {
                this.subsystems[k] = installedModules[k] || 0;
            }
        }

        let hull = spec.hull;
        if (techs.includes('heavy_metallurgy')) {
            hull *= 1.30;
        }
        if (buffs && Array.isArray(buffs)) {
            const hBuff = buffs.find(b => b.buff_type === 'combat_hull_buff');
            if (hBuff) hull *= (1.0 + (hBuff.buff_value || 0.25));
        }
        const hullLvl = this.getSubsystemLevel('hull');
        if (hullLvl > 0 && SUBSYSTEM_BONUS_TABLES[shipType] && SUBSYSTEM_BONUS_TABLES[shipType].hull) {
            hull += (SUBSYSTEM_BONUS_TABLES[shipType].hull[hullLvl] || 0);
        }

        this.hull = Math.round(hull);
        this.maxHull = this.hull;

        let shield = spec.shield;
        if (techs.includes('extended_shielding')) {
            shield *= 1.25;
        }
        if (buffs && Array.isArray(buffs)) {
            const sBuff = buffs.find(b => b.buff_type === 'shield_overcharge');
            if (sBuff) shield *= (1.0 + (sBuff.buff_value || 0.20));
        }
        const shieldLvl = this.getSubsystemLevel('shield');
        if (shieldLvl > 0 && SUBSYSTEM_BONUS_TABLES[shipType] && SUBSYSTEM_BONUS_TABLES[shipType].shield) {
            shield += (SUBSYSTEM_BONUS_TABLES[shipType].shield[shieldLvl] || 0);
        }

        this.shield = Math.round(shield);
        this.maxShield = this.shield;
        this.isAlive = true;
    }

    getSubsystemLevel(slotKey) {
        if (this.subsystems && typeof this.subsystems[slotKey] === 'number') {
            return this.subsystems[slotKey];
        }
        return 0;
    }
}

class Fleet {
    constructor(ownerId, name, x = 0, y = 0, researchedTechs = []) {
        this.ownerId = ownerId;
        this.name = name;
        this.ships = [];
        this.x = x;
        this.y = y;
        this.speedPenaltyActive = false; // Negatív energia Upkeep esetén
        this.researchedTechs = researchedTechs;
    }

    aliveShips() {
        return this.ships.filter(s => s.isAlive && s.hull > 0);
    }

    countByType(type) {
        return this.aliveShips().filter(s => s.shipType === type).length;
    }

    getSpeed(techs = this.researchedTechs) {
        const alive = this.aliveShips();
        if (alive.length === 0) return 0;
        let minSpeed = Math.min(...alive.map(s => {
            let sp = SHIP_SPECS[s.shipType].speed;
            const engLvl = s.getSubsystemLevel ? s.getSubsystemLevel('engine') : 0;
            if (engLvl > 0 && SUBSYSTEM_BONUS_TABLES[s.shipType] && SUBSYSTEM_BONUS_TABLES[s.shipType].speed) {
                sp += (SUBSYSTEM_BONUS_TABLES[s.shipType].speed[engLvl] || 0);
            } else if (s.installedModules) {
                if (s.installedModules.includes('scout_tachyon_sensor')) sp += 2.0;
                if (s.installedModules.includes('corv_afterburners')) sp += 1.0;
                if (s.installedModules.includes('colony_warp_drive')) sp += 1.0;
                if (s.installedModules.includes('dest_sublight_overdrive')) sp += 0.8;
                if (s.installedModules.includes('bb_antimatter_drives')) sp += 0.6;
            }
            return sp;
        }));
        if (techs && techs.includes('ion_thrusters')) {
            minSpeed *= 1.25;
        }
        if (techs && techs.includes('hyperspace_gate')) {
            minSpeed = Math.max(6.0, minSpeed);
        }
        if (this.speedPenaltyActive) {
            minSpeed *= 0.5;
        }
        return minSpeed;
    }

    calculateDispatchCost(destX, destY, techs = this.researchedTechs) {
        const dist = Math.hypot(destX - this.x, destY - this.y);
        const speed = this.getSpeed(techs);
        const hours = speed > 0 ? dist / speed : 0;
        const fuelMultiplier = techs && techs.includes('isotope_compression') ? 0.70 : 1.0;
        let fuelCost = 0;
        for (const s of this.aliveShips()) {
            let fw = SHIP_SPECS[s.shipType].fuel_weight;
            const aviLvl = s.getSubsystemLevel ? s.getSubsystemLevel('avionics') : 0;
            if (s.shipType === 'scout' && aviLvl > 0 && SUBSYSTEM_BONUS_TABLES.scout && SUBSYSTEM_BONUS_TABLES.scout.fuel_mult) {
                fw *= (SUBSYSTEM_BONUS_TABLES.scout.fuel_mult[aviLvl] || 1.0);
            } else if (s.installedModules && s.installedModules.includes('scout_stealth_cloak')) {
                fw *= 0.90;
            }
            fuelCost += dist * fw * 0.05 * fuelMultiplier;
        }
        return { distance: dist, hours, fuelCost: Math.ceil(fuelCost) };
    }
}

class CombatEngine {
        static calculateHitChance(attackerType, defenderType, attShip = null, defShip = null, defenderFleet = null) {
        const attSpec = SHIP_SPECS[attackerType] || { accuracy: 0.70 };
        const defSpec = SHIP_SPECS[defenderType] || { evasion: 0.10 };

        let accuracy = attSpec.accuracy;
        let evasion = defSpec.evasion;
        let modifier = 0.0;

        if (attShip) {
            const attAvi = attShip.getSubsystemLevel('avionics');
            if (attAvi > 0 && SUBSYSTEM_BONUS_TABLES[attackerType]) {
                if (SUBSYSTEM_BONUS_TABLES[attackerType].accuracy) {
                    accuracy += (SUBSYSTEM_BONUS_TABLES[attackerType].accuracy[attAvi] || 0);
                }
                if (attackerType === 'battleship' && defenderType === 'corvette' && SUBSYSTEM_BONUS_TABLES.battleship.anti_corvette_accuracy) {
                    modifier += (SUBSYSTEM_BONUS_TABLES.battleship.anti_corvette_accuracy[attAvi] || 0);
                }
            }
        }
        if (defShip) {
            const defAvi = defShip.getSubsystemLevel('avionics');
            if (defAvi > 0 && SUBSYSTEM_BONUS_TABLES[defenderType] && SUBSYSTEM_BONUS_TABLES[defenderType].evasion) {
                evasion += (SUBSYSTEM_BONUS_TABLES[defenderType].evasion[defAvi] || 0);
            }

            // Felderítő EMP Zavarmag gyengíti a támadó célzási pontosságát
            const defWpn = defShip.getSubsystemLevel('weapon');
            if (defenderType === 'scout' && defWpn > 0 && SUBSYSTEM_BONUS_TABLES.scout && SUBSYSTEM_BONUS_TABLES.scout.enemy_accuracy_penalty) {
                modifier -= (SUBSYSTEM_BONUS_TABLES.scout.enemy_accuracy_penalty[defWpn] || 0);
            }
        }

        // Passzív 1: Korvett Zavarómezője Csatahajó ellen (-40% pontosság)
        if (defenderType === "corvette" && attackerType === "battleship") {
            modifier -= 0.40;
        }

        // Passzív: Drón-Hordozó Cirkáló kíséret védelme
        if (defenderFleet && defenderFleet.countByType && defenderFleet.countByType('cruiser') > 0) {
            modifier -= 0.10;
        }

        const chance = accuracy - evasion + modifier;
        return Math.max(0.10, Math.min(0.95, chance));
    }

    static resolveCombat(fleetA, fleetB, maxRounds = 5, techsA = fleetA.researchedTechs || [], techsB = fleetB.researchedTechs || []) {
        const logLines = [];
        logLines.push("=================== CSATANAPLÓ ===================");
        logLines.push(`Helyszín: X: ${fleetA.x.toFixed(0)}, Y: ${fleetA.y.toFixed(0)}`);
        
        const formatFleetSummary = (fleet) => {
            return ALL_SHIP_TYPES
                .filter(st => fleet.countByType(st) > 0)
                .map(st => `${fleet.countByType(st)} ${SHIP_SPECS[st].name}`)
                .join(', ') || 'Üres flotta';
        };

        logLines.push(`Résztvevők:`);
        logLines.push(`  [A OLDAL] ${fleetA.name} (${formatFleetSummary(fleetA)})`);
        logLines.push(`  [B OLDAL] ${fleetB.name} (${formatFleetSummary(fleetB)})`);
        if (techsA.length > 0) logLines.push(`  [A OLDAL TECH] ${techsA.join(', ')}`);
        if (techsB.length > 0) logLines.push(`  [B OLDAL TECH] ${techsB.join(', ')}`);
        logLines.push("-".repeat(50));

        const initialA = {};
        const initialB = {};
        for (const st of ALL_SHIP_TYPES) {
            initialA[st] = fleetA.countByType(st);
            initialB[st] = fleetB.countByType(st);
        }

        let roundNum = 1;
        while (roundNum <= maxRounds && fleetA.aliveShips().length > 0 && fleetB.aliveShips().length > 0) {
            logLines.push(`FORDULÓ ${roundNum}:`);

            const attacksA = this._generateAttacks(fleetA, fleetB, techsA, roundNum);
            const attacksB = this._generateAttacks(fleetB, fleetA, techsB, roundNum);

            const resB = this._applyAttacks(attacksA, fleetB);
            const resA = this._applyAttacks(attacksB, fleetA);

            if (resA.dodges > 0) logLines.push(` • [A OLDAL] Elhárítás/Kitérés: ${resA.dodges} ellenséges lövedéket térített el.`);
            if (resB.dodges > 0) logLines.push(` • [B OLDAL] Elhárítás/Kitérés: ${resB.dodges} ellenséges lövedéket térített el.`);

            if (resB.damage > 0) logLines.push(` • [A OLDAL] Tüzérsége ${Math.round(resB.damage)} sebzést okozott (${resB.destroyed} hajót semmisített meg).`);
            if (resA.damage > 0) logLines.push(` • [B OLDAL] Tüzérsége ${Math.round(resA.damage)} sebzést okozott (${resA.destroyed} hajót semmisített meg).`);

            const regenA = this._applyShieldSync(fleetA);
            if (regenA > 0) logLines.push(` • [A OLDAL] Rombolók Pajzs-szinkronizációja visszatöltött ${Math.round(regenA)} pajzsot.`);

            const regenB = this._applyShieldSync(fleetB);
            if (regenB > 0) logLines.push(` • [B OLDAL] Rombolók Pajzs-szinkronizációja visszatöltött ${Math.round(regenB)} pajzsot.`);

            roundNum++;
        }

        const aliveA = fleetA.aliveShips().length;
        const aliveB = fleetB.aliveShips().length;

        let winner = null;
        let outcomeText = "";
        if (aliveA > 0 && aliveB === 0) {
            winner = fleetA.ownerId;
            outcomeText = `GYŐZELEM: [A OLDAL] ${fleetA.name}`;
        } else if (aliveB > 0 && aliveA === 0) {
            winner = fleetB.ownerId;
            outcomeText = `GYŐZELEM: [B OLDAL] ${fleetB.name}`;
        } else {
            outcomeText = "DÖNTETLEN / TAKTIKAI MEGTORPANÁS";
        }

        logLines.push("-".repeat(50));
        logLines.push(`EREDMÉNY: ${outcomeText}`);

        const lostA = {};
        const lostB = {};
        for (const st of ALL_SHIP_TYPES) {
            lostA[st] = initialA[st] - fleetA.countByType(st);
            lostB[st] = initialB[st] - fleetB.countByType(st);
        }

        let totalLostMetal = 0;
        let totalLostIso = 0;
        for (const st of ALL_SHIP_TYPES) {
            const costM = SHIP_SPECS[st].cost_metal || 0;
            const costI = SHIP_SPECS[st].cost_isotope || 0;
            totalLostMetal += (lostA[st] + lostB[st]) * costM;
            totalLostIso += (lostA[st] + lostB[st]) * costI;
        }

        let salvageMult = 1.0;
        if (fleetA.countByType('freighter') > 0 || fleetB.countByType('freighter') > 0) {
            salvageMult = 1.5;
            logLines.push(` • [📦 TEHERSZÁLLÍTÓ MENTŐCSAPAT] +50% extra roncsmentési zsákmány begyűjtve!`);
        }

        const salvageMetal = totalLostMetal * 0.20 * salvageMult;
        const salvageIsotope = totalLostIso * 0.10 * salvageMult;

        if (salvageMetal > 0 || salvageIsotope > 0) {
            logLines.push(`RONCSMENTÉS: +${Math.round(salvageMetal)} Fém, +${Math.round(salvageIsotope)} Izotóp zsákmányolható.`);
        }
        logLines.push("=".repeat(50));

        let valLostA = 0;
        let valLostB = 0;
        for (const st of ALL_SHIP_TYPES) {
            const spec = SHIP_SPECS[st] || {};
            const val = (spec.cost_metal || 50) + (spec.cost_energy || 20);
            valLostA += (lostA[st] || 0) * val;
            valLostB += (lostB[st] || 0) * val;
        }
        const baseGlory = winner === fleetA.ownerId ? Math.max(30, Math.min(250, Math.round(50 + valLostB * 0.04))) : (winner === fleetB.ownerId ? Math.max(30, Math.min(250, Math.round(50 + valLostA * 0.04))) : 0);

        return {
            winnerId: winner,
            outcome: outcomeText,
            log: logLines.join("\n"),
            lostA,
            lostB,
            salvageMetal,
            salvageIsotope,
            baseGlory
        };
    }

    static _generateAttacks(attackerFleet, defenderFleet, techs = [], roundNum = 1) {
        const attacks = [];
        const aliveDefenders = defenderFleet.aliveShips();
        if (aliveDefenders.length === 0) return attacks;

        // Ha a védő flotta rendelkezik Drón-Hordozóval, az zavarja az ellenséges tűzerőt
        const enemyEcm = (defenderFleet && typeof defenderFleet.countByType === 'function' && defenderFleet.countByType('cruiser') > 0) ? 0.85 : 1.0;

        for (const att of attackerFleet.aliveShips()) {
            if (att.shipType === 'scout') {
                // Felderítő Szonda harcképtelen
                continue;
            }

            let dmg = SHIP_SPECS[att.shipType].damage;
            const wpnLvl = att.getSubsystemLevel('weapon');
            if (wpnLvl > 0 && SUBSYSTEM_BONUS_TABLES[att.shipType] && SUBSYSTEM_BONUS_TABLES[att.shipType].damage) {
                dmg += (SUBSYSTEM_BONUS_TABLES[att.shipType].damage[wpnLvl] || 0);
            }

            // Gyors Elfogóvadász Villámcsapás képesség az 1. fordulóban
            if (att.shipType === 'interceptor' && roundNum === 1) {
                dmg *= 1.25;
            }

            // Technológiai bónuszok
            if (techs && techs.includes('kinetic_calibration') && (att.shipType === 'corvette' || att.shipType === 'destroyer' || att.shipType === 'interceptor')) {
                dmg *= 1.15;
            }
            if (techs && techs.includes('siege_warheads') && (att.shipType === 'battleship' || att.shipType === 'heavy_destroyer')) {
                dmg *= 1.50;
            }
            if (attackerFleet.buffs && Array.isArray(attackerFleet.buffs)) {
                const dmgBuff = attackerFleet.buffs.find(b => b.buff_type === 'combat_dmg_buff');
                if (dmgBuff) dmg *= (1.0 + (dmgBuff.buff_value || 0.20));
            }
            if (attackerFleet.speedPenaltyActive) dmg *= 0.5;

            // ECM zavarás alkalmazása
            dmg *= enemyEcm;

            // Célpont kiválasztás
            let target;
            if (att.shipType === "battleship" || att.shipType === "heavy_destroyer") {
                const heavyTargets = aliveDefenders.filter(s => s.shipType === "battleship" || s.shipType === "heavy_destroyer" || s.shipType === "destroyer" || s.shipType === "cruiser");
                target = heavyTargets.length > 0 ? heavyTargets[Math.floor(Math.random() * heavyTargets.length)] : aliveDefenders[Math.floor(Math.random() * aliveDefenders.length)];
            } else if (att.shipType === "frigate") {
                // A Torpedó Fregatt a legnagyobb pajzzsal rendelkező célpontokat támadja a pajzs-átütés maximalizálásához
                const highShieldTargets = aliveDefenders.filter(s => s.shield > 50);
                target = highShieldTargets.length > 0 ? highShieldTargets[Math.floor(Math.random() * highShieldTargets.length)] : aliveDefenders[Math.floor(Math.random() * aliveDefenders.length)];
            } else {
                target = aliveDefenders[Math.floor(Math.random() * aliveDefenders.length)];
            }

            attacks.push({ attType: att.shipType, attShip: att, target, dmg });
        }
        return attacks;
    }

    static _applyAttacks(attacks, defenderFleet) {
        let dodges = 0;
        let destroyed = 0;
        let damage = 0;

        for (const { attType, attShip, target, dmg } of attacks) {
            if (!target.isAlive) continue;

            const hitProb = this.calculateHitChance(attType, target.shipType, attShip, target, defenderFleet);
            if (Math.random() > hitProb) {
                dodges++;
                continue;
            }

            damage += dmg;

            // Különleges Képesség: Fregatt Pajzs-Átütő Torpedók (30% közvetlen Hull sebzés)
            let directHullDmg = 0;
            let standardDmg = dmg;
            if (attType === 'frigate') {
                directHullDmg = dmg * 0.30;
                standardDmg = dmg * 0.70;
                target.hull -= directHullDmg;
            }

            // Különleges Képesség: Ostrom-Romboló Sérülékeny Pajzs (+50% pajzssérülés)
            if (target.shipType === 'heavy_destroyer' && target.shield > 0) {
                const shieldDmg = standardDmg * 1.5;
                if (target.shield >= shieldDmg) {
                    target.shield -= shieldDmg;
                    standardDmg = 0;
                } else {
                    const absorbedStandard = target.shield / 1.5;
                    target.shield = 0;
                    standardDmg -= absorbedStandard;
                }
            } else {
                if (target.shield >= standardDmg) {
                    target.shield -= standardDmg;
                    standardDmg = 0;
                } else {
                    standardDmg -= target.shield;
                    target.shield = 0;
                }
            }

            target.hull -= standardDmg;

            if (target.hull <= 0) {
                target.isAlive = false;
                target.hull = 0;
                destroyed++;
            }
        }
        return { dodges, destroyed, damage };
    }

    static _applyShieldSync(fleet) {
        if (fleet.countByType("destroyer") < 3) return 0;
        let total = 0;
        const hasAmp = fleet.aliveShips().some(s => s.shipType === 'destroyer' && s.installedModules && s.installedModules.includes('dest_shield_amplifier'));
        const syncRatio = hasAmp ? 0.25 : 0.15;

        for (const ship of fleet.aliveShips()) {
            if (ship.shield < ship.maxShield) {
                const missing = ship.maxShield - ship.shield;
                const regen = missing * syncRatio;
                ship.shield = Math.min(ship.maxShield, ship.shield + regen);
                total += regen;
            }
        }
        return total;
    }

    static resolveBossCombat(playerFleet, initialBossState, techs = playerFleet.researchedTechs || [], maxRounds = 8) {
        const logLines = [];
        const bossName = initialBossState.name || 'PREKURZOR CITADELLA';
        logLines.push("==================================================");
        logLines.push(`  ☠️ CITADELLA OSTROM: CSATA A(Z) ${bossName} ELLEN`);
        logLines.push("==================================================");
        logLines.push(`Támadó Armada: ${playerFleet.name}`);
        logLines.push(`  Összetétel: ${ALL_SHIP_TYPES.filter(st => playerFleet.countByType(st) > 0).map(st => `${playerFleet.countByType(st)} ${SHIP_SPECS[st].name}`).join(', ') || 'Nincs hajó'}`);
        logLines.push(`Célpont: ${bossName}`);
        logLines.push(`  Kezdeti állapot: Test=${Math.round(initialBossState.hull)}/${initialBossState.max_hull} HP, Pajzs=${Math.round(initialBossState.shield)}/${initialBossState.max_shield} HP`);
        logLines.push("-".repeat(50));

        let bossHull = initialBossState.hull;
        let bossShield = initialBossState.shield;
        const bossMaxShield = initialBossState.max_shield || 3000;
        const beamDmg = initialBossState.damage || (initialBossState.id === 'boss_1' ? 700 : (initialBossState.id === 'boss_2' ? 1050 : 1625));
        const pulseDmg = initialBossState.id === 'boss_1' ? 75 : (initialBossState.id === 'boss_2' ? 112 : 150);
        const maxRegen = initialBossState.id === 'boss_1' ? 500 : (initialBossState.id === 'boss_2' ? 875 : 1250);

        let roundNum = 1;
        let bossDefeated = false;

        while (roundNum <= maxRounds && playerFleet.aliveShips().length > 0 && bossHull > 0) {
            logLines.push(`\n>>> ${roundNum}. FORDULÓ <<<`);

            // 1. Játékos armada támadása
            let totalPlayerDamage = 0;
            let hits = 0;
            for (const ship of playerFleet.aliveShips()) {
                const spec = SHIP_SPECS[ship.shipType];
                let acc = spec.accuracy;
                if (ship.installedModules && ship.installedModules.includes('dest_missile_intercept')) acc += 0.15;
                if (Math.random() <= acc) {
                    hits++;
                    let dmg = spec.damage;
                    if (ship.installedModules && ship.installedModules.includes('corv_overcharged_lasers')) dmg += 12;
                    if (ship.installedModules && ship.installedModules.includes('colony_point_defense')) dmg += 15;
                    if (ship.installedModules && ship.installedModules.includes('dest_gauss_cannons')) dmg += 35;
                    if (ship.installedModules && ship.installedModules.includes('bb_spinal_railgun')) dmg += 120;

                    if (techs.includes('kinetic_calibration') && (ship.shipType === 'corvette' || ship.shipType === 'destroyer')) {
                        dmg *= 1.15;
                    }
                    if (techs.includes('siege_warheads') && ship.shipType === 'battleship') {
                        dmg *= 1.50;
                    }
                    totalPlayerDamage += dmg;
                }
            }

            // Sebzés kiosztása a bossra
            let absorbedByShield = Math.min(bossShield, totalPlayerDamage);
            bossShield -= absorbedByShield;
            let dmgToHull = totalPlayerDamage - absorbedByShield;
            bossHull = Math.max(0, bossHull - dmgToHull);

            logLines.push(` • [ARMADA TŰZCSAPÁS] ${hits} fegyver talált: ${Math.round(totalPlayerDamage)} sebzés (Pajzs: -${Math.round(absorbedByShield)}, Test: -${Math.round(dmgToHull)}).`);
            logLines.push(`   ARK-0 Állapot: Pajzs=${Math.round(bossShield)}, Test=${Math.round(bossHull)} HP`);

            if (bossHull <= 0) {
                bossDefeated = true;
                logLines.push(`\n💥 [KATASZTROFÁLIS ROBBANÁS] Az ARK-0 Kronos-Leviatán reaktormagja felrobbant!`);
                logLines.push(`   A szingularitás összeomlott, a Leviatán megsemmisült!`);
                break;
            }

            // 2. Boss ellencsapása: Titan Beam (1-2 csapás)
            const titanHits = Math.random() < 0.85 ? (playerFleet.aliveShips().length > 5 ? 2 : 1) : 0;
            for (let t = 0; t < titanHits; t++) {
                const targets = playerFleet.aliveShips();
                if (targets.length === 0) break;
                targets.sort((a, b) => (SHIP_SPECS[b.shipType].hull) - (SHIP_SPECS[a.shipType].hull));
                const target = targets[0];
                // beamDmg dinamikusan definiálva a fejlécben
                let shieldAbs = Math.min(target.shield, beamDmg);
                target.shield -= shieldAbs;
                target.hull -= (beamDmg - shieldAbs);
                if (target.hull <= 0) {
                    target.isAlive = false;
                    logLines.push(` ☠️ [OMEGA TITAN BEAM] A Leviatán főágyúja közvetlen találattal megsemmisített egy ${SHIP_SPECS[target.shipType].name}-t!`);
                } else {
                    logLines.push(` ⚠️ [OMEGA TITAN BEAM] Súlyos találat érte a ${SHIP_SPECS[target.shipType].name}-t (${Math.round(beamDmg)} DMG).`);
                }
            }

            // 3. Gravitációs Pulzus AoE (minden túlélő hajó kap 50 DMG-t)
            let aoeCasualties = 0;
            for (const ship of playerFleet.aliveShips()) {
                // pulseDmg dinamikusan definiálva a fejlécben
                let sAbs = Math.min(ship.shield, pulseDmg);
                ship.shield -= sAbs;
                ship.hull -= (pulseDmg - sAbs);
                if (ship.hull <= 0) {
                    ship.isAlive = false;
                    aoeCasualties++;
                }
            }
            if (aoeCasualties > 0) {
                logLines.push(` 🌀 [GRAVITÁCIÓS PULZUS] A lökéshullám további ${aoeCasualties} hajót zúzott szét!`);
            } else {
                logLines.push(` 🌀 [GRAVITÁCIÓS PULZUS] A rezonancia-hullám megrázta az armada hajóit (-50 HP pajzs/test).`);
            }

            // 4. Boss pajzs regenerációja
            if (bossShield < bossMaxShield) {
                const regenAmt = Math.min(maxRegen, bossMaxShield - bossShield);
                bossShield += regenAmt;
                logLines.push(` ⚡ [SZINGULARITÁS-TÖLTÉS] Az ARK-0 visszatöltött ${regenAmt} pajzsenergiát.`);
            }

            // 5. Játékos Rombolók Pajzs-szinkronizációja
            this._applyShieldSync(playerFleet);

            roundNum++;
        }

        const playerAlive = playerFleet.aliveShips().length;
        let won = bossDefeated;
        let resultOutcome = "";

        if (won) {
            resultOutcome = "TELJES GALAKTIKUS GYŐZELEM! AZ ARK-0 KRONOS-LEVIATÁN ELPUSZTULT!";
        } else if (playerAlive === 0) {
            resultOutcome = "VERESÉG: A támadó armada teljesen megsemmisült a Leviatán tüze alatt.";
        } else {
            resultOutcome = "VISSZAVONULÁS: Az armada nem tudta áttörni az ARK-0 magját és visszavonult.";
        }

        logLines.push("-".repeat(50));
        logLines.push(`VÉGEREDMÉNY: ${resultOutcome}`);
        logLines.push(`Túlélő armada: ${playerFleet.countByType('corvette')} Korvett, ${playerFleet.countByType('destroyer')} Romboló, ${playerFleet.countByType('battleship')} Csatahajó`);

        return {
            won,
            bossDefeated,
            finalBossHull: bossHull,
            finalBossShield: bossShield,
            survivingShips: {
                scout: playerFleet.countByType('scout'),
                interceptor: playerFleet.countByType('interceptor'),
                corvette: playerFleet.countByType('corvette'),
                freighter: playerFleet.countByType('freighter'),
                colony_ship: playerFleet.countByType('colony_ship'),
                frigate: playerFleet.countByType('frigate'),
                destroyer: playerFleet.countByType('destroyer'),
                heavy_destroyer: playerFleet.countByType('heavy_destroyer'),
                cruiser: playerFleet.countByType('cruiser'),
                battleship: playerFleet.countByType('battleship')
            },
            salvageMetal: won ? 2000 : 0,
            salvageIsotope: won ? 1000 : 0,
            log: logLines.join("\n")
        };
    }
}

// ============================================================================
// TESZTFUTTATÁS
// ============================================================================

function runTests() {
    console.log(">>> [NODE.JS] ŰRSTRATÉGIA HARCRENDSZER ÉS FORMULA TESZTEK INDÍTÁSA...");

    // 1. Teszt: Korvett Zavarómezője Csatahajó ellen (Clamp 10%)
    const hitCorvVsBB = CombatEngine.calculateHitChance("battleship", "corvette");
    console.log(`1. Teszt - Csatahajó pontossága Korvett ellen: ${(hitCorvVsBB * 100).toFixed(1)}% (Várt: 10.0%)`);
    if (Math.abs(hitCorvVsBB - 0.10) > 0.001) throw new Error("1. Teszt bukott!");

    // 2. Teszt: Korvett Korvett ellen (0.80 - 0.25 = 0.55)
    const hitCorvVsCorv = CombatEngine.calculateHitChance("corvette", "corvette");
    console.log(`2. Teszt - Korvett Korvett ellen: ${(hitCorvVsCorv * 100).toFixed(1)}% (Várt: 55.0%)`);
    if (Math.abs(hitCorvVsCorv - 0.55) > 0.001) throw new Error("2. Teszt bukott!");

    // 3. Teszt: Flotta sebesség kalkuláció
    const f = new Fleet("player", "Teszt Flotta");
    f.ships.push(new ShipInstance("corvette")); // 5.0
    f.ships.push(new ShipInstance("battleship")); // 2.0
    console.log(`3. Teszt - Vegyes flotta sebessége: ${f.getSpeed()} (Várt: 2.0)`);
    if (f.getSpeed() !== 2.0) throw new Error("3. Teszt bukott!");

    // 4. Teszt: Negatív energia büntetés (felezett sebesség)
    f.speedPenaltyActive = true;
    console.log(`4. Teszt - Negatív energia büntetett sebesség: ${f.getSpeed()} (Várt: 1.0)`);
    if (f.getSpeed() !== 1.0) throw new Error("4. Teszt bukott!");
    f.speedPenaltyActive = false;

    // 5. Teszt: Romboló Pajzs-szinkronizáció
    const fShield = new Fleet("player", "Pajzs Flotta");
    for (let i = 0; i < 3; i++) {
        const d = new ShipInstance("destroyer");
        d.shield = 100; // max 200, 100 hiányzik
        fShield.ships.push(d);
    }
    const regen = CombatEngine._applyShieldSync(fShield);
    console.log(`5. Teszt - Rombolók Pajzs-szinkronizációja: ${regen} (Várt: 45.0)`);
    if (Math.abs(regen - 45.0) > 0.001) throw new Error("5. Teszt bukott!");

    // 6. Teszt: Minta csataszimuláció
    const fa = new Fleet("player", "7. Védelmi Flotta", 110, 45);
    for (let i = 0; i < 20; i++) fa.ships.push(new ShipInstance("corvette"));
    for (let i = 0; i < 4; i++) fa.ships.push(new ShipInstance("destroyer"));

    const fb = new Fleet("enemy", "Vektor-9 Rajtaütők", 110, 45);
    for (let i = 0; i < 8; i++) fb.ships.push(new ShipInstance("destroyer"));
    for (let i = 0; i < 2; i++) fb.ships.push(new ShipInstance("battleship"));

    const result = CombatEngine.resolveCombat(fa, fb, 5);
    console.log("\n" + result.log);
    console.log(`\n>>> MINDEN TESZT SIKERESEN LEFUTOTT! <<<`);
}

if (process.argv.includes("--test")) {
    runTests();
}

module.exports = { SHIP_SPECS, ShipInstance, Fleet, CombatEngine };
