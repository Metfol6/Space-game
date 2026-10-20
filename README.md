# Space 4X Tactics - Aszinkron Óránkénti Tick Mobil Stratégia

Ez a projekt a megbeszélt aszinkron, 1 órás tick-ritmusú, minimalista taktikai űrstratégiai játék prototípusát és rendszerarchitektúráját tartalmazza.

## Fájlstruktúra és Főbb Komponensek

1. **`index.html`** - Teljes, önálló böngészős játékprototípus és taktikai parancsnoki felület:
   - **Taktikai Fejléc (HUD):** Valós idejű Fém, Energia (Upkeep kalkulációval), Izotóp és Adat számlálók.
   - **2D Canvas Csillagtérkép:** Vektorgrafikus koordinátarács ($X, Y$), mozgatás és nagyítás (Pan & Zoom), bolygók és mozgó flottavektorok ETA-val.
   - **Bolygó Adatlap és Slot Menedzsment:** 4-6 slotos gazdasági, védelmi és infrastrukturális ágak (Ipari Központ, Pajzs, Dokk, Szenzor).
   - **Hajógyár (Shipyard):** Könnyű Korvett (▲), Romboló Cirkáló (◆), Csatahajó (⬟).
   - **Flotta Indítása (Dispatch Modal):** Távolság, leglassabb sebesség és Izotóp üzemanyag kalkuláció.
   - **Harcrendszer & Combat Log:** Pontos matematikai formulák (Zavarómező 25% kitérés és csatahajó -40% pontosság, Rombolók pajzs-szinkronizációja 15% visszatöltéssel, többlépcsős csatakörök).
   - **Kutatási Fa:** Gépezet, Haditechnika és Navigáció ágak.
   - **Web Audio API:** Beépített terminál és harci hangeffektek külső függőségek nélkül.

2. **`schema.sql`** - Relációs adatbázis-séma (PostgreSQL / SQLite kompatibilis):
   - Játékosok, bolygók, struktúrák, flották, egységek, gyártási sorok és eseménynaplók perzisztenciája.

3. **`tick_runner.js`** / **`tick_runner.py`** - Headless szerveroldali tick- és csatamotor egységtesztekkel:
   - Tesztfuttatás: `node tick_runner.js --test`
   - Képletek ellenőrzése, pajzs és hajótest sebzéseloszlás, roncsmentés.

---

## Gyors Kipróbálás

1. Nyisd meg az `index.html` fájlt közvetlenül bármely modern böngészőben (Chrome, Edge, Firefox, Safari vagy mobil böngésző).
2. Kattints a bolygókra a részletező adatlap megnyitásához.
3. Gyárts hajókat vagy indíts flottát a semleges világok (pl. `Zephyr-7`) kolonizálására vagy az ellenséges `Vektor-9` bázis megtámadására.
4. Használd a **`[+1 ÓRA (TICK)]`** gombot a körök léptetéséhez, vagy kapcsold be az **`[AUTO]`** gombot a gyorsított szimulációhoz!
