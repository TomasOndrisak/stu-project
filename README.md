# MISA — Meranie fyzikálnej veličiny s vizualizáciou

Semestrálny projekt: systém na meranie teploty vody, reguláciu Peltierovho článku pomocou PID a vizualizáciu nameraných dát v reálnom čase cez webové rozhranie.

## Architektúra
TBD

## Použitý hardvér

| Komponent | Kategória | Účel |
|---|---|---|
| Arduino Uno | — | Mikrokontrolér |
| 2× DS18B20 | A (digitálny, 1-Wire) | Meranie teploty vody na vstupe a výstupe |
| Potenciometer 10kΩ | B (analógový, ADC) | Manuálne ovládanie pumpy |
| Peltier článok | — | Chladenie vody |
| Vodné čerpadlo | — | Cirkulácia |
| Výhrevné teleso | — | Ohrev vody |
| Raspberry Pi Zero 2W | — | Server (broker, backend, frontend) |

### Voľba senzorov
- **DS18B20** — digitálny, 1-Wire zbernica, presnosť ±0.5°C, vodotesné prevedenie.
- **Potenciometer** — analógový vstup na demonštráciu kategórie B snímača. Umožňuje hybridné ovládanie pumpy (manuálne fyzické / vzdialené cez web).

### Perióda merania — 1 sekunda
Voda má vysokú tepelnú zotrvačnosť — teplota sa nemení rýchlejšie ako rádovo sekundy. Vzorkovacia perióda 1s je dostatočná pre PID reguláciu a zároveň nezahlcuje systém. Hodnota je viazaná na PID parameter `T = 1.0` cez konštantu `SAMPLE_PERIOD_MS`.

## Formát prenášaných dát

### Telemetria — Arduino → server (každú sekundu)
```json
{
  "cold": 18.5,
  "warm": 34.2,
  "setpoint": 22.0,
  "peltier_pwm": 180,
  "pump_pwm": 128,
  "heater_pwm": 50,
  "resistance": 512,
  "pump_from_pot": false
}
```

| Kľúč | Typ | Význam |
|---|---|---|
| `cold` | float \| null | Vstupná voda (°C), `null` ak senzor odpojený |
| `warm` | float \| null | Výstupná voda (°C) |
| `setpoint` | float | Cieľová teplota pre PID |
| `peltier_pwm` | int (0–255) | Vypočítaný PWM výstup PID |
| `pump_pwm` | int (0–255) | Aktuálne PWM pumpy |
| `heater_pwm` | int (0–255) | PWM ohrievača |
| `resistance` | int (0–1023) | Surová ADC hodnota potenciometra |
| `pump_from_pot` | bool | Režim ovládania pumpy |

### Príkazy — server → Arduino (JSON, jeden kľúč na riadok)
| Príkaz | Rozsah | Význam |
|---|---|---|
| `{"pumpPWM":200}` | 0–255 | Manuálne nastavenie PWM pumpy |
| `{"pumpPWM":-1}` | -1 | Prepnutie na potenciometer |
| `{"heaterPWM":50}` | 0–255 | PWM ohrievača |
| `{"setpoint":25.0}` | float | Cieľová teplota |
| `{"Kp":120.0}` | float | Proporcionálne zosilnenie |
| `{"Ki":3.5}` | float | Integračné zosilnenie |
| `{"Kd":0.0}` | float | Derivačné zosilnenie |
| `{"reset":1}` | — | Reset PID integrálu |