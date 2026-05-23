// Knižnice
#include <OneWire.h>
#include <DallasTemperature.h>

// Zapojenie
#define ONE_WIRE_BUS 2      // Pin pre senzor teploty DS18B20
#define PELTIER_PWM_PIN 10  // PWM výstup pre Peltier
#define PUMP_PWM_PIN 11     // PWM výstup pre čerpadlo
#define HEATER_PWM_PIN 9    // PWM výstup pre výhrevné teleso

// DS18B20
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature waterSensors(&oneWire);

// PWM
int pumpPWM = 128;
int heaterPWM = 128;
int peltierPWM = 128;

void setup() {
  Serial.begin(9600);
  waterSensors.begin();

  pinMode(PELTIER_PWM_PIN, OUTPUT);
  pinMode(PUMP_PWM_PIN, OUTPUT);
  pinMode(HEATER_PWM_PIN, OUTPUT);
}

void loop() {

  printTemperatures();
  delay(1000);
}

void printTemperatures() {
  waterSensors.requestTemperatures();

  float tempInput = waterSensors.getTempCByIndex(0);
  float tempOutput = waterSensors.getTempCByIndex(1);

  Serial.print("Input water: ");
  Serial.print(tempInput);
  Serial.println(" °C");

  Serial.print("Output water: ");
  Serial.print(tempOutput);
  Serial.println(" °C");
}
