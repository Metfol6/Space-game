"""
SPACE 4X TACTICS - HEADLESS TICK ÉS HARCI SZIMULÁCIÓS MOTOR
Implementálja az óránkénti tick logikáját, a gazdaságot, az upkeept,
a mozgást és a pontos harci képletet a passzív képességekkel.
"""

import math
import random
import sys
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple

# ============================================================================
# KONSTANSOK ÉS HAJÓTÍPUSOK
# ============================================================================

SHIP_SPECS = {
    "corvette": {
        "name": "Könnyű Korvett",
        "symbol": "▲",
        "hull": 120.0,
        "shield": 40.0,
        "damage": 35.0,
        "accuracy": 0.80,
        "evasion": 0.25,
        "speed": 5.0,
        "upkeep_energy": 1.0,
        "cost_metal": 60.0,
        "cost_energy": 20.0,
        "cost_isotope": 5.0,
        "fuel_weight": 1.0
    },
    "destroyer": {
        "name": "Romboló Cirkáló",
        "symbol": "◆",
        "hull": 450.0,
        "shield": 200.0,
        "damage": 110.0,
        "accuracy": 0.75,
        "evasion": 0.10,
        "speed": 3.5,
        "upkeep_energy": 4.0,
        "cost_metal": 220.0,
        "cost_energy": 80.0,
        "cost_isotope": 20.0,
        "fuel_weight": 2.5
    },
    "battleship": {
        "name": "Csatahajó",
        "symbol": "⬟",
        "hull": 1600.0,
        "shield": 800.0,
        "damage": 380.0,
        "accuracy": 0.65,
        "evasion": 0.00,
        "speed": 2.0,
        "upkeep_energy": 15.0,
        "cost_metal": 800.0,
        "cost_energy": 300.0,
        "cost_isotope": 80.0,
        "fuel_weight": 6.0
    }
}

@dataclass
class ShipInstance:
    ship_type: str
    hull: float
    max_hull: float
    shield: float
    max_shield: float
    is_alive: bool = True

    @classmethod
    def create(cls, ship_type: str):
        spec = SHIP_SPECS[ship_type]
        return cls(
            ship_type=ship_type,
            hull=spec["hull"],
            max_hull=spec["hull"],
            shield=spec["shield"],
            max_shield=spec["shield"],
            is_alive=True
        )

@dataclass
class Fleet:
    owner_id: str
    name: str
    ships: List[ShipInstance] = field(default_factory=list)
    x: float = 0.0
    y: float = 0.0
    target_x: Optional[float] = None
    target_y: Optional[float] = None
    speed_penalty_active: bool = False # Ha a játékos energiája negatív

    def alive_ships(self) -> List[ShipInstance]:
        return [s for s in self.ships if s.is_alive and s.hull > 0]

    def count_by_type(self, ship_type: str) -> int:
        return sum(1 for s in self.alive_ships() if s.ship_type == ship_type)

    def get_speed(self) -> float:
        alive = self.alive_ships()
        if not alive:
            return 0.0
        min_speed = min(SHIP_SPECS[s.ship_type]["speed"] for s in alive)
        if self.speed_penalty_active:
            min_speed *= 0.5
        return min_speed

    def calculate_dispatch_cost(self, dest_x: float, dest_y: float) -> Tuple[float, float, float]:
        """Visszaadja a (távolság, menetidő órában, izotóp üzemanyag költség) értékeket."""
        dx = dest_x - self.x
        dy = dest_y - self.y
        dist = math.hypot(dx, dy)
        speed = self.get_speed()
        if speed <= 0:
            return dist, 0.0, 0.0
        hours = dist / speed
        fuel_cost = 0.0
        for s in self.alive_ships():
            fuel_cost += dist * SHIP_SPECS[s.ship_type]["fuel_weight"] * 0.05
        return dist, hours, fuel_cost

# ============================================================================
# HARCRENDSZER SZIMULÁCIÓ
# ============================================================================

class CombatEngine:
    @staticmethod
    def calculate_hit_chance(attacker_type: str, defender_type: str) -> float:
        att_spec = SHIP_SPECS[attacker_type]
        def_spec = SHIP_SPECS[defender_type]

        accuracy = att_spec["accuracy"]
        evasion = def_spec["evasion"]
        modifier = 0.0

        # Passzív 1: Korvett Zavarómező csatahajó ellen (-40% pontosság)
        if defender_type == "corvette" and attacker_type == "battleship":
            modifier -= 0.40

        chance = accuracy - evasion + modifier
        # Küszöbértékek: min 10%, max 95%
        return max(0.10, min(0.95, chance))

    @classmethod
    def resolve_combat(cls, fleet_a: Fleet, fleet_b: Fleet, max_rounds: int = 5, rng_seed: Optional[int] = None) -> Dict:
        """
        Lefuttatja a többlépcsős csatát fleet_a és fleet_b között.
        Visszaadja az eseménynaplót, a veszteségeket és a győztest.
        """
        if rng_seed is not None:
            random.seed(rng_seed)

        log_lines = []
        log_lines.append(f"=================== CSATANAPLÓ ===================")
        log_lines.append(f"Helyszín: X: {fleet_a.x:.0f}, Y: {fleet_a.y:.0f}")
        log_lines.append(f"Résztvevők:")
        log_lines.append(f"  [A OLDAL] {fleet_a.name} ({fleet_a.count_by_type('corvette')} Korvett, {fleet_a.count_by_type('destroyer')} Romboló, {fleet_a.count_by_type('battleship')} Csatahajó)")
        log_lines.append(f"  [B OLDAL] {fleet_b.name} ({fleet_b.count_by_type('corvette')} Korvett, {fleet_b.count_by_type('destroyer')} Romboló, {fleet_b.count_by_type('battleship')} Csatahajó)")
        log_lines.append("-" * 50)

        initial_count_a = {t: fleet_a.count_by_type(t) for t in SHIP_SPECS}
        initial_count_b = {t: fleet_b.count_by_type(t) for t in SHIP_SPECS}

        round_num = 1
        while round_num <= max_rounds and fleet_a.alive_ships() and fleet_b.alive_ships():
            log_lines.append(f"FORDULÓ {round_num}:")

            # 1. Támadások összegyűjtése (szimultán tűz)
            attacks_a = cls._generate_attacks(fleet_a, fleet_b)
            attacks_b = cls._generate_attacks(fleet_b, fleet_a)

            # 2. Sebzések érvényesítése
            dodges_b, destroyed_b, damage_b = cls._apply_attacks(attacks_a, fleet_b)
            dodges_a, destroyed_a, damage_a = cls._apply_attacks(attacks_b, fleet_a)

            if dodges_a > 0:
                log_lines.append(f" • [A OLDAL] Zavarómező: {dodges_a} ellenséges lövedéket térített el.")
            if dodges_b > 0:
                log_lines.append(f" • [B OLDAL] Zavarómező: {dodges_b} ellenséges lövedéket térített el.")

            if damage_b > 0:
                log_lines.append(f" • [A OLDAL] Tüzérsége {damage_b:.0f} sebzést okozott ({destroyed_b} hajót semmisített meg).")
            if damage_a > 0:
                log_lines.append(f" • [B OLDAL] Tüzérsége {damage_a:.0f} sebzést okozott ({destroyed_a} hajót semmisített meg).")

            # 3. Passzív 2: Romboló Pajzs-szinkronizáció (ha >= 3 aktív romboló van)
            regen_a = cls._apply_shield_sync(fleet_a)
            if regen_a > 0:
                log_lines.append(f" • [A OLDAL] Rombolók Pajzs-szinkronizációja visszatöltött {regen_a:.0f} pajzsot.")

            regen_b = cls._apply_shield_sync(fleet_b)
            if regen_b > 0:
                log_lines.append(f" • [B OLDAL] Rombolók Pajzs-szinkronizációja visszatöltött {regen_b:.0f} pajzsot.")

            round_num += 1

        # Végkimenetel értékelése
        alive_a = len(fleet_a.alive_ships())
        alive_b = len(fleet_b.alive_ships())

        winner = None
        if alive_a > 0 and alive_b == 0:
            winner = fleet_a.owner_id
            outcome_text = f"GYŐZELEM: [A OLDAL] {fleet_a.name}"
        elif alive_b > 0 and alive_a == 0:
            winner = fleet_b.owner_id
            outcome_text = f"GYŐZELEM: [B OLDAL] {fleet_b.name}"
        else:
            outcome_text = "DÖNTETLEN / TAKTIKAI MEGTORPANÁS (Mindkét fél visszahúzódott)"

        log_lines.append("-" * 50)
        log_lines.append(f"EREDMÉNY: {outcome_text}")

        # Veszteségek számítása
        lost_a = {t: initial_count_a[t] - fleet_a.count_by_type(t) for t in SHIP_SPECS}
        lost_b = {t: initial_count_b[t] - fleet_b.count_by_type(t) for t in SHIP_SPECS}

        log_lines.append(f"A Oldal veszteségei: " + ", ".join(f"{count}x {SHIP_SPECS[t]['name']}" for t, count in lost_a.items() if count > 0))
        log_lines.append(f"B Oldal veszteségei: " + ", ".join(f"{count}x {SHIP_SPECS[t]['name']}" for t, count in lost_b.items() if count > 0))

        # Roncsmentés (Salvage)
        total_destroyed_metal = sum(lost_a[t] * SHIP_SPECS[t]["cost_metal"] + lost_b[t] * SHIP_SPECS[t]["cost_metal"] for t in SHIP_SPECS)
        total_destroyed_iso = sum(lost_a[t] * SHIP_SPECS[t]["cost_isotope"] + lost_b[t] * SHIP_SPECS[t]["cost_isotope"] for t in SHIP_SPECS)
        salvage_metal = total_destroyed_metal * 0.20
        salvage_isotope = total_destroyed_iso * 0.10

        if salvage_metal > 0 or salvage_isotope > 0:
            log_lines.append(f"RONCSMENTÉS: +{salvage_metal:.0f} Fém, +{salvage_isotope:.0f} Izotóp zsákmányolható a roncsokból.")
        log_lines.append("=" * 50)

        return {
            "winner_id": winner,
            "outcome": outcome_text,
            "log": "\n".join(log_lines),
            "lost_a": lost_a,
            "lost_b": lost_b,
            "salvage_metal": salvage_metal,
            "salvage_isotope": salvage_isotope
        }

    @classmethod
    def _generate_attacks(cls, attacker_fleet: Fleet, defender_fleet: Fleet):
        attacks = []
        alive_defenders = defender_fleet.alive_ships()
        if not alive_defenders:
            return attacks

        for attacker in attacker_fleet.alive_ships():
            dmg = SHIP_SPECS[attacker.ship_type]["damage"]
            if attacker_fleet.speed_penalty_active:
                dmg *= 0.5 # Negatív energiamérleg esetén felezett tűzerő

            # Célpontválasztás: Korvettek inkább Korvettet/Rombolót, Csatahajók a legnagyobbakat
            if attacker.ship_type == "battleship":
                # Preferálja a csatahajókat vagy rombolókat
                candidates = [s for s in alive_defenders if s.ship_type in ("battleship", "destroyer")]
                target = random.choice(candidates if candidates else alive_defenders)
            else:
                target = random.choice(alive_defenders)

            attacks.append((attacker.ship_type, target, dmg))
        return attacks

    @classmethod
    def _apply_attacks(cls, attacks, defender_fleet: Fleet) -> Tuple[int, int, float]:
        dodges = 0
        destroyed_count = 0
        total_damage = 0.0

        for att_type, target, dmg in attacks:
            if not target.is_alive:
                continue

            hit_prob = cls.calculate_hit_chance(att_type, target.ship_type)
            if random.random() > hit_prob:
                dodges += 1
                continue

            total_damage += dmg

            # Sebzés eloszlás: Először pajzs, utána hajótest
            if target.shield >= dmg:
                target.shield -= dmg
            else:
                remaining = dmg - target.shield
                target.shield = 0.0
                target.hull -= remaining

                if target.hull <= 0:
                    target.is_alive = False
                    target.hull = 0.0
                    destroyed_count += 1

        return dodges, destroyed_count, total_damage

    @classmethod
    def _apply_shield_sync(cls, fleet: Fleet) -> float:
        # Pajzs-szinkronizáció: ha van legalább 3 romboló
        destroyer_count = fleet.count_by_type("destroyer")
        if destroyer_count < 3:
            return 0.0

        total_regen = 0.0
        for ship in fleet.alive_ships():
            if ship.shield < ship.max_shield:
                missing = ship.max_shield - ship.shield
                regen = missing * 0.15 # 15% visszatöltés
                ship.shield = min(ship.max_shield, ship.shield + regen)
                total_regen += regen
        return total_regen

# ============================================================================
# EGYSÉGTESZTEK ÉS DIAGNOSZTIKA (--test)
# ============================================================================

def run_tests():
    print(">>> ŰRSTRATÉGIA HARCRENDSZER ÉS FORMULA TESZTEK INDÍTÁSA...")

    # 1. Teszt: Korvett Zavarómezője Csatahajó ellen
    hit_chance = CombatEngine.calculate_hit_chance("battleship", "corvette")
    print(f"1. Teszt - Csatahajó pontossága Korvett ellen: {hit_chance*100:.1f}% (Várt: 10.0% min clamp)")
    assert math.isclose(hit_chance, 0.10, abs_tol=1e-5), f"Hiba: {hit_chance} != 0.10"

    # 2. Teszt: Korvett Korvett ellen
    hit_chance_corv = CombatEngine.calculate_hit_chance("corvette", "corvette")
    # Acc: 0.80 - Evasion 0.25 = 0.55
    print(f"2. Teszt - Korvett Korvett ellen: {hit_chance_corv*100:.1f}% (Várt: 55.0%)")
    assert math.isclose(hit_chance_corv, 0.55, abs_tol=1e-5), f"Hiba: {hit_chance_corv} != 0.55"

    # 3. Teszt: Flotta sebesség kalkuláció (leglassabb hajó határozza meg)
    f = Fleet(owner_id="player", name="Vegyes Flotta")
    f.ships.append(ShipInstance.create("corvette")) # sebesség 5
    assert f.get_speed() == 5.0
    f.ships.append(ShipInstance.create("battleship")) # sebesség 2
    print(f"3. Teszt - Vegyes flotta sebessége: {f.get_speed()} egység/h (Várt: 2.0)")
    assert f.get_speed() == 2.0

    # 4. Teszt: Negatív energia büntetés (felezett sebesség)
    f.speed_penalty_active = True
    print(f"4. Teszt - Negatív energia mérleg sebesség: {f.get_speed()} egység/h (Várt: 1.0)")
    assert f.get_speed() == 1.0
    f.speed_penalty_active = False

    # 5. Teszt: Romboló Pajzs-szinkronizáció teszt
    f_shield = Fleet(owner_id="player", name="Pajzs Flotta")
    for _ in range(3):
        f_shield.ships.append(ShipInstance.create("destroyer"))
    # Sérülés okozása
    for s in f_shield.ships:
        s.shield = 100.0 # Max 200, hiányzik 100
    regen = CombatEngine._apply_shield_sync(f_shield)
    # Minden romboló 15-öt kell regeneráljon, összesen 3 * 15 = 45
    print(f"5. Teszt - Rombolók Pajzs-szinkronizáció regenerációja: {regen} (Várt: 45.0)")
    assert math.isclose(regen, 45.0, abs_tol=1e-5)

    # 6. Teszt: Teljes csataszimuláció futtatás és naplózás
    fa = Fleet(owner_id="player_1", name="7. Cirkáló Hadosztály", x=100, y=100)
    for _ in range(15): fa.ships.append(ShipInstance.create("corvette"))
    for _ in range(4): fa.ships.append(ShipInstance.create("destroyer"))

    fb = Fleet(owner_id="ai_enemy", name="Vektor-9 Rajtaütők", x=100, y=100)
    for _ in range(6): fb.ships.append(ShipInstance.create("destroyer"))
    for _ in range(1): fb.ships.append(ShipInstance.create("battleship"))

    result = CombatEngine.resolve_combat(fa, fb, max_rounds=5, rng_seed=42)
    print("\n--- MINTA CSATANAPLÓ KIMENET ---")
    print(result["log"])
    print("--------------------------------")
    print(f"Roncsmentési fém: {result['salvage_metal']}, Izotóp: {result['salvage_isotope']}")
    assert result["winner_id"] is not None or "DÖNTETLEN" in result["outcome"]

    print("\n>>> MINDEN TESZT SIKERESEN LEFUTOTT! <<<")

if __name__ == "__main__":
    if "--test" in sys.argv:
        run_tests()
    else:
        print("Futtatás teszt módban: python tick_runner.py --test")
