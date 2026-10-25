-- ============================================================================
-- SPACE 4X TACTICS - ASZINKRON ÓRÁNKÉNTI TICK STRATÉGIAI JÁTÉK ADATBÁZIS-SÉMA
-- Kompatibilis: SQLite / PostgreSQL
-- ============================================================================

-- 1. Játékosok és birodalmak táblája
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    color_hex TEXT NOT NULL DEFAULT '#3b82f6', -- pl. Kék: Saját, Piros: Ellenség
    metal REAL NOT NULL DEFAULT 500.0,
    energy REAL NOT NULL DEFAULT 200.0,
    isotope REAL NOT NULL DEFAULT 50.0,
    data_points REAL NOT NULL DEFAULT 0.0,
    glory_points REAL NOT NULL DEFAULT 0.0,
    is_ai BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bolygók táblája
CREATE TABLE IF NOT EXISTS planets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pos_x REAL NOT NULL,
    pos_y REAL NOT NULL,
    size_slots INTEGER NOT NULL DEFAULT 4, -- 3 és 6 közötti slot
    owner_id TEXT REFERENCES players(id) ON DELETE SET NULL,
    base_metal_rate REAL NOT NULL DEFAULT 25.0,  -- Fém/óra alaphozam
    base_energy_rate REAL NOT NULL DEFAULT 10.0, -- Energia/óra alaphozam
    planetary_shield_hp REAL NOT NULL DEFAULT 0.0,
    max_shield_hp REAL NOT NULL DEFAULT 0.0,
    railgun_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'normal', -- 'normal', 'under_siege', 'consolidating', 'looted', 'defeated'
    is_bot INTEGER NOT NULL DEFAULT 0,
    bot_type TEXT NULL, -- 'outpost', 'boss'
    loot_type TEXT NULL, -- 'resources', 'artifact', 'glory'
    loot_data TEXT NULL, -- JSON data
    loot_revealed INTEGER NOT NULL DEFAULT 0,
    defeated_by_player_id TEXT NULL,
    difficulty_tier INTEGER NOT NULL DEFAULT 1,
    is_trade_station INTEGER NOT NULL DEFAULT 0,
    scouted_by_player INTEGER NOT NULL DEFAULT 0
);

-- 3. Bolygói építmények és slotok
CREATE TABLE IF NOT EXISTS planet_structures (
    id TEXT PRIMARY KEY,
    planet_id TEXT NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
    slot_index INTEGER NOT NULL,
    branch_type TEXT NOT NULL, -- 'economy', 'defense', 'infrastructure'
    structure_type TEXT NOT NULL, 
    -- Lehetséges értékek:
    -- economy: 'industrial_hub' (Ipari Központ) VAGY 'trade_network' (Kereskedelmi Hálózat)
    -- defense: 'planetary_shield' (Planetáris Pajzs) VAGY 'orbital_railgun' (Orbitális Railgun)
    -- infrastructure: 'automated_dock' (Automatizált Dokk) VAGY 'sensor_array' (Szenzorállomás)
    level INTEGER NOT NULL DEFAULT 1,
    construction_finish_tick INTEGER NULL,
    UNIQUE(planet_id, slot_index)
);

-- 4. Flották táblája
CREATE TABLE IF NOT EXISTS fleets (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    current_x REAL NOT NULL,
    current_y REAL NOT NULL,
    dest_x REAL NULL,
    dest_y REAL NULL,
    origin_planet_id TEXT NULL REFERENCES planets(id) ON DELETE SET NULL,
    target_planet_id TEXT NULL REFERENCES planets(id) ON DELETE SET NULL,
    departure_tick INTEGER NULL,
    arrival_tick INTEGER NULL,
    state TEXT NOT NULL DEFAULT 'stationed' -- 'stationed', 'in_transit', 'in_combat'
);

-- 5. Flotta hajóegységei (Összetétel)
CREATE TABLE IF NOT EXISTS fleet_ships (
    id TEXT PRIMARY KEY,
    fleet_id TEXT NOT NULL REFERENCES fleets(id) ON DELETE CASCADE,
    ship_type TEXT NOT NULL, -- 'corvette', 'destroyer', 'battleship'
    count INTEGER NOT NULL DEFAULT 0,
    current_hull_total REAL NOT NULL,
    current_shield_total REAL NOT NULL
);

-- 6. Folyamatban lévő hajógyártások sora (Shipyard queue)
CREATE TABLE IF NOT EXISTS shipyard_queue (
    id TEXT PRIMARY KEY,
    planet_id TEXT NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
    ship_type TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    start_tick INTEGER NOT NULL,
    finish_tick INTEGER NOT NULL
);

-- 7. Kifejlesztett technológiák játékosonként
CREATE TABLE IF NOT EXISTS player_research (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    tech_id TEXT NOT NULL, -- pl. 'deep_core_mining', 'kinetic_calibration', stb.
    tier INTEGER NOT NULL,
    unlocked_at_tick INTEGER NOT NULL,
    UNIQUE(player_id, tech_id)
);

-- 7/B. Folyamatban lévő kutatások sora (Research Queue)
CREATE TABLE IF NOT EXISTS research_queue (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    tech_id TEXT NOT NULL,
    start_tick INTEGER NOT NULL,
    finish_tick INTEGER NOT NULL,
    duration_ticks INTEGER NOT NULL,
    UNIQUE(player_id, tech_id)
);

-- 8. Harci és eseménynaplók (Combat logs)
CREATE TABLE IF NOT EXISTS combat_logs (
    id TEXT PRIMARY KEY,
    tick_number INTEGER NOT NULL,
    pos_x REAL NOT NULL,
    pos_y REAL NOT NULL,
    location_name TEXT NOT NULL,
    attacker_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    defender_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    winner_id TEXT NULL REFERENCES players(id) ON DELETE SET NULL,
    log_text TEXT NOT NULL,
    salvage_metal REAL NOT NULL DEFAULT 0.0,
    salvage_isotope REAL NOT NULL DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Globális játékállapot (Körszámláló / Tick state)
CREATE TABLE IF NOT EXISTS game_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_tick INTEGER NOT NULL DEFAULT 1,
    last_tick_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    next_tick_timestamp TIMESTAMP NOT NULL
);

-- 10. Küldetések és Mérföldkövek (Missions & Milestones)
CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    reward_text TEXT NOT NULL,
    reward_metal REAL DEFAULT 0,
    reward_energy REAL DEFAULT 0,
    reward_isotope REAL DEFAULT 0,
    reward_data REAL DEFAULT 0,
    reward_buff_type TEXT NULL,
    reward_buff_value REAL DEFAULT 0,
    reward_buff_duration INTEGER DEFAULT 0,
    reward_artifact_id TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    sort_order INTEGER NOT NULL
);

-- 11. Végjáték Fő Boss Bolygók (3 Prekurzor Citadella)
CREATE TABLE IF NOT EXISTS boss_state (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hull REAL NOT NULL,
    max_hull REAL NOT NULL,
    shield REAL NOT NULL,
    max_shield REAL NOT NULL,
    damage REAL NOT NULL DEFAULT 300.0,
    pos_x REAL NOT NULL,
    pos_y REAL NOT NULL,
    state TEXT NOT NULL DEFAULT 'dormant', -- 'dormant', 'active', 'defeated'
    defeated_at_tick INTEGER NULL,
    salvage_metal REAL NOT NULL DEFAULT 2000.0,
    salvage_isotope REAL NOT NULL DEFAULT 1000.0
);

-- 12. Hajófejlesztések és Testreszabás (Shipyard Refit & Module Customization)
CREATE TABLE IF NOT EXISTS ship_upgrades (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    ship_type TEXT NOT NULL,
    selected_modules TEXT NOT NULL DEFAULT '[]',
    UNIQUE(player_id, ship_type)
);

-- 13. Időzített Birodalmi Bónuszok (Active Temporary Buffs)
CREATE TABLE IF NOT EXISTS player_buffs (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    buff_type TEXT NOT NULL, -- 'combat_hull_buff', 'combat_dmg_buff', 'mining_boost', 'shield_overcharge'
    buff_value REAL NOT NULL, -- pl. 0.20 (+20%)
    expires_at_tick INTEGER NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '⚡'
);

-- 14. Ősi Prekurzor Ereklyék (Player Precursor Artifacts)
CREATE TABLE IF NOT EXISTS player_artifacts (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    artifact_id TEXT NOT NULL, -- 'artifact_chrono_core', 'artifact_dark_resonator', 'artifact_codex'
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '🏺',
    acquired_at_tick INTEGER NOT NULL,
    UNIQUE(player_id, artifact_id)
);

-- 15. Dicsőség Támadási Történet (Glory History for Diminishing Returns)
CREATE TABLE IF NOT EXISTS glory_attack_history (
    id TEXT PRIMARY KEY,
    attacker_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    target_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    attack_tick INTEGER NOT NULL,
    glory_awarded REAL NOT NULL
);

-- 16. Galaktikus Kommunikáció (Galactic Comms Chat)
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    message TEXT NOT NULL,
    tick_number INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 17. Szövetségek (Alliances)
CREATE TABLE IF NOT EXISTS alliances (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    tag TEXT NOT NULL UNIQUE,
    description TEXT,
    leader_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 18. Szövetségi Tagság (Alliance Members)
CREATE TABLE IF NOT EXISTS alliance_members (
    id TEXT PRIMARY KEY,
    alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member', -- 'leader', 'officer', 'member'
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id)
);

-- 19. Szövetségi Közös Hadműveletek (Alliance Operations / War Room)
CREATE TABLE IF NOT EXISTS alliance_operations (
    id TEXT PRIMARY KEY,
    alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
    creator_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL, -- 'boss', 'player', 'planet'
    target_id TEXT NOT NULL,
    target_name TEXT NOT NULL,
    target_tick INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'recruiting', -- 'recruiting', 'in_progress', 'completed', 'canceled'
    max_participants INTEGER NOT NULL, -- 5 for boss, 3 for player
    created_at_tick INTEGER NOT NULL
);

-- 20. Hadművelet Résztvevői (Operation Participants)
CREATE TABLE IF NOT EXISTS alliance_operation_participants (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL REFERENCES alliance_operations(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    ships TEXT NOT NULL DEFAULT '{}', -- JSON: pl. {"corvette": 10, "destroyer": 4}
    joined_at_tick INTEGER NOT NULL,
    UNIQUE(operation_id, player_id)
);

-- 21. Szövetséges Védelmi Flották (Allied Defense Stationed Fleets)
CREATE TABLE IF NOT EXISTS allied_defense_fleets (
    id TEXT PRIMARY KEY,
    planet_id TEXT NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    fleet_id TEXT NOT NULL,
    arrival_tick INTEGER NOT NULL,
    state TEXT NOT NULL DEFAULT 'stationed'
);




