/**
 * SPACE 4X TACTICS - AUTONÓM MI PARANCSNOK (Vektor-9 Szindikátus)
 * Intelligens döntéshozatali motor: gazdaságfejlesztés, flottaépítés és stratégiai támadások.
 */

const { SHIP_SPECS } = require('./tick_runner');

class AICommander {
    constructor(dbService) {
        this.db = dbService;
        this.aiId = 'enemy';
    }

    /**
     * Minden tick lefutásakor meghívódik, kiértékeli a galaxis helyzetét és döntéseket hoz.
     */
    evaluateTick(currentTick) {
        const aiPlayer = this.db.getPlayer(this.aiId);
        if (!aiPlayer) return [];

        const allPlanets = this.db.getAllPlanets();
        const aiPlanets = allPlanets.filter(p => p.owner_id === this.aiId);
        const playerPlanets = allPlanets.filter(p => p.owner_id === 'player');
        const neutralPlanets = allPlanets.filter(p => p.owner_id === null || p.owner_id === 'neutral');

        const actionsTaken = [];

        // 1. DÖNTÉS: BOLYGÓI SLOTO-K ÉPÍTÉSE ÉS GAZDASÁGI FEJLESZTÉS
        for (const p of aiPlanets) {
            if (p.structures.length < p.size_slots) {
                // Van szabad slot!
                if (aiPlayer.metal >= 150) {
                    const nextSlot = p.structures.length;
                    let structType = 'industrial_hub';
                    let branch = 'economy';

                    // Ha a bolygón nincs még védelem, építsen Orbitális Railgunt
                    const hasDefense = p.structures.some(s => s.branch_type === 'defense');
                    if (!hasDefense && aiPlayer.energy >= 50) {
                        structType = 'orbital_railgun';
                        branch = 'defense';
                    }

                    const structId = `s_ai_${p.id}_${nextSlot}_${currentTick}`;
                    this.db.db.prepare(`
                        INSERT INTO planet_structures (id, planet_id, slot_index, branch_type, structure_type, level)
                        VALUES (?, ?, ?, ?, ?, 1)
                    `).run(structId, p.id, nextSlot, branch, structType);

                    aiPlayer.metal -= 150;
                    actionsTaken.push(`[MI GAZDASÁG] Vektor-9 új struktúrát (${structType}) épített a ${p.name} bolygón.`);
                }
            }
        }

        // 2. DÖNTÉS: HAJÓGYÁRTÁS (KŐ-PAPÍR-OLLÓ LOGIKA)
        // Megvizsgálja a játékos látható flottaösszetételét
        let playerCorvettes = 0;
        let playerDestroyers = 0;
        let playerBattleships = 0;
        for (const p of playerPlanets) {
            playerCorvettes += p.stationedFleet.corvette;
            playerDestroyers += p.stationedFleet.destroyer;
            playerBattleships += p.stationedFleet.battleship;
        }

        for (const p of aiPlanets) {
            const sf = p.stationedFleet;
            // Ha a játékos sok korvettel rendelkezik -> az MI Rombolókat gyárt
            let desiredShip = 'destroyer';
            if (playerDestroyers > playerCorvettes) {
                desiredShip = 'battleship';
            } else if (sf.corvette < 10) {
                desiredShip = 'corvette';
            }

            const spec = SHIP_SPECS[desiredShip];
            if (aiPlayer.metal >= spec.cost_metal && aiPlayer.energy >= spec.cost_energy && aiPlayer.isotope >= spec.cost_isotope) {
                aiPlayer.metal -= spec.cost_metal;
                aiPlayer.energy -= spec.cost_energy;
                aiPlayer.isotope -= spec.cost_isotope;

                // Növeljük a bolygón állomásozó flottát
                let fleetId = sf.fleetId;
                if (!fleetId) {
                    fleetId = `f_${p.id}_${aiPlayer.id}`;
                    this.db.db.prepare(`
                        INSERT INTO fleets (id, owner_id, name, current_x, current_y, origin_planet_id, state)
                        VALUES (?, ?, ?, ?, ?, ?, 'stationed')
                    `).run(fleetId, aiPlayer.id, `${p.name} Helyőrség`, p.pos_x, p.pos_y, p.id);
                    sf.fleetId = fleetId;
                }
                const existing = this.db.db.prepare('SELECT count FROM fleet_ships WHERE fleet_id = ? AND ship_type = ?').get(fleetId, desiredShip);
                if (existing) {
                    this.db.db.prepare(`
                        UPDATE fleet_ships 
                        SET count = count + 1, current_hull_total = current_hull_total + ?, current_shield_total = current_shield_total + ?
                        WHERE fleet_id = ? AND ship_type = ?
                    `).run(spec.hull, spec.shield, fleetId, desiredShip);
                } else {
                    this.db.db.prepare(`
                        INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total)
                        VALUES (?, ?, ?, 1, ?, ?)
                    `).run(`${fleetId}_${desiredShip}`, fleetId, desiredShip, spec.hull, spec.shield);
                }

                actionsTaken.push(`[MI GYÁRTÁS] Vektor-9 hadrendbe állított egy új ${spec.name}-t a ${p.name} bolygón.`);
            }
        }

        // 3. DÖNTÉS: EXPEDÍCIÓ ÉS TERJESZKEDÉS (KOLONIZÁCIÓ)
        // Ha van elérhető semleges bolygó és az MI bázison van legalább 5 hajó, indítson kolonizációt
        for (const p of aiPlanets) {
            const sf = p.stationedFleet;
            let totalShips = 0;
            for (const st of ['corvette', 'destroyer', 'battleship', 'interceptor', 'frigate', 'heavy_destroyer', 'cruiser']) {
                totalShips += (sf[st] || 0);
            }

            if (neutralPlanets.length > 0 && totalShips >= 5) {
                // Válasszuk a legközelebbi semleges bolygót
                const target = neutralPlanets.sort((a, b) => Math.hypot(a.pos_x - p.pos_x, a.pos_y - p.pos_y) - Math.hypot(b.pos_x - p.pos_x, b.pos_y - p.pos_y))[0];
                const dist = Math.hypot(target.pos_x - p.pos_x, target.pos_y - p.pos_y);
                const fuelNeeded = 15;

                if (aiPlayer.isotope >= fuelNeeded) {
                    aiPlayer.isotope -= fuelNeeded;
                    const sendCorv = Math.min(3, sf.corvette);
                    const sendDest = Math.min(1, sf.destroyer);

                    if (sendCorv > 0) {
                        this._dispatchAIFleet(p, target, { corvette: sendCorv, destroyer: sendDest, battleship: 0 }, dist, currentTick);
                        actionsTaken.push(`[MI EXPEDÍCIÓ] Vektor-9 kolonizáló flottát indított a(z) ${target.name} semleges világ felé!`);
                    }
                }
            } else if (playerPlanets.length > 0 && totalShips >= 12) {
                // 4. DÖNTÉS: AGRESSZÍV RAJTAÜTÉS (HA VAN ELEGENDŐ TÚLERŐ)
                const target = playerPlanets[0];
                const dist = Math.hypot(target.pos_x - p.pos_x, target.pos_y - p.pos_y);
                const fuelNeeded = 30;

                if (aiPlayer.isotope >= fuelNeeded) {
                    aiPlayer.isotope -= fuelNeeded;
                    const sendCorv = Math.floor(sf.corvette * 0.7);
                    const sendDest = Math.floor(sf.destroyer * 0.7);
                    const sendBB = sf.battleship;

                    if (sendCorv + sendDest + sendBB > 0) {
                        this._dispatchAIFleet(p, target, { corvette: sendCorv, destroyer: sendDest, battleship: sendBB }, dist, currentTick);
                        actionsTaken.push(`[MI RAJTAÜTÉS] VIGYÁZAT! Vektor-9 inváziós haderőt indított ${target.name} ellen!`);
                    }
                }
            }
        }

        // 4. DÖNTÉS: TECHNOLÓGIAI KUTATÁS
        const activeAiResearch = this.db.getActiveResearch(this.aiId);
        if (!activeAiResearch) {
            const aiTechs = this.db.getPlayerResearch(this.aiId);
            const researchPriorities = [
                { id: 'kinetic_calibration', prereqs: [], duration: 1, cost_data: 60, cost_iso: 20 },
                { id: 'deep_core_mining', prereqs: [], duration: 1, cost_data: 60, cost_iso: 20 },
                { id: 'ion_thrusters', prereqs: [], duration: 1, cost_data: 60, cost_iso: 20 },
                { id: 'plasma_focusing', prereqs: [], duration: 1, cost_data: 60, cost_iso: 20 },
                { id: 'extended_shielding', prereqs: ['kinetic_calibration'], duration: 2, cost_data: 120, cost_iso: 40 },
                { id: 'heavy_metallurgy', prereqs: ['deep_core_mining'], duration: 2, cost_data: 130, cost_iso: 35 },
                { id: 'dark_matter_reactor', prereqs: ['plasma_focusing'], duration: 2, cost_data: 130, cost_iso: 40 },
                { id: 'isotope_compression', prereqs: ['ion_thrusters'], duration: 2, cost_data: 120, cost_iso: 40 },
                { id: 'automated_dock', prereqs: ['heavy_metallurgy'], duration: 3, cost_data: 240, cost_iso: 75 },
                { id: 'superconductor_grid', prereqs: ['dark_matter_reactor'], duration: 3, cost_data: 220, cost_iso: 65 },
                { id: 'siege_warheads', prereqs: ['extended_shielding'], duration: 3, cost_data: 250, cost_iso: 80 }
            ];

            for (const tech of researchPriorities) {
                if (!aiTechs.includes(tech.id)) {
                    const prereqsMet = tech.prereqs.every(p => aiTechs.includes(p));
                    if (prereqsMet && aiPlayer.data_points >= tech.cost_data && aiPlayer.isotope >= tech.cost_iso) {
                        const res = this.db.startResearch(this.aiId, tech.id, tech.duration, tech.cost_data, tech.cost_iso);
                        if (res && !res.error) {
                            actionsTaken.push(`[MI KUTATÁS] Vektor-9 kutatást indított: '${tech.id}' (${tech.duration} kör)!`);
                            const refreshed = this.db.getPlayer(this.aiId);
                            aiPlayer.data_points = refreshed.data_points;
                            aiPlayer.isotope = refreshed.isotope;
                        }
                    }
                    break;
                }
            }
        }

        // Erőforrások elmentése
        this.db.updatePlayerResources(this.aiId, aiPlayer.metal, aiPlayer.energy, aiPlayer.isotope, aiPlayer.data_points);
        return actionsTaken;
    }

    _dispatchAIFleet(originPlanet, targetPlanet, ships, dist, currentTick) {
        // Levonás a bázisról
        const sf = originPlanet.stationedFleet;
        this.db.db.prepare(`UPDATE fleet_ships SET count = count - ? WHERE fleet_id = ? AND ship_type = 'corvette'`).run(ships.corvette, sf.fleetId);
        this.db.db.prepare(`UPDATE fleet_ships SET count = count - ? WHERE fleet_id = ? AND ship_type = 'destroyer'`).run(ships.destroyer, sf.fleetId);
        this.db.db.prepare(`UPDATE fleet_ships SET count = count - ? WHERE fleet_id = ? AND ship_type = 'battleship'`).run(ships.battleship, sf.fleetId);

        // Sebesség és érkezés
        let minSpeed = 5.0;
        if (ships.battleship > 0) minSpeed = 2.0;
        else if (ships.destroyer > 0) minSpeed = 3.5;

        const travelHours = Math.max(1, Math.ceil(dist / minSpeed));
        const fleetId = `f_ai_trans_${Date.now()}_${Math.floor(Math.random()*1000)}`;

        this.db.db.prepare(`
            INSERT INTO fleets (id, owner_id, name, current_x, current_y, dest_x, dest_y, origin_planet_id, target_planet_id, departure_tick, arrival_tick, state)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_transit')
        `).run(fleetId, this.aiId, 'Vektor-9 Különítmény', originPlanet.pos_x, originPlanet.pos_y, targetPlanet.pos_x, targetPlanet.pos_y, originPlanet.id, targetPlanet.id, currentTick, currentTick + travelHours);

        const insertShip = this.db.db.prepare(`INSERT INTO fleet_ships (id, fleet_id, ship_type, count, current_hull_total, current_shield_total) VALUES (?, ?, ?, ?, ?, ?)`);
        if (ships.corvette > 0) insertShip.run(`${fleetId}_c`, fleetId, 'corvette', ships.corvette, ships.corvette * 120, ships.corvette * 40);
        if (ships.destroyer > 0) insertShip.run(`${fleetId}_d`, fleetId, 'destroyer', ships.destroyer, ships.destroyer * 450, ships.destroyer * 200);
        if (ships.battleship > 0) insertShip.run(`${fleetId}_b`, fleetId, 'battleship', ships.battleship, ships.battleship * 1600, ships.battleship * 800);
    }
}

module.exports = { AICommander };
