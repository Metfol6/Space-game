/**
 * SPACE 4X TACTICS - BACKEND SZERVER ÉS TICK FUTTATÓ (Node.js 24)
 * Zéró külső függőség! Natív HTTP és SQLite szerver REST API-val és MI-vel.
 */
// Ensure --experimental-sqlite is active if running on Node 22
try {
    require('node:sqlite');
} catch (e) {
    if (e.code === 'ERR_UNKNOWN_BUILTIN_MODULE' && !process.env._SQLITE_RESPAWNED) {
        const { spawnSync } = require('node:child_process');
        const res = spawnSync(process.execPath, ['--experimental-sqlite', ...process.argv.slice(1)], {
            stdio: 'inherit',
            env: { ...process.env, _SQLITE_RESPAWNED: '1' }
        });
        process.exit(res.status ?? (res.signal ? 1 : 0));
    }
}

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseService, ALL_SHIP_TYPES, SHIP_TECH_REQUIREMENTS, SHIP_UPGRADE_MODULES, SHIP_SUBSYSTEMS, SUBSYSTEM_HOTSPOTS, SUBSYSTEM_BONUS_TABLES } = require('./db');
const { AICommander } = require('./ai_commander');
const { SHIP_SPECS, CombatEngine, Fleet, ShipInstance } = require('./tick_runner');

const PORT = process.env.PORT || 3000;
const db = new DatabaseService();
const ai = new AICommander(db);

const TECH_TREE = {
    // 1. Ág: Ipar & Anyagtudomány
    deep_core_mining: {
        id: 'deep_core_mining',
        name: 'Mélységi Fúrás',
        branch: 'economy',
        branch_name: 'Ipar & Bányászat',
        tier: 1,
        prerequisites: [],
        duration_ticks: 3,
        cost_data: 80,
        cost_isotope: 25,
        icon: '⛏️',
        effect_desc: '+25% Fémtermelés minden birtokolt bolygón'
    },
    heavy_metallurgy: {
        id: 'heavy_metallurgy',
        name: 'Nehézfém Kohászat',
        branch: 'economy',
        branch_name: 'Ipar & Bányászat',
        tier: 2,
        prerequisites: ['deep_core_mining'],
        duration_ticks: 6,
        cost_data: 160,
        cost_isotope: 55,
        icon: '🔩',
        effect_desc: '+30% hajótest (Hull HP) minden hajóosztálynak'
    },
    automated_dock: {
        id: 'automated_dock',
        name: 'Automatizált Hajógyár',
        branch: 'economy',
        branch_name: 'Ipar & Bányászat',
        tier: 2,
        prerequisites: ['deep_core_mining', 'dark_matter_reactor'],
        duration_ticks: 8,
        cost_data: 200,
        cost_isotope: 70,
        icon: '🏭',
        effect_desc: '-20% hajógyártási Fémköltség'
    },
    nano_assembly: {
        id: 'nano_assembly',
        name: 'Nano-Összeszerelés',
        branch: 'economy',
        branch_name: 'Ipar & Bányászat',
        tier: 3,
        prerequisites: ['automated_dock', 'heavy_metallurgy'],
        duration_ticks: 12,
        cost_data: 320,
        cost_isotope: 110,
        icon: '💠',
        effect_desc: '+1 építési slot minden bolygón'
    },

    // 2. Ág: Energia & Reaktorok
    dark_matter_reactor: {
        id: 'dark_matter_reactor',
        name: 'Sötét Anyag Reaktor',
        branch: 'energy',
        branch_name: 'Energia & Reaktorok',
        tier: 1,
        prerequisites: [],
        duration_ticks: 3,
        cost_data: 80,
        cost_isotope: 25,
        icon: '⚛️',
        effect_desc: '+30% Energiatermelés minden bolygón'
    },
    superconductor_grid: {
        id: 'superconductor_grid',
        name: 'Szupervezető Hálózat',
        branch: 'energy',
        branch_name: 'Energia & Reaktorok',
        tier: 2,
        prerequisites: ['dark_matter_reactor'],
        duration_ticks: 6,
        cost_data: 160,
        cost_isotope: 55,
        icon: '⚡',
        effect_desc: '-25% épület energiafogyasztás (több marad a flottára)'
    },
    antimatter_containment: {
        id: 'antimatter_containment',
        name: 'Antianyag Csomópont',
        branch: 'energy',
        branch_name: 'Energia & Reaktorok',
        tier: 3,
        prerequisites: ['superconductor_grid', 'isotope_compression'],
        duration_ticks: 12,
        cost_data: 320,
        cost_isotope: 120,
        icon: '🌌',
        effect_desc: 'Planetáris pajzs és orbital railgun hatékonysága +50%'
    },

    // 3. Ág: Haditechnika & Védelem
    kinetic_calibration: {
        id: 'kinetic_calibration',
        name: 'Kinetikus Kalibráció',
        branch: 'military',
        branch_name: 'Haditechnika & Védelem',
        tier: 1,
        prerequisites: [],
        duration_ticks: 3,
        cost_data: 80,
        cost_isotope: 25,
        icon: '🎯',
        effect_desc: '+15% Korvett és Romboló sebzés csatában'
    },
    extended_shielding: {
        id: 'extended_shielding',
        name: 'Kiterjesztett Energiapajzs',
        branch: 'military',
        branch_name: 'Haditechnika & Védelem',
        tier: 2,
        prerequisites: ['kinetic_calibration', 'dark_matter_reactor'],
        duration_ticks: 7,
        cost_data: 180,
        cost_isotope: 65,
        icon: '🛡️',
        effect_desc: '+25% pajzskapacitás minden új hajón'
    },
    siege_warheads: {
        id: 'siege_warheads',
        name: 'Ostrom-töltetek',
        branch: 'military',
        branch_name: 'Haditechnika & Védelem',
        tier: 3,
        prerequisites: ['extended_shielding', 'heavy_metallurgy'],
        duration_ticks: 15,
        cost_data: 380,
        cost_isotope: 140,
        icon: '💥',
        effect_desc: '+50% Csatahajó sebzés csatában'
    },

    // 4. Ág: Hajtómű & Logisztika
    ion_thrusters: {
        id: 'ion_thrusters',
        name: 'Ionos Impulzus-hajtómű',
        branch: 'propulsion',
        branch_name: 'Hajtómű & Logisztika',
        tier: 1,
        prerequisites: [],
        duration_ticks: 3,
        cost_data: 80,
        cost_isotope: 25,
        icon: '🚀',
        effect_desc: '+25% sebesség minden hajóosztálynak'
    },
    isotope_compression: {
        id: 'isotope_compression',
        name: 'Izotóp-tömörítés',
        branch: 'propulsion',
        branch_name: 'Hajtómű & Logisztika',
        tier: 2,
        prerequisites: ['ion_thrusters'],
        duration_ticks: 6,
        cost_data: 160,
        cost_isotope: 55,
        icon: '🔋',
        effect_desc: '-30% Izotóp üzemanyagköltség indításkor'
    },
    hyperspace_gate: {
        id: 'hyperspace_gate',
        name: 'Hipertér-Ugrómotor',
        branch: 'propulsion',
        branch_name: 'Hajtómű & Logisztika',
        tier: 3,
        prerequisites: ['isotope_compression', 'superconductor_grid'],
        duration_ticks: 15,
        cost_data: 400,
        cost_isotope: 150,
        icon: '🌀',
        effect_desc: 'Flották minimális sebessége 6.0-ra nő'
    }
};

let recentAIActions = [];

// ============================================================================
// TICK KIÉRTÉKELŐ MOTOR (TICK PROCESSOR)
// ============================================================================

function processTick() {
    const nextTick = db.advanceGameTick();
    console.log(`\n>>> [SZERVER TICK #${nextTick}] Körkiértékelés indul...`);

    // 0. Kutatási Sor (Research Queue) befejeződéseinek kiértékelése
    const completedResearches = db.processResearchQueue(nextTick);
    for (const comp of completedResearches) {
        const tSpec = TECH_TREE[comp.techId];
        const tName = tSpec ? tSpec.name : comp.techId;
        console.log(`[KUTATÁS KÉSZ] ${comp.playerId === 'player' ? 'Játékos' : 'MI'} sikeresen kifejlesztette: ${tName}!`);
        if (comp.playerId === 'player') {
            recentAIActions.push(`[KUTATÁSI SIKER] Befejeződött a(z) '${tName}' kutatása! A bónusz aktiválódott.`);
        } else {
            recentAIActions.push(`[MI INTEL] Vektor-9 befejezte a(z) '${tName}' kutatását!`);
        }
    }

    // Időzített birodalmi bónuszok lejárata
    const expiredBuffs = db.processBuffExpirations(nextTick);
    for (const eb of expiredBuffs) {
        if (eb.player_id === 'player') {
            recentAIActions.push(`[⏳ BÓNUSZ LEJÁRT] A(z) '${eb.name}' hatása megszűnt.`);
        }
    }

    // 1. Gazdaság: Játékosok nyersanyagtermelése és Upkeep
    const players = [db.getPlayer('player'), db.getPlayer('enemy')].filter(Boolean);
    const allPlanets = db.getAllPlanets();
    const movingFleets = db.getMovingFleets();

    for (const player of players) {
        let netMetal = 0;
        let netEnergy = 0;

        const playerTechs = db.getPlayerResearch(player.id);
        const ownedPlanets = allPlanets.filter(p => p.owner_id === player.id);
        for (const p of ownedPlanets) {
            let m = p.base_metal_rate;
            if (playerTechs.includes('deep_core_mining')) {
                m *= 1.25;
            }
            const pBuffs = db.getPlayerBuffs(player.id, nextTick);
            if (pBuffs.some(b => b.buff_type === 'mining_boost')) {
                const mb = pBuffs.find(b => b.buff_type === 'mining_boost');
                m *= (1.0 + (mb.buff_value || 0.25));
            }
            let e = p.base_energy_rate;
            if (playerTechs.includes('dark_matter_reactor')) {
                e *= 1.30;
            }

            // Építmény bónuszok
            for (const s of p.structures) {
                if (s.structure_type === 'industrial_hub') m *= (1.0 + s.level * 0.25);
                
                let railgunUpkeep = playerTechs.includes('superconductor_grid') ? 9 : 12;
                let shieldUpkeep = playerTechs.includes('superconductor_grid') ? 7.5 : 10;
                if (s.structure_type === 'orbital_railgun') e -= railgunUpkeep;
                if (s.structure_type === 'planetary_shield') e -= shieldUpkeep;
            }
            netMetal += m;
            netEnergy += e;

            // Állomásozó hajók upkeep
            const sf = p.stationedFleet;
            netEnergy -= (sf.scout || 0) * SHIP_SPECS.scout.upkeep_energy;
            netEnergy -= (sf.corvette || 0) * SHIP_SPECS.corvette.upkeep_energy;
            netEnergy -= (sf.colony_ship || 0) * SHIP_SPECS.colony_ship.upkeep_energy;
            netEnergy -= (sf.destroyer || 0) * SHIP_SPECS.destroyer.upkeep_energy;
            netEnergy -= (sf.battleship || 0) * SHIP_SPECS.battleship.upkeep_energy;
        }

        // Mozgó flották upkeep
        const ownedMoving = movingFleets.filter(f => f.owner_id === player.id);
        for (const f of ownedMoving) {
            netEnergy -= (f.ships.scout || 0) * SHIP_SPECS.scout.upkeep_energy;
            netEnergy -= (f.ships.corvette || 0) * SHIP_SPECS.corvette.upkeep_energy;
            netEnergy -= (f.ships.colony_ship || 0) * SHIP_SPECS.colony_ship.upkeep_energy;
            netEnergy -= (f.ships.destroyer || 0) * SHIP_SPECS.destroyer.upkeep_energy;
            netEnergy -= (f.ships.battleship || 0) * SHIP_SPECS.battleship.upkeep_energy;
        }

        player.metal += netMetal;
        player.energy += netEnergy;
        player.isotope += 3;
        player.data_points += 10;

        db.updatePlayerResources(player.id, player.metal, player.energy, player.isotope, player.data_points);
    }

    // 2. Mozgó flották léptetése és Érkezések ellenőrzése
    // 2/A. Kereskedelmi Expedíciók állapotfrissítése (Megérkezés, 3 körös dokkolás, automatikus hazaindulás, hazaérkezés)
    const tradeEvents = db.updateTradeExpeditionsTick(nextTick);
    for (const ev of tradeEvents) {
        console.log(ev.message);
    }

    // 2. Mozgó flották léptetése és Érkezések ellenőrzése
    for (const fleet of movingFleets) {
        if (nextTick >= fleet.arrival_tick) {
            // Flotta megérkezett a célállomásra!
            fleet.current_x = fleet.dest_x;
            fleet.current_y = fleet.dest_y;
            const targetPlanet = allPlanets.find(p => p.id === fleet.target_planet_id);

            if (targetPlanet) {
                const isPureScout = (fleet.ships.scout > 0) &&
                    (fleet.ships.interceptor || 0) === 0 &&
                    (fleet.ships.corvette || 0) === 0 &&
                    (fleet.ships.frigate || 0) === 0 &&
                    (fleet.ships.destroyer || 0) === 0 &&
                    (fleet.ships.heavy_destroyer || 0) === 0 &&
                    (fleet.ships.cruiser || 0) === 0 &&
                    (fleet.ships.battleship || 0) === 0;

                if (targetPlanet.is_trade_station || targetPlanet.id === 'station_trade') {
                    // Kereskedelmi állomás dokkolás: A flotta dokkol a piacon, nem töröljük!
                    console.log(`[KERESKEDELMI DOKKOLÁS] ${fleet.name} sikeresen megérkezett a(z) ${targetPlanet.name} állomásra.`);
                    fleet.current_x = targetPlanet.pos_x || 410;
                    fleet.current_y = targetPlanet.pos_y || 290;
                    db.db.prepare("UPDATE fleets SET state = 'stationed', current_x = ?, current_y = ? WHERE id = ?").run(fleet.current_x, fleet.current_y, fleet.id);
                    continue;
                } else if (isPureScout && (targetPlanet.is_bot || targetPlanet.owner_id !== fleet.owner_id)) {
                    // Tachion Felderítési Akció (Harc nélküli kémkedés)
                    _resolveScoutMission(fleet, targetPlanet, nextTick);
                } else if (targetPlanet.owner_id === fleet.owner_id) {
                    // Saját bolygó: flotta összevonása
                    _mergeFleetIntoPlanet(fleet, targetPlanet);
                } else if (db.isAllied(targetPlanet.owner_id, fleet.owner_id)) {
                    // Szövetséges bolygó: Védelmi Erősítésként beáll az állomásozó helyőrségbe!
                    _stationAlliedDefense(fleet, targetPlanet, nextTick);
                } else if (targetPlanet.owner_id === null || targetPlanet.owner_id === 'neutral') {
                    // Semleges bolygó: csak akkor kolonizálható, ha van legalább 1 Kolóniahajó!
                    if (fleet.ships.colony_ship > 0) {
                        fleet.ships.colony_ship -= 1; // A kolóniahajó feláldozza magát az új bázis alapításához
                        targetPlanet.owner_id = fleet.owner_id;
                        db.db.prepare('UPDATE planets SET owner_id = ? WHERE id = ?').run(fleet.owner_id, targetPlanet.id);
                        _mergeFleetIntoPlanet(fleet, targetPlanet);
                        console.log(`[KOLONIZÁCIÓ SIKERES] ${fleet.name} telepes bárkája benépesítette a(z) ${targetPlanet.name} világot!`);
                    } else {
                        console.log(`[FELDERÍTÉS] ${fleet.name} elérte a(z) ${targetPlanet.name} semleges világot (nem hozott Kolóniahajót, így nem kolonizálható).`);
                        _mergeFleetIntoPlanet(fleet, targetPlanet);
                    }
                } else if (targetPlanet.is_bot) {
                    // Bot világ vagy Boss elleni csata & rejtett loot feltárás
                    _resolveBotPlanetBattle(fleet, targetPlanet, nextTick);
                } else {
                    // Ellenséges bolygó: Csatamechanika!
                    _resolvePlanetBattle(fleet, targetPlanet, nextTick);
                }
            }
            // Tranzit törlése
            db.db.prepare('DELETE FROM fleet_ships WHERE fleet_id = ?').run(fleet.id);
            db.db.prepare('DELETE FROM fleets WHERE id = ?').run(fleet.id);
        } else {
            // Útközben: Pozíció interpolálása
            const totalTicks = fleet.arrival_tick - fleet.departure_tick;
            const elapsed = nextTick - fleet.departure_tick;
            const progress = Math.min(1.0, elapsed / Math.max(1, totalTicks));
            const curX = fleet.current_x + (fleet.dest_x - fleet.current_x) * progress;
            const curY = fleet.current_y + (fleet.dest_y - fleet.current_y) * progress;
            db.db.prepare('UPDATE fleets SET current_x = ?, current_y = ? WHERE id = ?').run(curX, curY, fleet.id);
        }
    }

    // 3. Autonóm MI döntések lefutása (csak ha a Vektor-9 MI irányítású és nem emberi játékos)
    const enemyPlayer = db.getPlayer('enemy');
    if (enemyPlayer && enemyPlayer.is_ai) {
        recentAIActions = ai.evaluateTick(nextTick);
        if (recentAIActions.length > 0) {
            recentAIActions.forEach(a => console.log(`  ${a}`));
        }
    } else {
        recentAIActions = [];
    }

    // 4/A. Ütemezett Szövetségi Hadműveletek Automatikus Indítása
    const openOps = db.db.prepare("SELECT id FROM alliance_operations WHERE status = 'recruiting' AND target_tick <= ?").all(nextTick);
    for (const opRow of openOps) {
        console.log(`[SZÖVETSÉGI TÁMADÁS AUTOMATIKUS INDÍTÁSA] Hadművelet: ${opRow.id} (Elérte a célkört: #${nextTick})`);
        _executeAllianceOperation(opRow.id);
    }

    // 4. Küldetésellenőrzés
    _evaluateMissions();

    return { tick: nextTick, aiActions: recentAIActions };
}

function _stationAlliedDefense(fleet, targetPlanet, tick) {
    const defenseFleetId = `f_def_${fleet.owner_id}_${targetPlanet.id}_${Date.now()}`;
    const pOwner = db.getPlayer(fleet.owner_id);
    const ownerName = pOwner ? pOwner.username : fleet.owner_id;
    const fleetName = `Szövetségi Védelem (${ownerName})`;
    db.db.prepare(`
        INSERT INTO fleets (id, owner_id, name, current_x, current_y, origin_planet_id, target_planet_id, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'stationed')
    `).run(defenseFleetId, fleet.owner_id, fleetName, targetPlanet.pos_x, targetPlanet.pos_y, targetPlanet.id, targetPlanet.id);

    const insShip = db.db.prepare(`INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const st of ALL_SHIP_TYPES) {
        const count = fleet.ships[st] || 0;
        if (count > 0) {
            const spec = SHIP_SPECS[st] || { hull: 100, shield: 0 };
            insShip.run(`${defenseFleetId}_${st}`, defenseFleetId, st, count, count * spec.hull, count * spec.shield);
        }
    }

    db.stationDefenseFleet(targetPlanet.id, fleet.owner_id, defenseFleetId, tick);
    const msg = `[🛡️ SZÖVETSÉGES VÉDELEM] ${ownerName} védelmi flottája megérkezett a(z) ${targetPlanet.name} világra és beállt a helyőrségbe!`;
    recentAIActions.push(msg);
    console.log(msg);
}

function _executeAllianceOperation(opId) {
    const op = db.getOperation(opId);
    if (!op || op.status !== 'recruiting') {
        return { error: "A hadművelet nem található vagy már nem aktív!" };
    }
    if (op.participants.length === 0) {
        return { error: "Nincs egyetlen résztvevő sem a hadműveletben!" };
    }

    const curTick = db.getGameState();
    const participantCount = op.participants.length;

    if (op.target_type === 'boss') {
        const boss = db.getBossState(op.target_id);
        if (!boss || boss.state === 'defeated') {
            return { error: "Ez a Boss Citadella már megsemmisült vagy nem létezik!" };
        }

        // Összeállítjuk az egyesített szövetségi armadát
        const armada = new Fleet(op.creator_id, `Szövetségi Ostrom Armada (${op.target_name})`, boss.pos_x, boss.pos_y, [], []);
        for (const part of op.participants) {
            const pTechs = db.getPlayerResearch(part.player_id);
            const pUpgs = db.getShipUpgrades(part.player_id);
            const pBuffs = db.getPlayerBuffs(part.player_id, curTick);

            for (const [st, cnt] of Object.entries(part.shipsParsed || {})) {
                for (let i = 0; i < cnt; i++) {
                    const inst = new ShipInstance(st, pTechs, pUpgs[st], pBuffs);
                    inst.ownerId = part.player_id;
                    armada.ships.push(inst);
                }
            }
        }

        const creatorTechs = db.getPlayerResearch(op.creator_id);
        const combatResult = CombatEngine.resolveBossCombat(armada, boss, creatorTechs, 8, participantCount);

        if (combatResult.bossDefeated) {
            db.updateBossState(op.target_id, 0, 0, 'defeated', curTick);
            const salvageM = combatResult.salvageMetal || boss.salvage_metal || 7500;
            const salvageI = combatResult.salvageIsotope || boss.salvage_isotope || 3000;
            const baseGlory = op.target_id === 'boss_1' ? 400 : (op.target_id === 'boss_2' ? 800 : 1600);

            // Zsákmány szétosztása a résztvevők között
            const shareM = Math.round(salvageM / participantCount);
            const shareI = Math.round(salvageI / participantCount);
            const shareG = Math.round(baseGlory / participantCount);

            for (const part of op.participants) {
                const p = db.getPlayer(part.player_id);
                if (p) {
                    p.metal += shareM;
                    p.isotope += shareI;
                    p.glory_points = (p.glory_points || 0) + shareG;
                    db.updatePlayerResources(p.id, p.metal, p.energy, p.isotope, p.data_points);
                    db.db.prepare("UPDATE players SET glory_points = ? WHERE id = ?").run(p.glory_points, p.id);

                    if (op.target_id === 'boss_1') db.db.prepare("UPDATE missions SET status = 'completed' WHERE id = 'm7'").run();
                    if (op.target_id === 'boss_2') db.db.prepare("UPDATE missions SET status = 'completed' WHERE id = 'm8'").run();
                    if (op.target_id === 'boss_3') db.db.prepare("UPDATE missions SET status = 'completed' WHERE id = 'm9'").run();
                }
            }

            const winMsg = `[👑 SZÖVETSÉGI DIADAL!] A(z) ${op.target_name} elesett! ${participantCount} parancsnok osztozik a zsákmányon (fejenként: +${shareG} GP, +${shareM} Fém, +${shareI} Izotóp)!`;
            recentAIActions.push(winMsg);
            db.saveCombatLog(curTick, boss.pos_x, boss.pos_y, boss.name, op.creator_id, op.target_id, op.creator_id, combatResult.log, salvageM, salvageI);
        } else {
            db.updateBossState(op.target_id, combatResult.finalBossHull, combatResult.finalBossShield, 'active', null);
            const retreatMsg = `[MEGTORPANÁS] A szövetségi hadtest visszavonult a(z) '${boss.name}' elől!`;
            recentAIActions.push(retreatMsg);
            db.saveCombatLog(curTick, boss.pos_x, boss.pos_y, boss.name, op.creator_id, op.target_id, op.target_id, combatResult.log, 0, 0);
        }

        // Túlélő hajók visszajuttatása a tulajdonosok bázisára
        for (const ship of armada.ships) {
            if (ship.isAlive && ship.ownerId) {
                const basePlanet = db.db.prepare("SELECT id FROM planets WHERE owner_id = ? ORDER BY id ASC LIMIT 1").get(ship.ownerId);
                if (basePlanet) {
                    const sf = db.db.prepare("SELECT id FROM fleets WHERE origin_planet_id = ? AND state = 'stationed'").get(basePlanet.id);
                    if (sf) {
                        const existing = db.db.prepare("SELECT id FROM fleet_ships WHERE fleet_id = ? AND ship_type = ?").get(sf.id, ship.shipType);
                        if (existing) {
                            db.db.prepare("UPDATE fleet_ships SET count = count + 1 WHERE fleet_id = ? AND ship_type = ?").run(sf.id, ship.shipType);
                        } else {
                            db.db.prepare("INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total) VALUES (?, ?, ?, 1, 100, 0)").run(`${sf.id}_${ship.shipType}`, sf.id, ship.shipType);
                        }
                    }
                }
            }
        }

        db.db.prepare("UPDATE alliance_operations SET status = 'completed' WHERE id = ?").run(opId);
        return { success: true, combatResult, bossDefeated: combatResult.bossDefeated };
    } else {
        // Célpont: Más játékos bolygója vagy bot világ
        const planets = db.getAllPlanets();
        const targetPlanet = planets.find(p => p.id === op.target_id || p.owner_id === op.target_id);
        if (!targetPlanet) return { error: "A célpont bolygó nem található!" };

        // Szövetséges ellenőrzés
        if (db.isAllied(op.creator_id, targetPlanet.owner_id)) {
            return { error: "A célpont a szövetségesed birtokában van!" };
        }

        const armada = new Fleet(op.creator_id, `Szövetségi Hadtest (${op.target_name})`, targetPlanet.pos_x, targetPlanet.pos_y, [], []);
        for (const part of op.participants) {
            const pTechs = db.getPlayerResearch(part.player_id);
            const pUpgs = db.getShipUpgrades(part.player_id);
            const pBuffs = db.getPlayerBuffs(part.player_id, curTick);

            for (const [st, cnt] of Object.entries(part.shipsParsed || {})) {
                for (let i = 0; i < cnt; i++) {
                    const inst = new ShipInstance(st, pTechs, pUpgs[st], pBuffs);
                    inst.ownerId = part.player_id;
                    armada.ships.push(inst);
                }
            }
        }

        // Védő sereg: helyőrség + szövetséges védelmi erők
        const defenderOwnerId = targetPlanet.owner_id || 'bot_hostile';
        const defenderTechs = targetPlanet.owner_id ? db.getPlayerResearch(targetPlanet.owner_id) : [];
        const defenderBuffs = targetPlanet.owner_id ? db.getPlayerBuffs(targetPlanet.owner_id, curTick) : [];
        const fb = new Fleet(defenderOwnerId, `${targetPlanet.name} Helyőrség & Szövetségi Védelem`, targetPlanet.pos_x, targetPlanet.pos_y, defenderTechs, defenderBuffs);

        // Alap helyőrség
        const sf = targetPlanet.stationedFleet;
        for (const st of ALL_SHIP_TYPES) {
            const cnt = sf[st] || 0;
            for (let i = 0; i < cnt; i++) fb.ships.push(new ShipInstance(st, defenderTechs, {}, defenderBuffs));
        }

        // Szövetséges állomásozó védelem hozzáadása
        const stationedDefenses = db.getStationedDefenseFleets(targetPlanet.id);
        for (const def of stationedDefenses) {
            const defTechs = db.getPlayerResearch(def.owner_id);
            const defUpgs = db.getShipUpgrades(def.owner_id);
            for (const [st, cnt] of Object.entries(def.ships || {})) {
                for (let i = 0; i < cnt; i++) {
                    fb.ships.push(new ShipInstance(st, defTechs, defUpgs[st], []));
                }
            }
        }

        const creatorTechs = db.getPlayerResearch(op.creator_id);
        const combatResult = CombatEngine.resolveCombat(armada, fb, 5, creatorTechs, defenderTechs);

        if (combatResult.winnerId === op.creator_id) {
            // Támadók győztek!
            if (targetPlanet.is_bot) {
                db.claimBotLoot(targetPlanet.id, op.creator_id);
                db.db.prepare("UPDATE planets SET owner_id = ?, status = 'looted', loot_revealed = 1 WHERE id = ?").run(op.creator_id, targetPlanet.id);
            } else {
                db.db.prepare("UPDATE planets SET owner_id = ? WHERE id = ?").run(op.creator_id, targetPlanet.id);
                // Védelmi erők elestek
                db.db.prepare("DELETE FROM allied_defense_fleets WHERE planet_id = ?").run(targetPlanet.id);
            }

            // Dicsőség szétosztása
            const baseGlory = combatResult.baseGlory || 150;
            const shareG = Math.round(baseGlory / participantCount);
            for (const part of op.participants) {
                const p = db.getPlayer(part.player_id);
                if (p) {
                    p.glory_points = (p.glory_points || 0) + shareG;
                    db.db.prepare("UPDATE players SET glory_points = ? WHERE id = ?").run(p.glory_points, p.id);
                }
            }

            const winMsg = `[⚔️ SZÖVETSÉGI OSTROM SIKER] A hadtest bevette a(z) ${targetPlanet.name} világot! (+${shareG} GP / résztvevő)`;
            recentAIActions.push(winMsg);
            db.saveCombatLog(curTick, targetPlanet.pos_x, targetPlanet.pos_y, targetPlanet.name, op.creator_id, defenderOwnerId, op.creator_id, combatResult.log, combatResult.salvageMetal, combatResult.salvageIsotope);
        } else {
            const defMsg = `[🛡️ VÉDELMI SIKER] A(z) ${targetPlanet.name} védői sikeresen visszaverték a szövetségi támadást!`;
            recentAIActions.push(defMsg);
            db.saveCombatLog(curTick, targetPlanet.pos_x, targetPlanet.pos_y, targetPlanet.name, op.creator_id, defenderOwnerId, defenderOwnerId, combatResult.log, combatResult.salvageMetal, combatResult.salvageIsotope);
        }

        // Túlélők visszatérése
        for (const ship of armada.ships) {
            if (ship.isAlive && ship.ownerId) {
                const basePlanet = db.db.prepare("SELECT id FROM planets WHERE owner_id = ? ORDER BY id ASC LIMIT 1").get(ship.ownerId);
                if (basePlanet) {
                    const sf = db.db.prepare("SELECT id FROM fleets WHERE origin_planet_id = ? AND state = 'stationed'").get(basePlanet.id);
                    if (sf) {
                        const existing = db.db.prepare("SELECT id FROM fleet_ships WHERE fleet_id = ? AND ship_type = ?").get(sf.id, ship.shipType);
                        if (existing) {
                            db.db.prepare("UPDATE fleet_ships SET count = count + 1 WHERE fleet_id = ? AND ship_type = ?").run(sf.id, ship.shipType);
                        } else {
                            db.db.prepare("INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total) VALUES (?, ?, ?, 1, 100, 0)").run(`${sf.id}_${ship.shipType}`, sf.id, ship.shipType);
                        }
                    }
                }
            }
        }

        db.db.prepare("UPDATE alliance_operations SET status = 'completed' WHERE id = ?").run(opId);
        return { success: true, combatResult, victory: combatResult.winnerId === op.creator_id };
    }
}

function _mergeFleetIntoPlanet(fleet, planet) {
    const sf = planet.stationedFleet;
    const upd = db.db.prepare(`UPDATE fleet_ships SET count = count + ? WHERE fleet_id = ? AND ship_type = ?`);
    for (const st of ALL_SHIP_TYPES) {
        const count = fleet.ships[st] || 0;
        if (count > 0) upd.run(count, sf.fleetId, st);
    }
}

function _resolveScoutMission(fleet, targetPlanet, tick) {
    const scoutCount = fleet.ships.scout || 1;
    const upg = db.getShipUpgrades(fleet.owner_id);
    const sensorLvl = (upg.scout && upg.scout.sensors) || 0;
    const stealthLvl = (upg.scout && upg.scout.stealth) || 0;
    const hullLvl = (upg.scout && upg.scout.hull) || 0;

    const reconPowerPerScout = 1 + sensorLvl;
    const totalReconPower = scoutCount * reconPowerPerScout;

    let requiredPower = 6;
    if (targetPlanet.bot_type === 'boss') requiredPower = 90;
    else if (targetPlanet.difficulty_tier === 3) requiredPower = 35;
    else if (targetPlanet.difficulty_tier === 2) requiredPower = 18;
    else if (targetPlanet.difficulty_tier === 1) requiredPower = 6;
    else if (targetPlanet.owner_id && targetPlanet.owner_id !== fleet.owner_id) requiredPower = 25;

    const isSuccess = totalReconPower >= requiredPower;
    const stealthChance = Math.min(0.98, 0.40 + stealthLvl * 0.06);
    const undetected = Math.random() <= stealthChance;

    let survivingScouts = scoutCount;
    if (!undetected) {
        const lost = Math.min(scoutCount, Math.max(1, Math.floor(scoutCount * (0.35 - hullLvl * 0.02))));
        survivingScouts = Math.max(0, scoutCount - lost);
    }

    if (isSuccess) {
        db.scoutPlanet(targetPlanet.id, fleet.owner_id);
        const lootDesc = targetPlanet.loot_type ? (targetPlanet.loot_type === 'artifact' ? 'Ősi Ereklye' : (targetPlanet.loot_type === 'glory' ? 'Kozmikus Dicsőség' : 'Nyersanyag Raktár')) : 'Ismeretlen';
        const msg = `[🕵️ TACHION FELDERÍTÉS SIKERES] ${scoutCount} db szonda feltárta a(z) ${targetPlanet.name} világot! (Erő: ${totalReconPower}/${requiredPower}) • Felfedett kincs: ${lootDesc} • Túlélő szondák: ${survivingScouts}/${scoutCount}`;
        recentAIActions.push(msg);
        console.log(msg);
    } else {
        const msg = `[⚠️ FELDERÍTÉS SIKERTELEN] A szondák nem tudták áttörni az interferenciát ${targetPlanet.name} felett! (Elért erő: ${totalReconPower}, szükséges: ${requiredPower}) • Túlélők: ${survivingScouts}/${scoutCount}`;
        recentAIActions.push(msg);
        console.log(msg);
    }

    // Túlélő szondák visszatérése a kiindulási bolygóra
    if (survivingScouts > 0 && fleet.origin_planet_id) {
        const origin = db.getAllPlanets().find(p => p.id === fleet.origin_planet_id);
        if (origin) {
            fleet.ships.scout = survivingScouts;
            _mergeFleetIntoPlanet(fleet, origin);
        }
    }
}

function _evaluateMissions(targetPlayerId = 'player') {
    const allPlanets = db.getAllPlanets();
    const playerPlanets = allPlanets.filter(p => p.owner_id === targetPlayerId);
    const missions = db.getMissions();
    const player = db.getPlayer(targetPlayerId) || db.getPlayer('player');
    const glory = player ? (player.glory_points || 0) : 0;
    const bosses = db.getAllBosses();

    for (const m of missions) {
        if (m.status !== 'active') continue;

        let completed = false;
        if (m.id === 'm1') {
            const p1 = playerPlanets.find(p => p.id === 'p1');
            if (p1 && p1.structures.some(s => s.structure_type === 'industrial_hub' && s.level >= 2)) {
                completed = true;
            }
        } else if (m.id === 'm2') {
            const scoutCount = playerPlanets.reduce((acc, p) => acc + (p.stationedFleet.scout || 0), 0);
            const p2 = allPlanets.find(p => p.id === 'p2');
            if (scoutCount >= 1 || (p2 && p2.stationedFleet.scout >= 1)) {
                completed = true;
            }
        } else if (m.id === 'm3') {
            const cTotal = playerPlanets.reduce((acc, p) => acc + (p.stationedFleet.corvette || 0), 0);
            const dTotal = playerPlanets.reduce((acc, p) => acc + (p.stationedFleet.destroyer || 0), 0);
            if (cTotal >= 8 || dTotal >= 3) {
                completed = true;
            }
        } else if (m.id === 'm4') {
            if (playerPlanets.length >= 2) {
                completed = true;
            }
        } else if (m.id === 'm5') {
            if (playerPlanets.length >= 3) {
                completed = true;
            }
        } else if (m.id === 'm6') {
            if (glory >= 100) {
                completed = true;
            }
        } else if (m.id === 'm7') {
            const b1 = bosses.find(b => b.id === 'boss_1');
            if (b1 && b1.state === 'defeated') completed = true;
        } else if (m.id === 'm8') {
            const b2 = bosses.find(b => b.id === 'boss_2');
            if (b2 && b2.state === 'defeated') completed = true;
        } else if (m.id === 'm9') {
            const b3 = bosses.find(b => b.id === 'boss_3');
            if (b3 && b3.state === 'defeated') completed = true;
        }

        if (completed) {
            db.db.prepare("UPDATE missions SET status = 'completed' WHERE id = ?").run(m.id);
            console.log(`[KÜLDETÉS TELJESÍTVE!] ${m.title}: ${m.reward_text}`);
        }
    }
}


function _resolveBotPlanetBattle(attackerFleet, planet, tick) {
    const defenderFleet = planet.stationedFleet;
    console.log(`[BOT HARC DETEKTÁLVA] ${planet.name} bolygónál! Támadó: ${attackerFleet.owner_id} vs Bot helyőrség`);

    const techsA = db.getPlayerResearch(attackerFleet.owner_id);
    const buffsA = db.getPlayerBuffs(attackerFleet.owner_id, tick);
    const upgA = db.getShipUpgrades(attackerFleet.owner_id);

    const fa = new Fleet(attackerFleet.owner_id, attackerFleet.name, planet.pos_x, planet.pos_y, techsA, buffsA);
    for (const st of ALL_SHIP_TYPES) {
        const cnt = attackerFleet.ships[st] || 0;
        for (let i = 0; i < cnt; i++) fa.ships.push(new ShipInstance(st, techsA, upgA[st], buffsA));
    }

    const fb = new Fleet(planet.owner_id || 'bot_hostile', `${planet.name} Védelmi Erő`, planet.pos_x, planet.pos_y, [], []);
    for (const st of ALL_SHIP_TYPES) {
        const cnt = defenderFleet[st] || 0;
        for (let i = 0; i < cnt; i++) fb.ships.push(new ShipInstance(st, [], {}, []));
    }

    // Ha ez a 3 Fő Boss egyike, bevonjuk a Boss旗舰/kolosszust is
    if (planet.bot_type === 'boss') {
        const bossState = db.getBossState(planet.id);
        if (bossState && bossState.state !== 'defeated') {
            const bossUnit = new ShipInstance('battleship', [], {}, []);
            bossUnit.hull = bossState.hull;
            bossUnit.maxHull = bossState.max_hull;
            bossUnit.shield = bossState.shield;
            bossUnit.maxShield = bossState.max_shield;
            bossUnit.damage = bossState.damage || 400;
            bossUnit.customName = bossState.name;
            fb.ships.push(bossUnit);
        }
    }

    const battleResult = CombatEngine.resolveCombat(fa, fb, 5, techsA, []);

    let lootResult = null;
    if (battleResult.winnerId === attackerFleet.owner_id) {
        // Támadó győzött: Rejtett zsákmány felfedése és jóváírása!
        lootResult = db.claimBotLoot(planet.id, attackerFleet.owner_id);
        const winName = attackerFleet.owner_id === 'player' ? 'Kronos Parancsnok' : 'Vektor-9 Parancsnok';
        const msg = `[💥 GYŐZELEM & ZSÁKMÁNY] ${winName} megtörte a(z) ${planet.name} védelmét! Zsákmány: ${lootResult ? lootResult.rewardSummary : 'Ismeretlen'}`;
        recentAIActions.push(msg);
        console.log(msg);

        // Bolygó státusz frissítése
        db.db.prepare("UPDATE planets SET owner_id = ?, status = 'looted', loot_revealed = 1 WHERE id = ?").run(attackerFleet.owner_id, planet.id);
    } else {
        recentAIActions.push(`[⚔️ VISSZAVERVE] A(z) ${planet.name} védelmi erői visszaverték a támadást!`);
    }

    // Csatariport mentése
    let extraLog = battleResult.log;
    if (lootResult) {
        extraLog += `\n\n=== MEGSZERZETT ZSÁKMÁNY ===\n${lootResult.rewardSummary}\nA zsákmány automatikusan jóváírva a birodalmad számláján!`;
    }

    db.saveCombatLog(
        tick, planet.pos_x, planet.pos_y, planet.name,
        attackerFleet.owner_id, planet.owner_id || 'bot_hostile', battleResult.winnerId,
        extraLog, battleResult.salvageMetal, battleResult.salvageIsotope
    );

    // Túlélő hajók szinkronizálása
    for (const st of ALL_SHIP_TYPES) {
        const count = battleResult.winnerId === attackerFleet.owner_id ? fa.countByType(st) : fb.countByType(st);
        const row = db.db.prepare('SELECT id FROM fleet_ships WHERE fleet_id = ? AND ship_type = ?').get(defenderFleet.fleetId, st);
        if (row) {
            db.db.prepare('UPDATE fleet_ships SET count = ? WHERE fleet_id = ? AND ship_type = ?').run(count, defenderFleet.fleetId, st);
        } else if (count > 0) {
            db.db.prepare('INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total) VALUES (?, ?, ?, ?, ?, ?)')
                .run(`${defenderFleet.fleetId}_${st}`, defenderFleet.fleetId, st, count, count * (SHIP_SPECS[st]?.hull || 100), 0);
        }
    }
}

function _resolvePlanetBattle(attackerFleet, planet, tick) {
    const defenderFleet = planet.stationedFleet;
    console.log(`[HARC DETEKTÁLVA] ${planet.name} bolygónál! Támadó: ${attackerFleet.owner_id} vs Védő: ${planet.owner_id}`);

    const techsA = db.getPlayerResearch(attackerFleet.owner_id);
    const techsB = db.getPlayerResearch(planet.owner_id);
    const playerUpgrades = db.getShipUpgrades('player');
    const enemyUpgrades = db.getShipUpgrades('enemy');
    const upgA = attackerFleet.owner_id === 'player' ? playerUpgrades : enemyUpgrades;
    const upgB = planet.owner_id === 'player' ? playerUpgrades : enemyUpgrades;
    const buffsA = db.getPlayerBuffs(attackerFleet.owner_id, tick);
    const buffsB = db.getPlayerBuffs(planet.owner_id, tick);

    const fa = new Fleet(attackerFleet.owner_id, attackerFleet.name, planet.pos_x, planet.pos_y, techsA, buffsA);
    for (const st of ALL_SHIP_TYPES) {
        const cnt = attackerFleet.ships[st] || 0;
        for (let i = 0; i < cnt; i++) fa.ships.push(new ShipInstance(st, techsA, upgA[st], buffsA));
    }

    const fb = new Fleet(planet.owner_id, `${planet.name} Helyőrség`, planet.pos_x, planet.pos_y, techsB, buffsB);
    for (const st of ALL_SHIP_TYPES) {
        const cnt = defenderFleet[st] || 0;
        for (let i = 0; i < cnt; i++) fb.ships.push(new ShipInstance(st, techsB, upgB[st], buffsB));
    }

    // Szövetséges állomásozó védelmi flotta bevonása a védelembe!
    const stationedDefenses = db.getStationedDefenseFleets(planet.id);
    for (const def of stationedDefenses) {
        const defTechs = db.getPlayerResearch(def.owner_id);
        const defUpgs = db.getShipUpgrades(def.owner_id);
        for (const [st, cnt] of Object.entries(def.ships || {})) {
            for (let i = 0; i < cnt; i++) {
                fb.ships.push(new ShipInstance(st, defTechs, defUpgs[st], []));
            }
        }
    }

    const battleResult = CombatEngine.resolveCombat(fa, fb, 5, techsA, techsB);

    // Dicsőség pontok kiszámítása csökkenő hozadékkal
    if (battleResult.winnerId) {
        const loserId = battleResult.winnerId === attackerFleet.owner_id ? planet.owner_id : attackerFleet.owner_id;
        const gloryRes = db.calculateGloryAward(battleResult.winnerId, loserId, tick, battleResult.baseGlory || 100);
        const winName = battleResult.winnerId === 'player' ? 'Parancsnok' : 'Vektor-9';
        recentAIActions.push(`[🏆 DICSŐSÉG] ${winName} +${gloryRes.gloryAwarded} Dicsőség Pontot aratott! (${Math.round(gloryRes.multiplier * 100)}% szorzó, #${gloryRes.attackCount}. támadás e célpont ellen).`);
    }

    // Eredmény mentése az adatbázisba
    db.saveCombatLog(
        tick, planet.pos_x, planet.pos_y, planet.name,
        attackerFleet.owner_id, planet.owner_id, battleResult.winnerId,
        battleResult.log, battleResult.salvageMetal, battleResult.salvageIsotope
    );

    // Bolygó és állomásozó flotta frissítése
    const winningFleet = battleResult.winnerId === attackerFleet.owner_id ? fa : fb;
    if (battleResult.winnerId === attackerFleet.owner_id) {
        // Támadó győzött: Bolygó elfoglalása!
        db.db.prepare('UPDATE planets SET owner_id = ? WHERE id = ?').run(attackerFleet.owner_id, planet.id);
    }

    const updateShip = (shipType, count) => {
        const row = db.db.prepare('SELECT id FROM fleet_ships WHERE fleet_id = ? AND ship_type = ?').get(defenderFleet.fleetId, shipType);
        if (row) {
            db.db.prepare('UPDATE fleet_ships SET count = ? WHERE fleet_id = ? AND ship_type = ?').run(count, defenderFleet.fleetId, shipType);
        } else if (count > 0) {
            db.db.prepare('INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total) VALUES (?, ?, ?, ?, ?, ?)')
                .run(`${defenderFleet.fleetId}_${shipType}`, defenderFleet.fleetId, shipType, count, count * (SHIP_SPECS[shipType]?.hull || 100), 0);
        }
    };

    for (const st of ALL_SHIP_TYPES) {
        const surv = winningFleet.countByType(st);
        updateShip(st, surv);
    }
}

// ============================================================================
// HTTP SZERVER ÉS REST API KEZELŐ
// ============================================================================

// Segédfüggvény a kérést indító játékos azonosításához (PvP Multi-Commander)
function _getReqPlayerId(req, parsedUrl, body) {
    if (body && body.playerId) return body.playerId;
    if (req && req.headers && req.headers['x-player-id']) return req.headers['x-player-id'];
    if (parsedUrl && parsedUrl.searchParams && parsedUrl.searchParams.get('playerId')) {
        return parsedUrl.searchParams.get('playerId');
    }
    return 'player';
}

const server = http.createServer((req, res) => {
    // CORS engedélyezése
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // --- REST API VÉGPONTOK (PvP Multi-Commander Támogatással) ---
    if (pathname === '/api/state' && req.method === 'GET') {
        const playerId = _getReqPlayerId(req, parsedUrl);
        const playerObj = db.getPlayer(playerId) || db.getPlayer('player');
        _evaluateMissions(playerObj.id);
        const opponentId = playerObj.id === 'player' ? 'enemy' : 'player';
        const allPlanets = db.getAllPlanets();
        const movingFleets = db.getMovingFleets();
        const incomingThreats = movingFleets.filter(f => 
            f.owner_id !== playerObj.id && 
            allPlanets.some(p => p.id === f.target_planet_id && p.owner_id === playerObj.id)
        );
        const freighterCargo = db.getFreighterCargoCapacity(playerObj.id);
        const tradeStation = allPlanets.find(p => p.is_trade_station === 1 || p.id === 'station_trade');

        const state = {
            tick: db.getGameState(),
            currentPlayerId: playerObj.id,
            player: playerObj,
            gloryPoints: playerObj?.glory_points || 0,
            activeBuffs: db.getPlayerBuffs(playerObj.id),
            artifacts: db.getPlayerArtifacts(playerObj.id),
            planets: allPlanets,
            movingFleets,
            incomingThreats,
            freighterCargo,
            tradeStation,
            combatLogs: db.getCombatLogs(10),
            missions: db.getMissions(),
            techTree: TECH_TREE,
            researchedTechs: db.getPlayerResearch(playerObj.id),
            enemyResearchedTechs: db.getPlayerResearch(opponentId),
            activeResearch: db.getActiveResearch(playerObj.id),
            allBosses: db.getAllBosses().map(b => ({ bossId: b.id, ...b })),
            boss: db.getBossState('boss_1'),
            bossPrereqs: db.checkBossPrerequisites(playerObj.id, 'boss_1'),
            bossPrereqsByBoss: {
                boss_1: db.checkBossPrerequisites(playerObj.id, 'boss_1'),
                boss_2: db.checkBossPrerequisites(playerObj.id, 'boss_2'),
                boss_3: db.checkBossPrerequisites(playerObj.id, 'boss_3')
            },
            shipTechRequirements: SHIP_TECH_REQUIREMENTS,
            shipUpgrades: db.getShipUpgrades(playerObj.id),
            shipUpgradeSlots: db.getMaxShipUpgradeSlots(playerObj.id),
            shipUpgradeModules: SHIP_UPGRADE_MODULES,
            allPlayers: db.getAllPlayers(),
            recentChat: db.getChatMessages(30),
            pvpTargets: db.getHumanPlayers(playerObj.id),
            playerAlliance: db.getAllianceByPlayer(playerObj.id),
            allianceOperations: db.getAllianceByPlayer(playerObj.id) ? db.getAllianceOperations(db.getAllianceByPlayer(playerObj.id).id) : [],
            tradeExpeditions: db.getActiveTradeExpeditions(playerObj.id),
            tradeCargo: db.getDockedTradeFleetCargo(playerObj.id),
            recentAIActions
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state));
        return;
    }

    if (pathname === '/api/trade-expeditions' && req.method === 'GET') {
        const playerId = _getReqPlayerId(req, parsedUrl);
        const expeditions = db.getActiveTradeExpeditions(playerId);
        const cargo = db.getDockedTradeFleetCargo(playerId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, expeditions, cargo }));
        return;
    }

    if (pathname === '/api/launch-trade-fleet' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            const { originPlanetId, ships } = body;
            if (!originPlanetId || !ships) {
                return _errorResponse(res, 400, "Hiányzó kiindulási bolygó vagy hajóválasztás!");
            }
            const result = db.launchTradeExpedition(playerId, originPlanetId, ships);
            if (result.error) {
                return _errorResponse(res, 400, result.error);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        });
        return;
    }

    if (pathname === '/api/return-trade-fleet' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            const { expeditionId } = body;
            if (!expeditionId) {
                return _errorResponse(res, 400, "Hiányzó expedíció azonosító!");
            }
            const result = db.returnTradeExpedition(expeditionId, playerId);
            if (result.error) {
                return _errorResponse(res, 400, result.error);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        });
        return;
    }

    if (pathname === '/api/trade-resources' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const { pairKey, amount } = body;
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            if (!pairKey || !amount) {
                return _errorResponse(res, 400, "Hiányzó cserepár vagy összeg!");
            }
            const result = db.tradeResources(playerId, pairKey, amount);
            if (result.error) {
                return _errorResponse(res, 400, result.error);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        });
        return;
    }

    // Parancsnokok listája és Frakcióválasztó
    
    // =========================================================================
    // SZÖVETSÉGI RENDSZER (ALLIANCE & OPERATIONS) API VÉGPONTOK
    // =========================================================================

    if (pathname === '/api/alliance' && req.method === 'GET') {
        const playerId = _getReqPlayerId(req, parsedUrl);
        const alliance = db.getAllianceByPlayer(playerId);
        const operations = alliance ? db.getAllianceOperations(alliance.id) : [];
        const publicAlliances = db.getAllAlliances();
        const planets = db.getAllPlanets();
        const myPlanets = planets.filter(p => p.owner_id === playerId);
        const stationedOnMyPlanets = [];
        for (const mp of myPlanets) {
            const defs = db.getStationedDefenseFleets(mp.id);
            if (defs.length > 0) {
                stationedOnMyPlanets.push({ planetId: mp.id, planetName: mp.name, defenses: defs });
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            alliance,
            operations,
            publicAlliances,
            stationedOnMyPlanets
        }));
        return;
    }

    if (pathname === '/api/create-alliance' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            const { name, tag, description } = body;
            const resData = db.createAlliance(name, tag, playerId, description);
            if (resData.error) return _errorResponse(res, 400, resData.error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resData));
        });
        return;
    }

    if (pathname === '/api/join-alliance' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            const { allianceId } = body;
            const resData = db.joinAlliance(allianceId, playerId);
            if (resData.error) return _errorResponse(res, 400, resData.error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resData));
        });
        return;
    }

    if (pathname === '/api/leave-alliance' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            const resData = db.leaveAlliance(playerId);
            if (resData.error) return _errorResponse(res, 400, resData.error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resData));
        });
        return;
    }

    if (pathname === '/api/create-alliance-operation' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            const alliance = db.getAllianceByPlayer(playerId);
            if (!alliance) return _errorResponse(res, 400, "Nem vagy tagja egyetlen szövetségnek sem!");

            const { targetType, targetId, targetTick, initialShips } = body;
            const resData = db.createAllianceOperation(alliance.id, playerId, targetType, targetId, targetTick, initialShips || {});
            if (resData.error) return _errorResponse(res, 400, resData.error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resData));
        });
        return;
    }

    if (pathname === '/api/join-alliance-operation' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            const { operationId, ships } = body;
            const resData = db.joinAllianceOperation(operationId, playerId, ships || {});
            if (resData.error) return _errorResponse(res, 400, resData.error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resData));
        });
        return;
    }

    if (pathname === '/api/cancel-alliance-operation' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            const { operationId } = body;
            const resData = db.cancelAllianceOperation(operationId, playerId);
            if (resData.error) return _errorResponse(res, 400, resData.error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resData));
        });
        return;
    }

    if (pathname === '/api/launch-alliance-operation' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            const { operationId } = body;
            const op = db.getOperation(operationId);
            if (!op) return _errorResponse(res, 404, "A hadművelet nem található!");
            if (op.creator_id !== playerId) {
                const mem = db.db.prepare("SELECT role FROM alliance_members WHERE alliance_id = ? AND player_id = ?").get(op.alliance_id, playerId);
                if (!mem || mem.role !== 'leader') {
                    return _errorResponse(res, 403, "Csak a szervező vagy a szövetség vezetője indíthatja el a hadtestet!");
                }
            }

            const resData = _executeAllianceOperation(operationId);
            if (resData.error) return _errorResponse(res, 400, resData.error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resData));
        });
        return;
    }

    if (pathname === '/api/recall-defense' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            const { alliedDefenseId } = body;
            const resData = db.recallDefenseFleet(alliedDefenseId, playerId);
            if (resData.error) return _errorResponse(res, 400, resData.error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resData));
        });
        return;
    }

    if (pathname === '/api/pvp-roster' && req.method === 'GET') {
        const playerId = _getReqPlayerId(req, parsedUrl);
        const targets = db.getHumanPlayers(playerId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ targets }));
        return;
    }

    if (pathname === '/api/commanders' && req.method === 'GET') {
        const players = db.getAllPlayers();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ players }));
        return;
    }

    if (pathname === '/api/select-commander' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const requestedId = body.playerId || 'player';
            const player = db.getPlayer(requestedId);
            if (!player) return _errorResponse(res, 404, "Ismeretlen parancsnokság!");
            if (player.id === 'enemy') {
                db.setPlayerHuman('enemy', true);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, player: db.getPlayer(requestedId) }));
        });
        return;
    }

    // Galaktikus Cset (Galactic Comms)
    if (pathname === '/api/chat' && req.method === 'GET') {
        const messages = db.getChatMessages(50);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ messages }));
        return;
    }

    if (pathname === '/api/chat' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const senderId = _getReqPlayerId(req, parsedUrl, body);
            const player = db.getPlayer(senderId) || { id: senderId, username: senderId };
            const message = (body.message || '').trim();
            if (!message) return _errorResponse(res, 400, "Üres üzenet!");
            const tick = db.getGameState();
            const msgObj = db.addChatMessage(player.id, player.username, message, tick);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: msgObj }));
        });
        return;
    }

    if (pathname === '/api/boss-status' && req.method === 'GET') {
        const bossId = parsedUrl.searchParams.get('bossId') || 'boss_1';
        const playerId = _getReqPlayerId(req, parsedUrl);
        const boss = db.getBossState(bossId);
        const prereqs = db.checkBossPrerequisites(playerId, bossId);
        const allBosses = db.getAllBosses();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ boss, prereqs, allBosses }));
        return;
    }

    if (pathname === '/api/attack-boss' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const bossId = body.bossId || 'boss_1';
            const prereqs = db.checkBossPrerequisites('player', bossId);
            if (!prereqs.canAttack) {
                return _errorResponse(res, 400, "Nem teljesülnek a citadella megtámadásának kritériumai!");
            }

            const player = db.getPlayer('player');
            const boss = db.getBossState(bossId);
            const currentTick = db.getGameState();

            let costIso = bossId === 'boss_1' ? 50 : (bossId === 'boss_2' ? 100 : 150);
            let costData = bossId === 'boss_1' ? 100 : (bossId === 'boss_2' ? 200 : 300);

            if (player.isotope < costIso || player.data_points < costData) {
                return _errorResponse(res, 400, "Nincs elég erőforrás az ugrókapu aktiválásához!");
            }

            player.isotope -= costIso;
            player.data_points -= costData;
            db.updatePlayerResources('player', player.metal, player.energy, player.isotope, player.data_points);

            const allPlanets = db.getAllPlanets();
            const playerPlanets = allPlanets.filter(p => p.owner_id === 'player');
            const playerTechs = db.getPlayerResearch('player');
            const playerUpgrades = db.getShipUpgrades('player');
            const playerBuffs = db.getPlayerBuffs('player');

            const primaryPlanet = playerPlanets[0];
            const sendCounts = {};
            for (const st of ALL_SHIP_TYPES) sendCounts[st] = 0;
            for (const p of playerPlanets) {
                for (const st of ALL_SHIP_TYPES) {
                    sendCounts[st] += (p.stationedFleet[st] || 0);
                }
            }

            for (const p of playerPlanets) {
                db.db.prepare("UPDATE fleet_ships SET count = 0, current_hull_total = 0, current_shield_total = 0 WHERE fleet_id = ?").run(p.stationedFleet.fleetId);
            }

            const armada = new Fleet('player', 'Birodalmi Ostrom Armada', boss.pos_x, boss.pos_y, playerTechs, playerBuffs);
            for (const st of ALL_SHIP_TYPES) {
                const cnt = sendCounts[st] || 0;
                for (let i = 0; i < cnt; i++) {
                    armada.ships.push(new ShipInstance(st, playerTechs, playerUpgrades[st], playerBuffs));
                }
            }

            const combatResult = CombatEngine.resolveBossCombat(armada, boss, playerTechs, 8);

            if (combatResult.bossDefeated) {
                db.updateBossState(bossId, 0, 0, 'defeated', currentTick);
                player.metal += (combatResult.salvageMetal || boss.salvage_metal || 1500);
                player.isotope += (combatResult.salvageIsotope || boss.salvage_isotope || 500);
                const awardedGlory = bossId === 'boss_1' ? 100 : (bossId === 'boss_2' ? 200 : 500);
                player.glory_points = (player.glory_points || 0) + awardedGlory;
                db.updatePlayerResources('player', player.metal, player.energy, player.isotope, player.data_points);
                db.db.prepare('UPDATE players SET glory_points = ? WHERE id = ?').run(player.glory_points, 'player');

                if (bossId === 'boss_1') db.db.prepare("UPDATE missions SET status = 'completed' WHERE id = 'm7'").run();
                if (bossId === 'boss_2') db.db.prepare("UPDATE missions SET status = 'completed' WHERE id = 'm8'").run();
                if (bossId === 'boss_3') db.db.prepare("UPDATE missions SET status = 'completed' WHERE id = 'm9'").run();

                recentAIActions.push(`[🚨 CITADELLA BUKÁSA!] A Parancsnok megsemmisítette a(z) '${boss.name}' bázist! (+${awardedGlory} Dicsőség)`);
                db.saveCombatLog(currentTick, boss.pos_x, boss.pos_y, boss.name, 'player', bossId, 'player', combatResult.log, combatResult.salvageMetal, combatResult.salvageIsotope);
            } else {
                db.updateBossState(bossId, combatResult.finalBossHull, combatResult.finalBossShield, 'active', null);
                recentAIActions.push(`[MEGTORPANÁS] Az Ostrom Armada visszavonult a(z) '${boss.name}' elől!`);
                db.saveCombatLog(currentTick, boss.pos_x, boss.pos_y, boss.name, 'player', bossId, bossId, combatResult.log, 0, 0);
            }

            const surv = combatResult.survivingShips;
            const updateShip = (shipType, count, baseHp, baseShield) => {
                if (count > 0 && primaryPlanet) {
                    const existing = db.db.prepare('SELECT id FROM fleet_ships WHERE fleet_id = ? AND ship_type = ?').get(primaryPlanet.stationedFleet.fleetId, shipType);
                    if (existing) {
                        db.db.prepare('UPDATE fleet_ships SET count = ?, current_hull_total = ?, current_shield_total = ? WHERE fleet_id = ? AND ship_type = ?')
                            .run(count, count * baseHp, count * baseShield, primaryPlanet.stationedFleet.fleetId, shipType);
                    } else {
                        db.db.prepare('INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total) VALUES (?, ?, ?, ?, ?, ?)')
                            .run(`${primaryPlanet.stationedFleet.fleetId}_${shipType}`, primaryPlanet.stationedFleet.fleetId, shipType, count, count * baseHp, count * baseShield);
                    }
                }
            };

            for (const st of ALL_SHIP_TYPES) {
                const count = (surv && surv[st]) || 0;
                const spec = SHIP_SPECS[st] || { hull: 100, shield: 0 };
                updateShip(st, count, spec.hull, spec.shield);
            }

            _evaluateMissions();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                won: combatResult.won,
                bossDefeated: combatResult.bossDefeated,
                combatLog: combatResult.log,
                boss: db.getBossState(bossId),
                allBosses: db.getAllBosses(),
                survivingShips: combatResult.survivingShips,
                player: db.getPlayer('player')
            }));
        });
        return;
    }

    if (pathname === '/api/tick' && req.method === 'POST') {
        const result = processTick();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    if (pathname === '/api/upgrade-structure' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const { planetId, slotIndex } = body;
            const result = db.upgradeStructure(planetId, slotIndex);
            if (result.error) {
                return _errorResponse(res, 400, result.error);
            }
            _evaluateMissions();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        });
        return;
    }

    if (pathname === '/api/claim-mission' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const { missionId } = body;
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            const claimed = db.claimMissionReward(playerId, missionId);
            if (!claimed) return _errorResponse(res, 400, "A küldetés még nincs kész vagy már beváltottad!");
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, claimed }));
        });
        return;
    }

    if (pathname === '/api/research-tech' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const { techId } = body;
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            const tech = TECH_TREE[techId];
            if (!tech) return _errorResponse(res, 400, "Érvénytelen technológia azonosító!");

            const playerTechs = db.getPlayerResearch(playerId);
            if (playerTechs.includes(techId)) {
                return _errorResponse(res, 400, "Ez a technológia már kifejlesztésre került!");
            }

            const activeResearch = db.getActiveResearch(playerId);
            if (activeResearch) {
                return _errorResponse(res, 400, "A Központi Kutatóbázis jelenleg foglalt! Várd meg az aktív kutatás befejeződését.");
            }

            const missingPrereqs = (tech.prerequisites || []).filter(pId => !playerTechs.includes(pId));
            if (missingPrereqs.length > 0) {
                const missingNames = missingPrereqs.map(pId => TECH_TREE[pId] ? TECH_TREE[pId].name : pId).join(', ');
                return _errorResponse(res, 400, `Előfeltétel hiányzik: ${missingNames} szükséges!`);
            }

            const result = db.startResearch(playerId, techId, tech.duration_ticks, tech.cost_data, tech.cost_isotope);
            if (result.error) return _errorResponse(res, 400, result.error);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: true, 
                message: `Kutatás elindítva: ${tech.name} (${tech.duration_ticks} kör)!`, 
                techId,
                activeResearch: db.getActiveResearch(playerId),
                player: db.getPlayer(playerId)
            }));
        });
        return;
    }

    if (pathname === '/api/build-ship' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const { planetId, shipType } = body;
            const player = db.getPlayer('player');
            const spec = SHIP_SPECS[shipType];
            if (!spec) return _errorResponse(res, 400, "Ismeretlen hajótípus!");
            const planets = db.getAllPlanets();
            const planet = planets.find(p => p.id === planetId);

            if (!planet || planet.owner_id !== 'player') {
                return _errorResponse(res, 400, "Csak saját bolygón építhetsz hajót!");
            }

            const playerTechs = db.getPlayerResearch('player');
            const reqTech = SHIP_TECH_REQUIREMENTS[shipType];
            if (reqTech && !playerTechs.includes(reqTech)) {
                const tSpec = TECH_TREE[reqTech];
                const tName = tSpec ? tSpec.name : reqTech;
                return _errorResponse(res, 400, `A(z) ${spec.name} gyártásához előbb ki kell kutatnod a(z) '${tName}' technológiát a Tech Fán!`);
            }
            let costMetal = spec.cost_metal;
            if (playerTechs.includes('automated_dock')) {
                costMetal = Math.round(costMetal * 0.80);
            }

            if (player.metal < costMetal || player.energy < spec.cost_energy || player.isotope < spec.cost_isotope) {
                return _errorResponse(res, 400, "Nincs elég nyersanyag a gyártáshoz!");
            }

            player.metal -= costMetal;
            player.energy -= spec.cost_energy;
            player.isotope -= spec.cost_isotope;
            db.updatePlayerResources('player', player.metal, player.energy, player.isotope, player.data_points);

            const playerUpgrades = db.getShipUpgrades('player');
            const installed = playerUpgrades[shipType] || [];
            const dummyShip = new ShipInstance(shipType, playerTechs, installed);
            const initialHull = dummyShip.maxHull;
            const initialShield = dummyShip.maxShield;

            // Ellenőrizzük, hogy létezik-e már rekord
            const existing = db.db.prepare('SELECT count FROM fleet_ships WHERE fleet_id = ? AND ship_type = ?').get(planet.stationedFleet.fleetId, shipType);
            if (existing) {
                db.db.prepare(`
                    UPDATE fleet_ships 
                    SET count = count + 1, current_hull_total = current_hull_total + ?, current_shield_total = current_shield_total + ?
                    WHERE fleet_id = ? AND ship_type = ?
                `).run(initialHull, initialShield, planet.stationedFleet.fleetId, shipType);
            } else {
                db.db.prepare(`
                    INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total)
                    VALUES (?, ?, ?, 1, ?, ?)
                `).run(`${planet.stationedFleet.fleetId}_${shipType}`, planet.stationedFleet.fleetId, shipType, initialHull, initialShield);
            }

            _evaluateMissions();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: `${spec.name} elkészült!` }));
        });
        return;
    }

    if (pathname === '/api/dispatch-fleet' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const { originPlanetId, targetPlanetId, ships } = body;
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            const player = db.getPlayer(playerId);
            const planets = db.getAllPlanets();
            const origin = planets.find(p => p.id === originPlanetId);
            const target = planets.find(p => p.id === targetPlanetId);

            if (!origin || origin.owner_id !== playerId || !target) {
                return _errorResponse(res, 400, "Érvénytelen indítási pont vagy célállomás! (Csak saját bolygóról indítható flotta)");
            }

            let totalCount = 0;
            const sf = origin.stationedFleet;
            for (const st of ALL_SHIP_TYPES) {
                const requested = ships[st] || 0;
                if (requested > (sf[st] || 0)) {
                    return _errorResponse(res, 400, `Nincs elég ${SHIP_SPECS[st].name} a bolygón (${sf[st]||0} áll rendelkezésre)!`);
                }
                totalCount += requested;
            }
            if (totalCount === 0) return _errorResponse(res, 400, "Válassz ki legalább 1 hajót az indításhoz!");

            const playerTechs = db.getPlayerResearch(playerId);
            const playerBuffs = db.getPlayerBuffs(playerId);
            const playerUpgrades = db.getShipUpgrades(playerId);
            const dist = Math.hypot(target.pos_x - origin.pos_x, target.pos_y - origin.pos_y);
            let totalFuelWeight = 0;

            for (const st of ALL_SHIP_TYPES) {
                const count = ships[st] || 0;
                if (count > 0) {
                    totalFuelWeight += count * (SHIP_SPECS[st].fuel_weight || 1.0);
                }
            }

            // Egységes alapmenetidő: 5 kör
            // Fejlesztésekkel lefaragható:
            // - Ionhajtómű: -1 kör
            // - Hipertér / Kvantum-kapu: -1 kör
            // - Sebesség buff: -1 kör
            // - Motor alrendszer fejlettség: -1 kör
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

            let travelHours = Math.max(1, baseTravelTicks - speedDiscount);
            if (target.id === 'station_trade' || target.is_trade_station) {
                travelHours = Math.max(1, Math.round(travelHours * 0.5));
            }
            const fuelMultiplier = playerTechs.includes('isotope_compression') ? 0.70 : 1.0;
            const fuelCost = Math.max(5, Math.ceil(totalFuelWeight * 2 * fuelMultiplier));

            if (player.isotope < fuelCost) {
                return _errorResponse(res, 400, `Nincs elég Izotóp üzemanyag (${fuelCost} szükséges)!`);
            }

            // Levonások
            player.isotope -= fuelCost;
            db.updatePlayerResources(player.id, player.metal, player.energy, player.isotope, player.data_points);

            const updFleet = db.db.prepare(`UPDATE fleet_ships SET count = count - ? WHERE fleet_id = ? AND ship_type = ?`);
            for (const st of ALL_SHIP_TYPES) {
                const count = ships[st] || 0;
                if (count > 0) {
                    updFleet.run(count, sf.fleetId, st);
                }
            }

            const curTick = db.getGameState();
            const fleetId = `f_${player.id}_trans_${Date.now()}`;
            const fleetName = player.id === 'player' ? 'Kronos Armada' : 'Vektor-9 Armada';
            db.db.prepare(`
                INSERT INTO fleets (id, owner_id, name, current_x, current_y, dest_x, dest_y, origin_planet_id, target_planet_id, departure_tick, arrival_tick, state)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_transit')
            `).run(fleetId, player.id, fleetName, origin.pos_x, origin.pos_y, target.pos_x, target.pos_y, origin.id, target.id, curTick, curTick + travelHours);

            const insShip = db.db.prepare(`INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total) VALUES (?, ?, ?, ?, ?, ?)`);
            for (const st of ALL_SHIP_TYPES) {
                const count = ships[st] || 0;
                if (count > 0) {
                    const spec = SHIP_SPECS[st] || { hull: 100, shield: 0 };
                    insShip.run(`${fleetId}_${st}`, fleetId, st, count, count * spec.hull, count * spec.shield);
                }
            }

            _evaluateMissions();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: "Flotta sikeresen útnak indítva!" }));
        });
        return;
    }

    if (pathname === '/api/ship-upgrades' && req.method === 'GET') {
        const playerId = _getReqPlayerId(req, parsedUrl);
        const upgrades = db.getShipUpgrades(playerId);
        const slots = db.getMaxShipUpgradeSlots(playerId, 'corvette');
        const slotsByShip = {};
        for (const st of ALL_SHIP_TYPES) {
            slotsByShip[st] = db.getMaxShipUpgradeSlots(playerId, st);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            allShipTypes: ALL_SHIP_TYPES,
            subsystems: SHIP_SUBSYSTEMS,
            hotspots: SUBSYSTEM_HOTSPOTS,
            modules: SHIP_UPGRADE_MODULES,
            bonusTables: SUBSYSTEM_BONUS_TABLES,
            upgrades,
            slots,
            slotsByShip,
            specs: SHIP_SPECS,
            player: db.getPlayer(playerId)
        }));
        return;
    }

    if (pathname === '/api/upgrade-ship-subsystem' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const { shipType, slotKey } = body;
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            if (!shipType || !slotKey) {
                return _errorResponse(res, 400, "Hiányzó hajótípus vagy alrendszer kulcs!");
            }
            const result = db.upgradeShipSubsystem(playerId, shipType, slotKey);
            if (result.error) {
                return _errorResponse(res, 400, result.error);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        });
        return;
    }

    if (pathname === '/api/reset-ship-subsystem' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const { shipType, slotKey } = body;
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            if (!shipType || !slotKey) {
                return _errorResponse(res, 400, "Hiányzó hajótípus vagy alrendszer kulcs!");
            }
            const result = db.resetShipSubsystem(playerId, shipType, slotKey);
            if (result.error) {
                return _errorResponse(res, 400, result.error);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        });
        return;
    }

    if (pathname === '/api/toggle-ship-upgrade' && req.method === 'POST') {
        _parseJsonBody(req, res, body => {
            const { shipType, moduleId } = body;
            const playerId = _getReqPlayerId(req, parsedUrl, body);
            if (!shipType || !moduleId) {
                return _errorResponse(res, 400, "Hiányzó hajótípus vagy modul azonosító!");
            }
            const result = db.toggleShipUpgrade(playerId, shipType, moduleId);
            if (result.error) {
                return _errorResponse(res, 400, result.error);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        });
        return;
    }

    // --- STATIKUS FÁJL KISZOLGÁLÁS (assets, index.html, PWA manifest, sw, ikon) ---
    if (pathname.startsWith('/assets/')) {
        const filename = path.basename(pathname);
        const filePath = path.join(__dirname, 'assets', filename);
        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            let contentType = 'image/jpeg';
            if (ext === '.svg') contentType = 'image/svg+xml';
            else if (ext === '.png') contentType = 'image/png';
            fs.readFile(filePath, (err, data) => {
                if (err) { res.writeHead(404); res.end("Not found"); return; }
                res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' });
                res.end(data);
            });
            return;
        }
    }

    if (pathname === '/' || pathname === '/index.html') {
        const filePath = path.join(__dirname, 'index.html');
        fs.readFile(filePath, (err, data) => {
            if (err) { res.writeHead(404); res.end("index.html not found"); return; }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
        return;
    }

    if (pathname === '/manifest.json') {
        const filePath = path.join(__dirname, 'manifest.json');
        fs.readFile(filePath, (err, data) => {
            if (err) { res.writeHead(404); res.end("Not found"); return; }
            res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
            res.end(data);
        });
        return;
    }

    if (pathname === '/sw.js') {
        const filePath = path.join(__dirname, 'sw.js');
        fs.readFile(filePath, (err, data) => {
            if (err) { res.writeHead(404); res.end("Not found"); return; }
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            res.end(data);
        });
        return;
    }

    if (pathname === '/icon.svg') {
        const filePath = path.join(__dirname, 'icon.svg');
        fs.readFile(filePath, (err, data) => {
            if (err) { res.writeHead(404); res.end("Not found"); return; }
            res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
            res.end(data);
        });
        return;
    }

    res.writeHead(404);
    res.end("Not Found");
});

function _parseJsonBody(req, res, callback) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            callback(data);
        } catch (e) {
            _errorResponse(res, 400, "Érvénytelen JSON formátum");
        }
    });
}

function _errorResponse(res, code, msg) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
}

// ============================================================================
// AUTOMATIKUS TESZTFUTTATÓ (--test)
// ============================================================================

function runServerTests() {
    console.log(">>> [SZERVER TESZTEK] Backend és MI tesztek indítása...");

    // 1. Teszt: Adatbázis inicializálás és lekérdezések
    const tick = db.getGameState();
    console.log(`1. Teszt - Kezdő tick számláló: #${tick}`);
    if (typeof tick !== 'number') throw new Error("Érvénytelen tick");

    const player = db.getPlayer('player');
    const enemy = db.getPlayer('enemy');
    console.log(`2. Teszt - Játékosok inicializálva: ${player.username} & ${enemy.username}`);
    if (!player || !enemy) throw new Error("Hiányzó játékos rekord");

    const planets = db.getAllPlanets();
    console.log(`3. Teszt - Bolygók száma: ${planets.length} db (Kronos-IV, Zephyr-7, Nexus-Alpha, Vektor-9)`);
    if (planets.length < 4) throw new Error("Hiányzó bolygók");

    // 4. Teszt: Tick futtatása és MI reakció
    const tickRes = processTick();
    console.log(`4. Teszt - Tick léptetés lefutott, új tick: #${tickRes.tick}`);
    console.log(`   MI döntések száma: ${tickRes.aiActions.length}`);

    console.log("\n>>> MINDEN SZERVER ÉS MI TESZT SIKERESEN LEFUTOTT! <<<");
}

if (process.argv.includes('--test')) {
    runServerTests();
} else {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`\n======================================================`);
        console.log(`  SPACE 4X TACTICS SZERVER FUT`);
        console.log(`  Cím: http://localhost:${PORT}`);
        console.log(`  Tick kiértékelés elérhető: POST http://localhost:${PORT}/api/tick`);
        console.log(`======================================================\n`);
    });
}

module.exports = { server, processTick };
