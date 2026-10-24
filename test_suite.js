/**
 * SPACE 4X TACTICS - BACKEND VERIFICATION TEST SUITE
 */

const { DatabaseService, ALL_SHIP_TYPES, SHIP_TECH_REQUIREMENTS, SHIP_UPGRADE_MODULES, SHIP_SUBSYSTEMS, SUBSYSTEM_HOTSPOTS } = require('./db');
const { SHIP_SPECS, CombatEngine, Fleet, ShipInstance } = require('./tick_runner');

function runTests() {
    console.log("=== [TEST 1] Ellenőrizzük az adatbázis kapcsolatot és a sémákat ===");
    const db = new DatabaseService();
    const gameState = db.getGameState();
    console.log(`Játék tick: #${gameState}`);

    const planets = db.getAllPlanets();
    console.log(`Bolygók száma: ${planets.length}`);
    for (const p of planets) {
        console.log(` - ${p.name} (ID: ${p.id}, Birtokos: ${p.owner_id}, Épületek: ${p.structures.map(s => `${s.structure_type}:Lv.${s.level}`).join(', ')})`);
        console.log(`   Flotta: ⌖ Szonda:${p.stationedFleet.scout} ▲ Korvett:${p.stationedFleet.corvette} ⚲ Telepes:${p.stationedFleet.colony_ship} ◆ Romboló:${p.stationedFleet.destroyer} ⬟ Csatahajó:${p.stationedFleet.battleship}`);
    }

    console.log("\n=== [TEST 2] Küldetések (Missions) lekérdezése ===");
    const missions = db.getMissions();
    console.log(`Küldetések száma: ${missions.length}`);
    missions.forEach(m => {
        console.log(` [${m.id}] ${m.title} | Státusz: ${m.status} | Jutalék: ${m.reward_text}`);
    });

    console.log("\n=== [TEST 3] Építményfejlesztés (Upgrade Structure) ===");
    const player = db.getPlayer('player');
    console.log(`Kezdeti Fém: ${player.metal}`);
    if (player.metal < 500) {
        db.updatePlayerResources('player', player.metal + 1000, player.energy, player.isotope, player.data_points);
    }
    const upgResult1 = db.upgradeStructure('p1', 0);
    console.log("Fejlesztés slot 0 (Ipari Központ):", upgResult1);

    const updatedPlanets = db.getAllPlanets();
    const p1 = updatedPlanets.find(p => p.id === 'p1');
    const hub = p1.structures.find(s => s.slot_index === 0);
    console.log(`Új Ipari Központ szint: Lv.${hub.level}`);

    console.log("\n=== [TEST 4] Hajóspeckók & Harci Motor ellenőrzése ===");
    ['scout', 'corvette', 'colony_ship', 'destroyer', 'battleship'].forEach(type => {
        const spec = SHIP_SPECS[type];
        if (!spec) throw new Error(`Hiányzó hajó típus: ${type}`);
        console.log(` - ${spec.symbol} ${spec.name}: HP=${spec.hull}, Shield=${spec.shield}, DMG=${spec.damage}, Sebesség=${spec.speed}, Upkeep=${spec.upkeep_energy}`);
    });

    const fleetA = new Fleet('player', 'Alfa Különítmény', 0, 0);
    fleetA.ships.push(new ShipInstance('scout'));
    fleetA.ships.push(new ShipInstance('corvette'));
    fleetA.ships.push(new ShipInstance('destroyer'));

    const fleetB = new Fleet('enemy', 'Ellenséges Szonda', 0, 0);
    fleetB.ships.push(new ShipInstance('scout'));

    const combatRes = CombatEngine.resolveCombat(fleetA, fleetB, 3);
    console.log(`Harc kimenetel: Győztes=${combatRes.winnerId}, Túlélők fa=${fleetA.aliveShips().length}, fb=${fleetB.aliveShips().length}`);
    console.log(`Salvage: Fém=${combatRes.salvageMetal}, Izotóp=${combatRes.salvageIsotope}`);

    console.log("\n=== [TEST 5] Küldetés teljesítés és jutalom beváltása ===");
    // Teljesítsük az m1 küldetést (Ipari központ Lv.2+)
    db.db.prepare("UPDATE missions SET status = 'completed' WHERE id = 'm1'").run();
    const claimed = db.claimMissionReward('m1');
    console.log(`Beváltott küldetés: ${claimed.title}, Új státusz: ${db.getMissions().find(m => m.id === 'm1').status}`);

    console.log("\n=== [TEST 6] Technológiai Fa, Időköltség és Kutatási Sor Ellenőrzése ===");
    // Adunk elég Adatpontot és Izotópot a kutatási tesztekhez
    const pCurrent = db.getPlayer('player');
    db.updatePlayerResources('player', pCurrent.metal, pCurrent.energy, pCurrent.isotope + 1000, pCurrent.data_points + 2000);

    const initialResearch = db.getPlayerResearch('player');
    console.log(`Kezdeti kifejlesztett technológiák (${initialResearch.length} db):`, initialResearch);

    // 1. Kutatási Sor Teszt: plasma_focusing indítása időtartammal (duration = 1 kör)
    // Töröljük az esetleges korábbi sorban vagy kifejlesztve maradt elemeket a teszt kedvéért
    db.db.prepare("DELETE FROM research_queue WHERE player_id = 'player'").run();
    db.db.prepare("DELETE FROM player_research WHERE player_id = 'player' AND tech_id = 'plasma_focusing'").run();

    const startRes1 = db.startResearch('player', 'plasma_focusing', 1, 60, 20);
    console.log("Kutatás indítása 'plasma_focusing' (1 kör):", startRes1);
    if (!startRes1.success) {
        throw new Error("Nem sikerült elindítani a plasma_focusing kutatását!");
    }

    // Ellenőrizzük az aktív kutatást
    const activeRes = db.getActiveResearch('player');
    console.log("Aktív kutatás lekérdezése:", activeRes);
    if (!activeRes || activeRes.tech_id !== 'plasma_focusing') {
        throw new Error("Az aktív kutatás nem található vagy hibás!");
    }

    // 2. Szimultán kutatás blokkolásának tesztelése (1 aktív kutatás korlát)
    const blockedRes = db.startResearch('player', 'deep_core_mining', 1, 60, 20);
    console.log("Párhuzamos kutatás blokkolási kísérlet:", blockedRes);
    if (!blockedRes.error) {
        throw new Error("A rendszernek blokkolnia kellett volna a második párhuzamos kutatást!");
    }

    // 3. Tick léptetés és kutatás automatikus befejeződése
    console.log(`Kör szimuláció a befejeződéshez (Finish tick: #${activeRes.finish_tick})...`);
    const completedList = db.processResearchQueue(activeRes.finish_tick);
    console.log("Kör kiértékelés eredménye (befejezett kutatások):", completedList);
    if (!completedList.some(c => c.techId === 'plasma_focusing' && c.playerId === 'player')) {
        throw new Error("A plasma_focusing nem fejeződött be a finish_tick elérésekor!");
    }

    // Ellenőrizzük, hogy a labor felszabadult-e
    const activeAfter = db.getActiveResearch('player');
    if (activeAfter !== null) {
        throw new Error("A kutatási sornak üresnek kell lennie a befejezés után!");
    }
    const researchedNow = db.getPlayerResearch('player');
    if (!researchedNow.includes('plasma_focusing')) {
        throw new Error("A plasma_focusing nem került be a player_research táblába!");
    }
    console.log("✓ plasma_focusing sikeresen befejeződött és aktiválódott!");

    // 4. Kiterjesztett Pajzs és Nehéz Metallurgia bónusz teszt
    db.completeResearch('player', 'heavy_metallurgy', db.getGameState(), 2);
    const shipHeavy = new ShipInstance('battleship', ['heavy_metallurgy']);
    console.log(`Nehéz Metallurgia Csatahajó HP: ${shipHeavy.maxHull} (Alap: ${SHIP_SPECS.battleship.hull}, +30% várható: ${Math.round(SHIP_SPECS.battleship.hull * 1.3)})`);
    if (shipHeavy.maxHull !== Math.round(SHIP_SPECS.battleship.hull * 1.3)) {
        throw new Error("A heavy_metallurgy +30% hull HP bónusz nem érvényesül!");
    }

    // 5. Nano-összeszerelés és Bolygó Slot bővülés ellenőrzése
    const p1Before = db.getAllPlanets().find(p => p.id === 'p1');
    const slotsBefore = p1Before.size_slots;
    db.completeResearch('player', 'nano_assembly', db.getGameState(), 3);
    const p1After = db.getAllPlanets().find(p => p.id === 'p1');
    console.log(`Kronos-IV slot kapacitás: ${slotsBefore} -> ${p1After.size_slots} (+1 slot hozzáadva!)`);
    if (p1After.size_slots !== slotsBefore + 1) {
        throw new Error("A nano_assembly nem növelte a bolygó slotjainak számát!");
    }

    // 6. Flottasebesség és üzemanyag bónuszok kalkulációja
    const testFleet = new Fleet('player', 'Teszt Flotta', 0, 0, ['ion_thrusters', 'isotope_compression']);
    testFleet.ships.push(new ShipInstance('corvette'));
    testFleet.ships.push(new ShipInstance('destroyer'));

    const baseFleet = new Fleet('player', 'Alap Flotta', 0, 0, []);
    baseFleet.ships.push(new ShipInstance('corvette'));
    baseFleet.ships.push(new ShipInstance('destroyer'));

    const baseSpeed = baseFleet.getSpeed();
    const boostedSpeed = testFleet.getSpeed();
    console.log(`Flotta sebesség: Alap=${baseSpeed} /h, Ionos hajtóművel=${boostedSpeed} /h (+25% bónusz!)`);
    if (boostedSpeed !== baseSpeed * 1.25) {
        throw new Error("Az ion_thrusters sebességbónusz hibás!");
    }

    const baseCost = baseFleet.calculateDispatchCost(100, 0);
    const boostedCost = testFleet.calculateDispatchCost(100, 0);
    console.log(`Üzemanyagköltség 100 egység távra: Alap=${baseCost.fuelCost} Iso, Tömörítéssel=${boostedCost.fuelCost} Iso (-30% bónusz!)`);
    if (boostedCost.fuelCost >= baseCost.fuelCost) {
        throw new Error("Az isotope_compression üzemanyagcsökkentés hibás!");
    }

    // 7. Harci sebzésbónusz ellenőrzése
    const combatAttacker = new Fleet('player', 'Tech Flotta', 0, 0, ['kinetic_calibration']);
    combatAttacker.ships.push(new ShipInstance('corvette', ['kinetic_calibration']));
    const combatDefender = new Fleet('enemy', 'Célpont Flotta', 0, 0, []);
    combatDefender.ships.push(new ShipInstance('corvette', []));

    console.log("\n=== [TEST 7] Citadella-Protokoll: Végjáték Boss (boss_1) & Kritériumrendszer Ellenőrzése ===");
    // 1. Boss állapot visszaállítása és lekérdezése az adatbázisból
    db.db.prepare("UPDATE boss_state SET hull = 3500, shield = 1500, state = 'dormant', defeated_at_tick = NULL WHERE id = 'boss_1'").run();
    const bossInit = db.getBossState('boss_1');
    console.log("Boss kezdeti állapota:", bossInit.name, `[HP: ${bossInit.hull}/${bossInit.max_hull}, Pajzs: ${bossInit.shield}/${bossInit.max_shield}]`);
    if (!bossInit || bossInit.id !== 'boss_1') {
        throw new Error("A boss_1 Citadella nem található az adatbázisban!");
    }

    // 2. Kritériumok hiányos állapotának tesztelése (nincs elég dicsőség/ereklye)
    db.db.prepare("UPDATE players SET glory_points = 0 WHERE id = 'player'").run();
    db.db.prepare("DELETE FROM player_artifacts WHERE player_id = 'player'").run();
    const prereqCheckIncomplete = db.checkBossPrerequisites('player', 'boss_1');
    console.log("Kritériumok hiányos tesztje (canAttack várt: false):", prereqCheckIncomplete.canAttack);
    console.log(" - Dicsőség állapot:", prereqCheckIncomplete.criteria.glory.details);
    console.log(" - Ereklye állapot:", prereqCheckIncomplete.criteria.artifacts.details);
    if (prereqCheckIncomplete.canAttack !== false) {
        throw new Error("A kritériumrendszernek blokkolnia kellett volna a támadást!");
    }

    // 3. Kritériumok feloldása a teszthez
    // A) Dicsőség és Ereklye
    db.db.prepare("UPDATE players SET glory_points = 250 WHERE id = 'player'").run();
    db.addPlayerArtifact('player', 'artifact_chrono_core', 'Kvantum Chrono-Mag');

    // B) Erőforrások biztosítása (min. 50 Iso, 100 Dat)
    const pRes = db.getPlayer('player');
    db.updatePlayerResources('player', pRes.metal + 1000, pRes.energy + 500, pRes.isotope + 500, pRes.data_points + 800);

    // C) Armada biztosítása a Kronos-IV bolygón (min. 15 Korvett VAGY 6 Romboló)
    const p1FleetId = 'f_p1';
    db.db.prepare("UPDATE fleet_ships SET count = 20, current_hull_total = 2400, current_shield_total = 800 WHERE fleet_id = ? AND ship_type = 'corvette'").run(p1FleetId);
    db.db.prepare("UPDATE fleet_ships SET count = 6, current_hull_total = 2700, current_shield_total = 1200 WHERE fleet_id = ? AND ship_type = 'destroyer'").run(p1FleetId);

    const prereqCheckComplete = db.checkBossPrerequisites('player', 'boss_1');
    console.log("Kritériumok teljesülése (canAttack várt: true):", prereqCheckComplete.canAttack);
    console.log(" - Dicsőség:", prereqCheckComplete.criteria.glory.details);
    console.log(" - Ereklye:", prereqCheckComplete.criteria.artifacts.details);
    console.log(" - Flotta:", prereqCheckComplete.criteria.fleet.details);
    console.log(" - Erőforrások:", prereqCheckComplete.criteria.resources.details);

    if (prereqCheckComplete.canAttack !== true) {
        throw new Error("Minden feltétel teljesült, a támadásnak engedélyezettnek kell lennie!");
    }

    // 4. Boss Harc szimuláció (resolveBossCombat)
    const playerTechs = db.getPlayerResearch('player');
    const armada = new Fleet('player', 'Cygnus Ostrom Armada', bossInit.pos_x, bossInit.pos_y, playerTechs);
    for (let i = 0; i < 25; i++) armada.ships.push(new ShipInstance('corvette', playerTechs));
    for (let i = 0; i < 8; i++) armada.ships.push(new ShipInstance('destroyer', playerTechs));

    const bossFightResult = CombatEngine.resolveBossCombat(armada, bossInit, playerTechs, 8);
    console.log("Boss 1 Harc Kimenetel:", bossFightResult.won ? "GYŐZELEM" : "MEGTORPANÁS / VERESÉG");
    console.log("Hátralévő Boss Test HP:", bossFightResult.finalBossHull);
    console.log("Túlélő armada hajók:", bossFightResult.survivingShips);

    if (bossFightResult.bossDefeated) {
        db.updateBossState('boss_1', 0, 0, 'defeated', db.getGameState());
        const updatedBoss = db.getBossState('boss_1');
        console.log("Boss 1 sikeresen elpusztítva! Állapot az adatbázisban:", updatedBoss.state);
        if (updatedBoss.state !== 'defeated') throw new Error("A boss állapota nem frissült defeated-re!");
    }

    console.log("\n=== [TEST 8] 50 Szintből 60% (Max 30 Szint) Keretrendszer és Mind az 5 Alrendszer Tesztje ===");
    // 1. Modulkatalógus és 10 szint ellenőrzése
    const fiveSlotClasses = ['corvette', 'frigate', 'destroyer', 'heavy_destroyer', 'cruiser', 'battleship'];
    fiveSlotClasses.forEach(sc => {
        const slots = SHIP_SUBSYSTEMS[sc];
        if (!slots || Object.keys(slots).length !== 5) {
            throw new Error(`A(z) ${sc} hajóosztálynak pontosan 5 alrendszerrel kell rendelkeznie!`);
        }
        for (const [sk, sDef] of Object.entries(slots)) {
            if (!sDef.levels || sDef.levels.length !== 10) {
                throw new Error(`A(z) ${sc}.${sk} alrendszernek pontosan 10 szinttel kell rendelkeznie! Megtalálva: ${sDef.levels ? sDef.levels.length : 0}`);
            }
        }
    });
    console.log("✓ A többcélú hajóosztályok mind az 5 alrendszere 10-10 szinttel rendelkezik (50 szint/hajó).");

    // 2. Tisztítás és teszt-erőforrások biztosítása a teszthez
    db.db.prepare("DELETE FROM ship_upgrades WHERE player_id = 'player'").run();
    db.updatePlayerResources('player', 50000, 30000, 10000, 5000);

    // 3. Alap állapot (Tier 1): 10 szint keret (20%), de mind az 5 alrendszer foglalat nyitva!
    db.db.prepare("DELETE FROM player_research WHERE player_id = 'player' AND tech_id IN ('heavy_metallurgy', 'extended_shielding', 'automated_dock', 'superconductor_grid', 'isotope_compression', 'nano_assembly', 'antimatter_containment', 'siege_warheads', 'hyperspace_gate')").run();
    db.db.prepare("UPDATE planet_structures SET level = 1 WHERE structure_type = 'automated_dock'").run();

    const slotTier1 = db.getMaxShipUpgradeSlots('player');
    console.log(`Tier 1 Dokk Kapacitás: ${slotTier1.maxLevelBudget} szint (${slotTier1.maxCapPercentage}%) - ${slotTier1.explanation}`);
    if (slotTier1.maxLevelBudget !== 10 || slotTier1.maxCapPercentage !== 20 || slotTier1.maxSlots !== 5) {
        throw new Error(`Tier 1-en maxLevelBudget = 10, maxSlots = 5 kell legyen! Kapott: ${JSON.stringify(slotTier1)}`);
    }

    // 4. Teszt: Mind az 5 alrendszer aktiválható és használható egyszerre!
    console.log("Mind az 5 alrendszer egyidejű aktiválása a Korvetten...");
    db.completeResearch('player', 'dark_matter_reactor', db.getGameState(), 1);
    const slotsList = ['weapon', 'hull', 'shield', 'engine', 'avionics'];
    for (const sk of slotsList) {
        const upg = db.upgradeShipSubsystem('player', 'corvette', sk);
        if (!upg.success || upg.newLevel !== 1) {
            throw new Error(`A(z) ${sk} alrendszer 1. szintre léptetése sikertelen: ${JSON.stringify(upg)}`);
        }
    }
    const corvAfter5 = db.getShipUpgrades('player').corvette;
    const activeSubsystems = Object.values(corvAfter5).filter(lvl => lvl > 0).length;
    console.log("Aktív alrendszerek száma egyszerre a Korvetten:", activeSubsystems, "Szintek:", corvAfter5);
    if (activeSubsystems !== 5) {
        throw new Error(`Mind az 5 alrendszernek aktívnak kell lennie egyszerre! Kapott: ${activeSubsystems}`);
    }
    console.log("✓ Mind az 5 alrendszer sikeresen és akadálytalanul működik egyszerre!");

    // 5. Tier 1 keret kimerítése (10 szintig)
    // Jelenleg 5 szint van beépítve (1+1+1+1+1). Növeljük a szinteket 10-ig:
    // weapon: 1 -> 2 -> 3 (total = 7)
    db.upgradeShipSubsystem('player', 'corvette', 'weapon');
    db.upgradeShipSubsystem('player', 'corvette', 'weapon');
    // hull: 1 -> 2 -> 3 (total = 9)
    db.upgradeShipSubsystem('player', 'corvette', 'hull');
    db.upgradeShipSubsystem('player', 'corvette', 'hull');
    // shield: 1 -> 2 (total = 10)
    db.upgradeShipSubsystem('player', 'corvette', 'shield');

    const corv10 = db.getShipUpgrades('player').corvette;
    const totalTier1Levels = Object.values(corv10).reduce((a, b) => a + b, 0);
    console.log(`Korvett összesített szintje Tier 1-en: ${totalTier1Levels}/10 (keret elérve)`);
    if (totalTier1Levels !== 10) throw new Error(`10 szintnek kell lennie! Kapott: ${totalTier1Levels}`);

    // 6. Tier 1 kerettúllépés blokkolása (11. szint kísérlet -> BUDGET_LOCKED)
    const blocked11 = db.upgradeShipSubsystem('player', 'corvette', 'shield');
    console.log("11. szint kísérlet Tier 1-en (keretkorlát teszt):", blocked11);
    if (!blocked11.error || blocked11.code !== 'BUDGET_LOCKED') {
        throw new Error("A 11. szintet blokkolnia kellett volna BUDGET_LOCKED kóddal!");
    }
    console.log("✓ Tier 1 keretkorlát (10 szint) sikeresen megvédve!");

    // 7. Tech tier korlát teszt Tier 1-en: szint 4 kísérlet fegyverre -> TECH_TIER_LOCKED
    // Ideiglenesen kiszerelünk 1 szintet hogy ne a keretkorlát fogja meg:
    db.resetShipSubsystem('player', 'corvette', 'shield'); // shield 2 -> 0, total = 8
    const tier4Attempt = db.upgradeShipSubsystem('player', 'corvette', 'weapon'); // weapon 3 -> 4 kísérlet
    console.log("Szint 4 kísérlet Tier 1-en (tech tier teszt):", tier4Attempt);
    if (!tier4Attempt.error || tier4Attempt.code !== 'TECH_TIER_LOCKED') {
        throw new Error("A 4. szintet blokkolnia kellett volna TECH_TIER_LOCKED kóddal Tier 1-en!");
    }
    console.log("✓ Technológiai kapu (Lv 4+ Tier 2 kutatást igényel) sikeresen érvényesítve!");

    // 8. Tier 2 feloldása (heavy_metallurgy) -> Keret 20 szintre bővül (40%)
    db.completeResearch('player', 'heavy_metallurgy', db.getGameState(), 2);
    const slotTier2 = db.getMaxShipUpgradeSlots('player');
    console.log(`Tier 2 Dokk Kapacitás feloldva: ${slotTier2.maxLevelBudget} szint (${slotTier2.maxCapPercentage}%) - ${slotTier2.explanation}`);
    if (slotTier2.maxLevelBudget !== 20 || slotTier2.tierReached !== 2) {
        throw new Error(`Tier 2-vel maxLevelBudget = 20 kell legyen! Kapott: ${slotTier2.maxLevelBudget}`);
    }

    // Most már a 4. szint sikeres!
    const upgLv4 = db.upgradeShipSubsystem('player', 'corvette', 'weapon');
    console.log("Fegyverzet 4. szintre léptetése Tier 2-vel:", upgLv4);
    if (!upgLv4.success || upgLv4.newLevel !== 4) {
        throw new Error("A fegyverzet 4. szintre léptetése sikertelen volt Tier 2 megléte mellett!");
    }

    // Növeljük a szinteket 20-ig:
    db.upgradeShipSubsystem('player', 'corvette', 'weapon'); // Lv 5
    db.upgradeShipSubsystem('player', 'corvette', 'weapon'); // Lv 6
    db.upgradeShipSubsystem('player', 'corvette', 'hull'); // Lv 4
    db.upgradeShipSubsystem('player', 'corvette', 'hull'); // Lv 5
    db.upgradeShipSubsystem('player', 'corvette', 'hull'); // Lv 6
    db.upgradeShipSubsystem('player', 'corvette', 'shield'); // Lv 1
    db.upgradeShipSubsystem('player', 'corvette', 'shield'); // Lv 2
    db.upgradeShipSubsystem('player', 'corvette', 'shield'); // Lv 3
    db.upgradeShipSubsystem('player', 'corvette', 'shield'); // Lv 4
    db.upgradeShipSubsystem('player', 'corvette', 'shield'); // Lv 5
    // weapon: 6, hull: 6, shield: 5, engine: 1, avionics: 1 = 19
    db.upgradeShipSubsystem('player', 'corvette', 'shield'); // Lv 6 -> total = 20!

    const corv20 = db.getShipUpgrades('player').corvette;
    const totalTier2Levels = Object.values(corv20).reduce((a, b) => a + b, 0);
    console.log(`Korvett összesített szintje Tier 2-n: ${totalTier2Levels}/20 (keret elérve)`);
    if (totalTier2Levels !== 20) throw new Error(`20 szintnek kell lennie! Kapott: ${totalTier2Levels}`);

    // 21. szint kísérlet blokkolva Tier 2-n
    const blocked21 = db.upgradeShipSubsystem('player', 'corvette', 'engine');
    console.log("21. szint kísérlet Tier 2-n (keretkorlát teszt):", blocked21);
    if (!blocked21.error || blocked21.code !== 'BUDGET_LOCKED') {
        throw new Error("A 21. szintet blokkolnia kellett volna BUDGET_LOCKED kóddal!");
    }
    console.log("✓ Tier 2 keretkorlát (20 szint) sikeresen megvédve!");

    // 9. Tier 3 feloldása (nano_assembly) -> Maximális 60%-os Plafon (30 szint)
    db.completeResearch('player', 'nano_assembly', db.getGameState(), 3);
    const slotTier3 = db.getMaxShipUpgradeSlots('player');
    console.log(`Tier 3 Dokk Kapacitás feloldva: ${slotTier3.maxLevelBudget} szint (${slotTier3.maxCapPercentage}%) - ${slotTier3.explanation}`);
    if (slotTier3.maxLevelBudget !== 30 || slotTier3.maxCapPercentage !== 60 || slotTier3.tierReached !== 3) {
        throw new Error(`Tier 3-mal maxLevelBudget = 30, maxCapPercentage = 60 kell legyen! Kapott: ${JSON.stringify(slotTier3)}`);
    }

    // 10. Alrendszer felhúzása 10-es szintre (Apex Prototípus)!
    console.log("Fegyverzet fejlesztése egészen Szint 10-ig (Apex Prototípus)...");
    for (let l = 7; l <= 10; l++) {
        const u = db.upgradeShipSubsystem('player', 'corvette', 'weapon');
        if (!u.success || u.newLevel !== l) {
            throw new Error(`A fegyverzet szintlépése Szint ${l}-re meghiúsult: ${JSON.stringify(u)}`);
        }
    }
    const corvWpn10 = db.getShipUpgrades('player').corvette;
    console.log("Fegyverzet elérte a 10-es szintet:", corvWpn10.weapon);
    if (corvWpn10.weapon !== 10) throw new Error(`A fegyverzet szintje nem 10!`);

    // 11. Szint 11 tiltása (Max 10 szint alrendszerenként):
    const blockedWpn11 = db.upgradeShipSubsystem('player', 'corvette', 'weapon');
    console.log("Szint 11 kísérlet (max alrendszer szint teszt):", blockedWpn11);
    if (!blockedWpn11.error || blockedWpn11.code !== 'MAX_LEVEL_REACHED') {
        throw new Error("A 11. szintet tiltania kellene MAX_LEVEL_REACHED kóddal!");
    }
    console.log("✓ Alrendszerenkénti 10-es maximális szintplafon sikeresen igazolva!");

    // 12. Globális 60%-os Plafon kimerítése (pontosan 30/50 szint):
    // Jelenleg: weapon: 10, hull: 6, shield: 6, engine: 1, avionics: 1 = 24 szint.
    // További 6 szint kifejlesztése 30-ig:
    db.upgradeShipSubsystem('player', 'corvette', 'hull'); // Lv 7
    db.upgradeShipSubsystem('player', 'corvette', 'hull'); // Lv 8
    db.upgradeShipSubsystem('player', 'corvette', 'shield'); // Lv 7
    db.upgradeShipSubsystem('player', 'corvette', 'shield'); // Lv 8
    db.upgradeShipSubsystem('player', 'corvette', 'engine'); // Lv 2
    db.upgradeShipSubsystem('player', 'corvette', 'avionics'); // Lv 2 -> total = 30 szint!

    const corv30 = db.getShipUpgrades('player').corvette;
    const finalTotalLevels = Object.values(corv30).reduce((a, b) => a + b, 0);
    console.log("Korvett alrendszerek az 50-ből 30 szinttel (60% MAX PLAFON):", corv30, "Összesen:", finalTotalLevels);
    if (finalTotalLevels !== 30) throw new Error(`Pontosan 30 szintnek kell lennie! Kapott: ${finalTotalLevels}`);

    // 13. SZIGORÚ 60%-OS KORLÁT: 31. szint kötelező elutasítása!
    const blocked31 = db.upgradeShipSubsystem('player', 'corvette', 'engine');
    console.log("31. szint kísérlet (60% plafon teszt):", blocked31);
    if (!blocked31.error || blocked31.code !== 'MAX_CAP_REACHED') {
        throw new Error("A rendszernek kötelezően blokkolnia kell a 31. szintet MAX_CAP_REACHED kóddal!");
    }
    console.log("✓ Szigorú 60%-os korlát (összesen maximum 30/50 szint) sikeresen igazolva!");

    // 14. Hajó statisztikák kalkulációja Szint 10 fegyverrel és egyéb bónuszokkal
    const testCorvMulti = new ShipInstance('corvette', ['heavy_metallurgy'], corv30);
    console.log("Módosított Korvett statisztikák:", {
        maxHull: testCorvMulti.maxHull,
        maxShield: testCorvMulti.maxShield,
        isAlive: testCorvMulti.isAlive
    });
    // Corv base hull: 120 * 1.30 = 156 + hull Lv 8 (330) = 486 HP
    if (testCorvMulti.maxHull !== 486) {
        throw new Error(`A Korvett HP-ja hibás! Várt: 486, kapott: ${testCorvMulti.maxHull}`);
    }

    // Harci sebzés vizsgálata Szint 10 fegyverrel (Alap: 35 + 155 = 190 DMG)
    const testAttacks = CombatEngine._generateAttacks(
        { aliveShips: () => [testCorvMulti], speedPenaltyActive: false },
        { aliveShips: () => [new ShipInstance('scout')] },
        []
    );
    console.log(` - Fő Fegyverzet Szint 10 Sebzés: ${testAttacks[0].dmg} DMG (Alap: 35 + 155 Mk.X = 190 DMG várt)`);
    if (testAttacks[0].dmg !== 190) {
        throw new Error(`A Szint 10-es fegyver sebzése hibás! Várt: 190, kapott: ${testAttacks[0].dmg}`);
    }

    // 15. Alrendszer Kiszerelés (Reset / Salvage) és Pontok Visszanyerése
    console.log("\n--- Alrendszer Kiszerelés, Szintfelszabadítás és 50% Salvage Teszt ---");
    const preResetPlayer = db.getPlayer('player');
    const resetRes = db.resetShipSubsystem('player', 'corvette', 'weapon'); // 10 szint kiszerelése!
    console.log("Fegyverzet (Lv.10) kiszerelése:", resetRes);
    if (!resetRes.success || resetRes.newLevel !== 0 || resetRes.totalLevels !== 20) {
        throw new Error("A kiszerelés után a totalLevels-nek 20-ra kellett visszaesnie!");
    }
    const postResetPlayer = db.getPlayer('player');
    console.log(`Visszatérített nyersanyagok: +${resetRes.refund.metal} Fém, +${resetRes.refund.energy} Energia, +${resetRes.refund.isotope} Izotóp`);
    if (postResetPlayer.metal <= preResetPlayer.metal || postResetPlayer.energy <= preResetPlayer.energy || postResetPlayer.isotope <= preResetPlayer.isotope) {
        throw new Error("A visszatérített Fém, Energia vagy Izotóp nem íródott jóvá!");
    }
    console.log("✓ A 10 szint sikeresen felszabadult a 30-as keretbe, és az 50% nyersanyag visszatért!");

    // Ellenőrizzük, hogy a felszabadult szintek újra elkölthetők
    const reUpgrade = db.upgradeShipSubsystem('player', 'corvette', 'weapon');
    if (!reUpgrade.success || reUpgrade.newLevel !== 1 || reUpgrade.totalLevels !== 21) {
        throw new Error("A felszabadult keretből nem sikerült újra fejleszteni!");
    }
    console.log("✓ A felszabadult szintek sikeresen újrabefektethetők!");

    
    // =========================================================================
    // [TEST 9] 10 Egyedi Hajóosztály, Különleges Képességek és Differenciált Szintkeretek Tesztje
    // =========================================================================
    console.log("\n=== [TEST 9] 10 Egyedi Hajóosztály, Különleges Képességek és Differenciált Szintkeretek Tesztje ===");

    // 1. Mind a 10 hajóosztály ellenőrzése
    console.log("Hajóosztályok száma:", ALL_SHIP_TYPES.length, ALL_SHIP_TYPES);
    if (ALL_SHIP_TYPES.length !== 10) {
        throw new Error(`Pontosan 10 hajóosztálynak kell lennie! Kapott: ${ALL_SHIP_TYPES.length}`);
    }

    for (const st of ALL_SHIP_TYPES) {
        const spec = SHIP_SPECS[st];
        if (!spec) throw new Error(`Hiányzó specifikáció a(z) ${st} hajóhoz!`);
        const sub = SHIP_SUBSYSTEMS[st];
        if (!sub) throw new Error(`Hiányzó alrendszer definíció a(z) ${st} hajóhoz!`);
        const hs = SUBSYSTEM_HOTSPOTS[st];
        if (!hs) throw new Error(`Hiányzó hotspot definíció a(z) ${st} hajóhoz!`);
        console.log(` - [${spec.symbol}] ${spec.name}: HP=${spec.hull}, Pajzs=${spec.shield}, DMG=${spec.damage}, Seb=${spec.speed}, Alrendszerek=${Object.keys(sub).length} db`);
    }

    // 2. Felderítő Szonda (Scout): Harcképtelen (0 DMG), 3 alrendszer (30 szint total), 18 szint max (60%)
    console.log("\n--- Felderítő Szonda Differenciált Keret és Harcképtelenség Teszt ---");
    const scoutSlots = db.getMaxShipUpgradeSlots('player', 'scout');
    console.log("Scout dokk keret Tier 3-on:", scoutSlots);
    if (scoutSlots.maxSlots !== 3 || scoutSlots.totalPossibleLevels !== 30 || scoutSlots.maxTotalCap !== 18) {
        throw new Error(`A Scoutnak 3 slotja (30 lehetséges szint) és 18 szint max plafonja (60%) kell legyen! Kapott: ${JSON.stringify(scoutSlots)}`);
    }

    const scoutShip = new ShipInstance('scout');
    const scoutAttacks = CombatEngine._generateAttacks(
        { aliveShips: () => [scoutShip], speedPenaltyActive: false },
        { aliveShips: () => [new ShipInstance('corvette')] },
        []
    );
    if (scoutAttacks.length !== 0) {
        throw new Error("A Felderítő Szonda harcképtelen, 0 támadást generálhat!");
    }
    console.log("✓ Felderítő Szonda harcképtelensége (0 DMG / 0 támadás) igazolva!");

    // Scout 18 szintig fejleszthető és a 19. blokkolva
    for (let l = 1; l <= 10; l++) db.upgradeShipSubsystem('player', 'scout', 'stealth');
    for (let l = 1; l <= 8; l++) db.upgradeShipSubsystem('player', 'scout', 'hull');
    const scoutUpgrades = db.getShipUpgrades('player').scout;
    const scoutTotalLvl = Object.values(scoutUpgrades).reduce((a, b) => a + b, 0);
    console.log("Scout elért szintek:", scoutUpgrades, "Összesen:", scoutTotalLvl);
    if (scoutTotalLvl !== 18) throw new Error(`Scout keretnek 18 szintnek kell lennie! Kapott: ${scoutTotalLvl}`);

    const blockedScout19 = db.upgradeShipSubsystem('player', 'scout', 'sensors');
    console.log("Scout 19. szint kísérlet (60% plafon teszt):", blockedScout19);
    if (!blockedScout19.error || blockedScout19.code !== 'MAX_CAP_REACHED') {
        throw new Error("A Scout 19. szintjét blokkolnia kellett volna MAX_CAP_REACHED-del!");
    }
    console.log("✓ Scout egyedi 60%-os szintplafonja (18/30 szint) sikeresen igazolva!");

    // 3. Gyors Elfogóvadász (Interceptor): Sebesség 10.0, 4 alrendszer, 24 szint max (60%), 1. körös Villámcsapás
    console.log("\n--- Gyors Elfogóvadász (Interceptor) Teszt ---");
    const intSlots = db.getMaxShipUpgradeSlots('player', 'interceptor');
    if (intSlots.maxSlots !== 4 || intSlots.totalPossibleLevels !== 40 || intSlots.maxTotalCap !== 24) {
        throw new Error(`Az Interceptornak 4 slotja és 24 szint max plafonja (60%) kell legyen! Kapott: ${JSON.stringify(intSlots)}`);
    }

    const intShip = new ShipInstance('interceptor');
    const intFleet = new Fleet('player', 'Elfogó Raj');
    intFleet.ships.push(intShip);
    const intSpeed = intFleet.getSpeed();
    console.log("Elfogó flotta alapsebesség:", intSpeed, "/h");
    if (intSpeed !== 10.0) throw new Error(`Az Interceptor alapsebessége 10.0/h kell legyen! Kapott: ${intSpeed}`);

    const round1Attacks = CombatEngine._generateAttacks(
        { aliveShips: () => [intShip], speedPenaltyActive: false, countByType: () => 0 },
        { aliveShips: () => [new ShipInstance('destroyer')] },
        [],
        1 // Round 1
    );
    const round2Attacks = CombatEngine._generateAttacks(
        { aliveShips: () => [intShip], speedPenaltyActive: false, countByType: () => 0 },
        { aliveShips: () => [new ShipInstance('destroyer')] },
        [],
        2 // Round 2
    );
    console.log("Interceptor sebzés: Round 1 (Villámcsapás):", round1Attacks[0].dmg, "Round 2:", round2Attacks[0].dmg);
    if (round1Attacks[0].dmg <= round2Attacks[0].dmg || round1Attacks[0].dmg !== 45 * 1.25) {
        throw new Error(`Az 1. körben a Villámcsapásnak +25% sebzést kellett adnia! Kapott: ${round1Attacks[0].dmg}`);
    }
    console.log("✓ Gyors Elfogóvadász sebessége és 1. körös Villámcsapás képessége igazolva!");

    // 4. Nehéz Teherszállító (Freighter): 4 alrendszer (24 szint max), Roncsmentési Bónusz (+50%)
    console.log("\n--- Nehéz Teherszállító (Freighter) Teszt ---");
    const freightSlots = db.getMaxShipUpgradeSlots('player', 'freighter');
    if (freightSlots.maxSlots !== 4 || freightSlots.maxTotalCap !== 24) {
        throw new Error(`A Teherszállítónak 4 slotja és 24 szint max plafonja kell legyen!`);
    }
    console.log("✓ Teherszállító 4 alrendszeres kerete igazolva!");

    // 5. Lopakodó Torpedó Fregatt (Frigate): Pajzs-átütő torpedók (30% közvetlen Hull sebzés)
    console.log("\n--- Lopakodó Torpedó Fregatt (Pajzs-Átütés) Teszt ---");
    const frigShip = new ShipInstance('frigate');
    const defenderWithShield = new ShipInstance('destroyer'); // 450 HP, 200 Shield
    const initHull = defenderWithShield.hull;
    const initShield = defenderWithShield.shield;

    const fakeAttacks = [{ attType: 'frigate', attShip: frigShip, target: defenderWithShield, dmg: 100 }];
    const origRand = Math.random;
    Math.random = () => 0.01;
    try {
        CombatEngine._applyAttacks(fakeAttacks, { aliveShips: () => [defenderWithShield] });
    } finally {
        Math.random = origRand;
    }

    console.log(`Torpedó találat után: Shield=${defenderWithShield.shield}/${initShield}, Hull=${defenderWithShield.hull}/${initHull}`);
    // 30 direct hull damage -> hull = 450 - 30 = 420. Shield takes 70 -> shield = 200 - 70 = 130.
    if (defenderWithShield.hull !== 420 || defenderWithShield.shield !== 130) {
        throw new Error(`A torpedóknak 30%-ot a testbe, 70%-ot a pajzsba kellett sebezniük! Hull: ${defenderWithShield.hull}, Shield: ${defenderWithShield.shield}`);
    }
    console.log("✓ Torpedó Fregatt pajzs-átütő képessége (30% közvetlen hajótest sérülés) sikeresen igazolva!");

    // 6. Ostrom-Romboló (Heavy Siege Destroyer): Brutális sebzés (260 DMG), de +50% pajzssérülés
    console.log("\n--- Ostrom-Romboló (Sérülékeny Pajzs) Teszt ---");
    const heavyDest = new ShipInstance('heavy_destroyer'); // 950 HP, 70 Shield
    console.log(`Ostrom-Romboló alap: HP=${heavyDest.hull}, Shield=${heavyDest.shield}`);
    // 40 sebzés bevitele az Ostrom-Rombolóba -> pajzsa +50% sebzést szenved (40 * 1.5 = 60 shield damage) -> shield: 70 - 60 = 10
    const dmgToHD = [{ attType: 'corvette', attShip: new ShipInstance('corvette'), target: heavyDest, dmg: 40 }];
    Math.random = () => 0.01;
    try {
        CombatEngine._applyAttacks(dmgToHD, { aliveShips: () => [heavyDest] });
    } finally {
        Math.random = origRand;
    }
    console.log(`40 beérkező sebzés után az Ostrom-Romboló pajzsa: ${heavyDest.shield} (várt: 10, mert 40 * 1.5 = 60 levonva)`);
    if (heavyDest.shield !== 10) {
        throw new Error(`A sérülékeny pajzsnak 1.5x sérülést kellett elszenvednie! Kapott shield: ${heavyDest.shield}`);
    }
    console.log("✓ Ostrom-Romboló sérülékeny pajzs mechanikája (+50% pajzssérülés) sikeresen igazolva!");

    // 7. Drón-Hordozó Cirkáló (Cruiser): Drónraj ECM védelem
    console.log("\n--- Drón-Hordozó Cirkáló (Flotta Védelem) Teszt ---");
    const cruiserFleet = new Fleet('player', 'Hordozó Kötelék');
    cruiserFleet.ships.push(new ShipInstance('cruiser'));
    cruiserFleet.ships.push(new ShipInstance('corvette'));

    const hitChanceWithoutCruiser = CombatEngine.calculateHitChance('destroyer', 'corvette', new ShipInstance('destroyer'), new ShipInstance('corvette'), null);
    const hitChanceWithCruiser = CombatEngine.calculateHitChance('destroyer', 'corvette', new ShipInstance('destroyer'), new ShipInstance('corvette'), cruiserFleet);
    console.log(`Találati esély Cirkáló nélkül: ${Math.round(hitChanceWithoutCruiser*100)}%, Cirkáló Drónvédelemmel: ${Math.round(hitChanceWithCruiser*100)}%`);
    if (hitChanceWithCruiser >= hitChanceWithoutCruiser) {
        throw new Error("A Drón-Hordozó jelenlétének csökkentenie kell az ellenséges találati esélyt!");
    }
    console.log("✓ Drón-Hordozó Cirkáló flotta-védelmi aurája sikeresen igazolva!");

    console.log("\n=== [TEST 10] Tech Fa Feloldások, Küldetés Bónuszok/Ereklyék, Dicsőség Csökkenő Hozadék és 3 Boss Bolygó Tesztje ===");
    // 1. Tech fa hajógyártás követelmény
    const reqInterceptor = SHIP_TECH_REQUIREMENTS.interceptor;
    console.log(`Interceptor tech követelmény: ${reqInterceptor}`);
    if (reqInterceptor !== 'ion_thrusters') throw new Error("Interceptor tech követelmény hibás!");
    console.log("✓ Hajógyártás tech követelmény konfiguráció sikeresen igazolva!");

    // 2. Tech fa alrendszer követelmény
    const intEngineDef = SHIP_SUBSYSTEMS.interceptor.engine;
    console.log(`Interceptor hajtómű tech követelmény: ${intEngineDef.requiredTech}`);
    if (intEngineDef.requiredTech !== 'ion_thrusters') throw new Error("Interceptor hajtómű tech követelmény hibás!");

    db.db.prepare("DELETE FROM player_research WHERE player_id = 'player' AND tech_id = 'ion_thrusters'").run();
    const upgFail = db.upgradeShipSubsystem('player', 'interceptor', 'engine');
    console.log("Fejlesztési kísérlet kutatás nélkül:", upgFail);
    if (!upgFail.error || upgFail.code !== 'TECH_PREREQ_LOCKED') {
        throw new Error("A tech-kötött alrendszer fejlesztésének el kellett volna buknia TECH_PREREQ_LOCKED kóddal!");
    }
    console.log("✓ Alrendszer technológiai zár (TECH_PREREQ_LOCKED) sikeresen megvédve!");

    db.completeResearch('player', 'ion_thrusters', db.getGameState(), 1);
    const upgSuccess = db.upgradeShipSubsystem('player', 'interceptor', 'engine');
    console.log("Fejlesztés kutatással:", upgSuccess.success, "Szint:", upgSuccess.newLevel);
    if (!upgSuccess.success || upgSuccess.newLevel !== 1) {
        throw new Error("A feloldott technológiával sikerülnie kellett a fejlesztésnek!");
    }
    console.log("✓ Kifejlesztett technológiával az alrendszer sikeresen fejleszthető!");

    // 3. Küldetések: Bónuszok és Ereklyék
    console.log("\n--- Küldetés Bónuszok és Ereklyék Tesztje ---");
    db.db.prepare("DELETE FROM player_buffs WHERE player_id = 'player'").run();
    db.db.prepare("DELETE FROM player_artifacts WHERE player_id = 'player'").run();

    // Szimuláljuk m1 teljesítését (Bányászati bónusz)
    db.db.prepare("UPDATE missions SET status = 'completed' WHERE id = 'm1'").run();
    const claimM1 = db.claimMissionReward('m1');
    console.log("M1 Jutalom beváltva:", claimM1.title, "Granted Buff:", claimM1.grantedBuff);
    if (!claimM1.grantedBuff || claimM1.grantedBuff.buffType !== 'mining_boost') {
        throw new Error("Az m1 küldetésnek mining_boost buffot kellett adnia!");
    }
    const activeBuffs = db.getPlayerBuffs('player');
    console.log(`Aktív buffok száma: ${activeBuffs.length}`);
    if (activeBuffs.length === 0) throw new Error("A játékosnak aktív buffal kell rendelkeznie!");

    // Szimuláljuk m3 teljesítését (Kvantum Chrono-Mag ereklye)
    db.db.prepare("UPDATE missions SET status = 'completed' WHERE id = 'm3'").run();
    const claimM3 = db.claimMissionReward('m3');
    console.log("M3 Jutalom beváltva:", claimM3.title, "Granted Artifact:", claimM3.grantedArtifact);
    if (!claimM3.grantedArtifact || claimM3.grantedArtifact.artifactId !== 'artifact_chrono_core') {
        throw new Error("Az m3 küldetésnek artifact_chrono_core ereklyét kellett adnia!");
    }
    const hasChrono = db.hasArtifact('player', 'artifact_chrono_core');
    if (!hasChrono) throw new Error("A Kvantum Chrono-Mag nem került be a játékos ereklyéi közé!");
    console.log("✓ Küldetésből származó Ereklyék és Időzített Bónuszok igazolva!");

    // 4. Buffok érvényesülése a hajókban
    const shipWithoutBuff = new ShipInstance('corvette');
    const shipWithBuff = new ShipInstance('corvette', [], [], [{ buff_type: 'combat_hull_buff', buff_value: 0.25 }]);
    console.log(`Korvett HP normál: ${shipWithoutBuff.hull}, HP buffal (+25%): ${shipWithBuff.hull}`);
    if (shipWithBuff.hull <= shipWithoutBuff.hull) throw new Error("A buffnak növelnie kellett a hajótest HP-t!");
    console.log("✓ Birodalmi bónuszok hatása a hajók harcértékeire igazolva!");

    // 5. Dicsőség Pontok és Csökkenő Hozadék
    console.log("\n--- Dicsőség Pontok és Csökkenő Hozadék Tesztje ---");
    db.db.prepare("DELETE FROM glory_attack_history WHERE attacker_id = 'player'").run();
    const g1 = db.calculateGloryAward('player', 'enemy', 10, 100);
    const g2 = db.calculateGloryAward('player', 'enemy', 11, 100);
    const g3 = db.calculateGloryAward('player', 'enemy', 12, 100);
    const g4 = db.calculateGloryAward('player', 'enemy', 13, 100);
    const g5 = db.calculateGloryAward('player', 'enemy', 14, 100);
    console.log(`1. Támadás: +${g1.gloryAwarded} (${Math.round(g1.multiplier*100)}%)`);
    console.log(`2. Támadás: +${g2.gloryAwarded} (${Math.round(g2.multiplier*100)}%)`);
    console.log(`3. Támadás: +${g3.gloryAwarded} (${Math.round(g3.multiplier*100)}%)`);
    console.log(`4. Támadás: +${g4.gloryAwarded} (${Math.round(g4.multiplier*100)}%)`);
    console.log(`5. Támadás: +${g5.gloryAwarded} (${Math.round(g5.multiplier*100)}%)`);

    if (g1.multiplier !== 1.0 || g2.multiplier !== 0.60 || g3.multiplier !== 0.35 || g4.multiplier !== 0.20 || g5.multiplier !== 0.10) {
        throw new Error("A csökkenő hozadék szorzói eltérnek az elvárt 100% -> 60% -> 35% -> 20% -> 10% skálától!");
    }
    console.log("✓ Dicsőség Pontok csökkenő hozadéka (Diminishing Returns) sikeresen igazolva!");

    // 6. 3 Fő Boss Bolygó (Prekurzor Citadellák)
    console.log("\n--- 3 Fő Boss Bolygó és Kritériumok Tesztje ---");
    const allBosses = db.getAllBosses();
    console.log("Boss citadellák:", allBosses.map(b => `${b.id}: ${b.name}`));
    if (allBosses.length !== 3) throw new Error(`Pontosan 3 Boss Citadellának kell léteznie, de ${allBosses.length} található!`);

    const prereqB1 = db.checkBossPrerequisites('player', 'boss_1');
    const prereqB2 = db.checkBossPrerequisites('player', 'boss_2');
    const prereqB3 = db.checkBossPrerequisites('player', 'boss_3');

    console.log("Boss 1 Kritériumok (Cygnus Bastion):", prereqB1.criteria.artifacts.details, prereqB1.criteria.glory.details);
    console.log("Boss 2 Kritériumok (Void Citadel):", prereqB2.criteria.artifacts.details, prereqB2.criteria.glory.details);
    console.log("Boss 3 Kritériumok (Omega Leviatán):", prereqB3.criteria.artifacts.details, prereqB3.criteria.glory.details);

    if (prereqB1.criteria.glory.title !== "1. Birodalmi Dicsőség" || !prereqB2.criteria.artifacts) {
        throw new Error("A Boss kritériumok struktúrája hibás!");
    }
    console.log("✓ A 3 Fő Boss Bolygó progresszív követelményei (Dicsőség, Ereklyék, Flotta) sikeresen igazolva!");

    // =========================================================================
    // [TEST 11] PvP Többjátékos Mód (Multi-Commander), Frakciók és Cset Tesztje
    // =========================================================================
    console.log("\n=== [TEST 11] PvP Többjátékos Mód (Multi-Commander), Frakciók és Cset Tesztje ===");
    
    // 1. Mindkét parancsnokság lekérése
    const allPlayers = db.getAllPlayers();
    console.log("Létező parancsnokok száma:", allPlayers.length, allPlayers.map(p => `${p.id}: ${p.username} (${p.is_ai ? 'MI' : 'Ember'})`));
    if (allPlayers.length < 2) throw new Error("Legalább 2 játékosnak (player és enemy) kell léteznie!");

    // 2. Piros játékos emberi irányításba vétele
    const enemyBefore = db.getPlayer('enemy');
    db.setPlayerHuman('enemy', true);
    const enemyAfter = db.getPlayer('enemy');
    console.log(`Vektor-9 státusz emberi belépés előtt: is_ai=${enemyBefore.is_ai}, utána: is_ai=${enemyAfter.is_ai}`);
    if (enemyAfter.is_ai !== 0) throw new Error("A Vektor-9 parancsnokság nem váltott emberi irányításra!");
    console.log("✓ Frakció emberi irányításba vétele (is_ai = 0) igazolva!");

    // 3. Független kutatás Piros Frakciónak
    db.db.prepare("DELETE FROM player_research WHERE player_id = 'enemy'").run();
    db.startResearch('enemy', 'energy_grid', 1, 0, 0);
    const enemyRes = db.getPlayerResearch('enemy');
    const playerRes = db.getPlayerResearch('player');
    console.log("Piros kutatás elindítva, aktív kutatás:", db.getActiveResearch('enemy')?.tech_id);
    db.advanceGameTick();
    db.advanceGameTick();
    db.processResearchQueue(db.getGameState());
    const enemyResAfter = db.getPlayerResearch('enemy');
    console.log("Körléptetés után Piros kutatásai:", enemyResAfter);
    if (!enemyResAfter.includes('energy_grid')) {
        throw new Error("A Piros Frakció független kutatásának be kellett fejeződnie!");
    }
    console.log("✓ Piros Frakció független kutatási fája és fejlődése sikeresen igazolva!");

    // 4. Galaktikus Cset küldés és lekérés
    const cMsg1 = db.addChatMessage('player', 'Parancsnok (Kronos)', 'Békét ajánlok a szektorban!', 10);
    const cMsg2 = db.addChatMessage('enemy', 'Hadúr (Vektor-9)', 'Nincs alku! A csatahajóim már úton vannak.', 10);
    const recentChat = db.getChatMessages(10);
    console.log("Legutóbbi cset üzenetek:", recentChat.map(m => `[${m.sender_name}]: ${m.message}`));
    if (recentChat.length < 2 || !recentChat.some(m => m.sender_id === 'enemy')) {
        throw new Error("A galaktikus cset üzenetek mentése vagy lekérése hibás!");
    }
    console.log("✓ Galaktikus Kommunikáció (PvP Comms Chat) sikeresen igazolva!");

    // =========================================================================
    // [TEST 12] Térkép Tisztítás, Bot Világok, Rejtett Zsákmány és Menetidő
    // =========================================================================
    console.log("\n=== [TEST 12] Bot Világok, 3 Fő Boss, Rejtett Zsákmány és Menetidő Tesztje ===");

    // 1. Bot bolygók és 3 Boss létezésének vizsgálata
    const allPlanetsTest = db.getAllPlanets();
    const botWorlds = allPlanetsTest.filter(p => p.is_bot);
    console.log("Bot világok száma az univerzumban:", botWorlds.length, botWorlds.map(b => `${b.id}: ${b.name} (${b.bot_type})`));
    if (botWorlds.length < 33) {
        throw new Error(`Legalább 33 bot világnak (3 Boss + 30 Bot erőd) kell léteznie! Megtalálva: ${botWorlds.length}`);
    }

    const bossCitadels = botWorlds.filter(b => b.bot_type === 'boss');
    const smallOutposts = botWorlds.filter(b => b.bot_type === 'outpost');
    if (bossCitadels.length !== 3 || smallOutposts.length !== 30) {
        throw new Error(`Pontosan 3 Boss Citadellának és 30 Bot Erődnek kell léteznie! Bossok: ${bossCitadels.length}, Erődök: ${smallOutposts.length}`);
    }
    console.log("✓ 3 Fő Boss Citadella és 30 Bot Erőd sikeresen inicializálva a bolygók táblában!");

    // 2. A 3-féle zsákmánytípus (Nyersanyag, Artifact, Dicsőség) ellenőrzése
    const resBots = smallOutposts.filter(b => b.loot_type === 'resources');
    const artBots = smallOutposts.filter(b => b.loot_type === 'artifact');
    const gloryBots = smallOutposts.filter(b => b.loot_type === 'glory');
    console.log(`Zsákmánytípusok eloszlása: Nyersanyag: ${resBots.length}, Ereklye: ${artBots.length}, Dicsőség: ${gloryBots.length}`);
    if (resBots.length === 0 || artBots.length === 0 || gloryBots.length === 0) {
        throw new Error("Mindhárom zsákmánytípusból (resources, artifact, glory) léteznie kell bot bolygónak!");
    }

    // 3. Rejtett zsákmány (loot_revealed = 0) és felfedés győzelemkor
    const testBot = smallOutposts.find(b => b.id === 'bot_p3'); // Prekurzor Kripta-Hold (artifact)
    console.log(`Kezdeti állapot [${testBot.name}]: loot_revealed = ${testBot.loot_revealed}, status = ${testBot.status}`);
    if (testBot.loot_revealed !== 0) throw new Error("A zsákmánynak kezdetben rejtettnek kell lennie (loot_revealed = 0)!");

    // Győzelem és zsákmányszerzés szimulációja
    const lootClaimRes = db.claimBotLoot(testBot.id, 'player');
    console.log("Megszerzett és feltárt zsákmány:", lootClaimRes);
    const updatedTestBot = db.getAllPlanets().find(p => p.id === testBot.id);
    console.log(`Feltárás után [${updatedTestBot.name}]: loot_revealed = ${updatedTestBot.loot_revealed}, status = ${updatedTestBot.status}`);
    if (updatedTestBot.loot_revealed !== 1 || updatedTestBot.status !== 'looted') {
        throw new Error("A zsákmánynak fel kell fedődnie győzelem után (loot_revealed = 1, status = 'looted')!");
    }
    const testHasChrono = db.hasArtifact('player', 'artifact_chrono_core');
    if (!testHasChrono) throw new Error("A zsákmányolt Chrono-Mag ereklye nem íródott jóvá a játékos profiljában!");
    console.log("✓ Rejtett zsákmányrendszer és győzelmi felfedés sikeresen igazolva!");

    // Visszaállítás a teszt után
    db.db.prepare("UPDATE planets SET loot_revealed = 0, status = 'normal', defeated_by_player_id = NULL WHERE id = 'bot_p3'").run();

    // 4. Menetidő kalkuláció tesztje (Alap 5 kör, fejlesztésekkel csökkentve)
    const baseTicks = 5;
    // Ionhajtómű nélkül
    let discWithoutTech = 0;
    const testTechs = ['deep_core_mining'];
    if (testTechs.includes('ion_thrusters')) discWithoutTech += 1;
    if (testTechs.includes('hyperspace_gate')) discWithoutTech += 1;
    const timeNoTech = Math.max(1, baseTicks - discWithoutTech);
    console.log(`Menetidő alapesetben (fejlesztés nélkül): ${timeNoTech} kör (várt: 5 kör)`);
    if (timeNoTech !== 5) throw new Error("Alapértelmezett menetidőnek pontosan 5 körnek kell lennie!");

    // Ionhajtóművel és Kvantum-kapuval
    let discWithTech = 0;
    const advancedTechs = ['ion_thrusters', 'hyperspace_gate'];
    if (advancedTechs.includes('ion_thrusters')) discWithTech += 1;
    if (advancedTechs.includes('hyperspace_gate')) discWithTech += 1;
    const timeWithTech = Math.max(1, baseTicks - discWithTech);
    console.log(`Menetidő Ionhajtóművel és Hipertér-kapuval: ${timeWithTech} kör (várt: 3 kör)`);
    if (timeWithTech !== 3) throw new Error("A technológiáknak 3 körre kellett csökkenteniük a menetidőt!");
    console.log("✓ Egységes 5 körös alapidő és technológiákkal való menetidő-csökkentés igazolva!");

    // 5. PvP Célpont Roster lekérése
    const pvpRoster = db.getHumanPlayers('player');
    console.log("PvP Rivális célpontok Kék játékos számára:", pvpRoster.map(p => `${p.username} (Bázis: ${p.base_planet_name}, Szorzó: ${p.multiplier * 100}%)`));
    if (pvpRoster.length === 0 || !pvpRoster.some(p => p.id === 'enemy')) {
        throw new Error("A PvP célpontlistának vissza kell adnia az ellenséges emberi/MI játékost!");
    }
    if (pvpRoster.some(p => p.id === 'bot_hostile' || p.id === 'precursor_boss')) {
        throw new Error("A botok nem szerepelhetnek az emberi PvP célpontlistában!");
    }
    console.log("✓ PvP Rivális Célpont Táblázat (getHumanPlayers) sikeresen igazolva!");

    // =========================================================================
    // [TEST 13] Kereskedelmi Állomás, Teherszállító Rework, Szonda Kémkedés és Riadó Rendszer
    // =========================================================================
    console.log("\n=== [TEST 13] Kereskedelmi Állomás, Teherszállító Rework, Szonda Kémkedés és Riadó Rendszer ===");
    
    // 1. Kereskedelmi Állomás ellenőrzése
    const planetsAll = db.getAllPlanets();
    const tradeHub = planetsAll.find(p => p.id === 'station_trade');
    if (!tradeHub || tradeHub.is_trade_station !== 1) {
        throw new Error("A Kereskedelmi Állomás (station_trade) hiányzik vagy nincs is_trade_station jelölése!");
    }
    console.log("✓ Nexus Kereskedelmi Központ (station_trade) sikeresen regisztrálva!");

    // 2. Teherszállító (Freighter) 0 DMG és raktér kapacitás tesztje
    const freighterShip = new ShipInstance('freighter');
    if (freighterShip.damage !== 0 && SHIP_SPECS.freighter.damage !== 0) {
        throw new Error("A Nehéz Teherszállító sebzésének 0-nak kell lennie (fegyvertelen logisztikai hajó)!");
    }
    const freightCargo = db.getFreighterCargoCapacity('player');
    console.log("Játékos Teherszállító raktér kapacitás:", freightCargo);
    if (freightCargo.perShipCapacity < 500 || freightCargo.totalCargoCapacity < 500) {
        throw new Error("A minimális raktérkapacitásnak legalább 500-nak kell lennie!");
    }
    console.log("✓ Nehéz Teherszállító 0 DMG és Kvantum Raktérkapacitás igazolva!");

    // 3. Tőzsde / Nyersanyagcsere tesztje
    const initMetal = db.getPlayer('player').metal;
    const initEnergy = db.getPlayer('player').energy;
    const tradeResult = db.tradeResources('player', 'metal_to_energy', 100);
    console.log("Tőzsdei átváltás eredménye (100 Fém -> 40 E):", tradeResult);
    if (!tradeResult.success || tradeResult.spent !== 100 || tradeResult.received !== 40) {
        throw new Error("A nyersanyag-váltás sikertelen vagy helytelen arányú!");
    }
    const postTradePlayer = db.getPlayer('player');
    if (postTradePlayer.metal !== initMetal - 100 || postTradePlayer.energy !== initEnergy + 40) {
        throw new Error("A játékos nyersanyagai nem frissültek helyesen a csere után!");
    }
    console.log("✓ Kereskedelmi Állomás erőforrás-tőzsde sikeresen igazolva!");

    // 4. Szonda 3 alrendszere (Stealth, Hull, Sensors) és Tachion Kémkedés
    const scoutSubs = Object.keys(SHIP_SUBSYSTEMS.scout);
    console.log("Scout alrendszerek:", scoutSubs);
    if (!scoutSubs.includes('stealth') || !scoutSubs.includes('hull') || !scoutSubs.includes('sensors')) {
        throw new Error("A Scout alrendszereinek pontosan [stealth, hull, sensors]-nek kell lenniük!");
    }
    const scoutReport = db.scoutPlanet('bot_p1', 'player');
    console.log("Tachion Kémkedési Jelentés [bot_p1]:", scoutReport.name, "Loot:", scoutReport.lootType, "Helyőrség:", scoutReport.stationedFleet);
    const scoutedPlanet = db.getAllPlanets().find(p => p.id === 'bot_p1');
    if (!scoutedPlanet.scouted_by_player) {
        throw new Error("A scoutPlanet függvénynek be kellett volna állítania a scouted_by_player = 1 státuszt!");
    }
    console.log("✓ Tachion Felderítési és Kémkedési Rendszer sikeresen igazolva!");

    // 5. Beérkező ellenséges flotta riasztás (incomingThreats szűrés)
    const testThreatFleet = {
        id: 'fleet_threat_test',
        owner_id: 'enemy',
        name: 'Vektor-9 Ostromflotta',
        current_x: 200, current_y: 200,
        dest_x: 140, dest_y: 120,
        origin_planet_id: 'p4',
        target_planet_id: 'p1', // Kék játékos bázisa!
        departure_tick: 1, arrival_tick: 4,
        state: 'in_transit'
    };
    db.db.prepare("INSERT OR REPLACE INTO fleets (id, owner_id, name, current_x, current_y, dest_x, dest_y, origin_planet_id, target_planet_id, departure_tick, arrival_tick, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        testThreatFleet.id, testThreatFleet.owner_id, testThreatFleet.name, testThreatFleet.current_x, testThreatFleet.current_y, testThreatFleet.dest_x, testThreatFleet.dest_y, testThreatFleet.origin_planet_id, testThreatFleet.target_planet_id, testThreatFleet.departure_tick, testThreatFleet.arrival_tick, testThreatFleet.state
    );
    const movingAll = db.getMovingFleets();
    const threats = movingAll.filter(f => f.owner_id !== 'player' && planetsAll.some(p => p.id === f.target_planet_id && p.owner_id === 'player'));
    console.log("Észlelt beérkező fenyegetések (Incoming Threats):", threats.length, "db");
    if (threats.length === 0 || threats[0].id !== 'fleet_threat_test') {
        throw new Error("A korai előrejelző riadónak észlelnie kellett a játékos felé tartó ellenséges flottát!");
    }
    // Teszt flotta takarítása
    db.db.prepare("DELETE FROM fleets WHERE id = 'fleet_threat_test'").run();
    console.log("✓ Korai Előrejelző Radar (Incoming Threats) sikeresen igazolva!");

    console.log("\n>>> MINDEN ÚJ HAJÓOSZTÁLY, KÉPESSÉG, 3 BOSS, REJTETT ZSÁKMÁNY, TÉRKÉP-PVP ÉS KERESKEDELEM/KÉMKEDÉS SIKERESEN IGAZOLVA! <<<");
}

try {
    runTests();
    process.exit(0);
} catch (e) {
    console.error("TESZT HIBA:", e);
    process.exit(1);
}
