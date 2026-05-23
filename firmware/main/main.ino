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

// PID parametre
float Kp       = 100.0;
float Ki       =   5.5;
float Kd       =   0.0;
float T        =   1.0;
float setpoint =  22.0;

float previous_error = 0;
float integral       = 0;
unsigned long lastTime = 0;

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

float PID_Controller(float setpoint, float process_value,
                     float Kp, float Ki, float Kd, float T,
                     float outMin, float outMax) {

  float error  = setpoint - process_value;
  float P_term = Kp * error;

  integral += error * T;

  // Anti-windup clamping
  if (Ki != 0.0) {
    integral = constrain(integral, outMin / Ki, outMax / Ki);
  }

  float I_term = Ki * integral;
  float D_term = Kd * (error - previous_error) / T;

  previous_error = error;

  return constrain(P_term + I_term + D_term, outMin, outMax);
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
