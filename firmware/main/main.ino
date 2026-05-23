// Knižnice
#include <OneWire.h>
#include <DallasTemperature.h>

// Zapojenie
#define ONE_WIRE_BUS 2      // Pin pre senzor teploty DS18B20
#define PELTIER_PWM_PIN 10  // PWM výstup pre Peltier
#define PUMP_PWM_PIN 11     // PWM výstup pre čerpadlo
#define HEATER_PWM_PIN 9    // PWM výstup pre výhrevné teleso

// DS18B20 sensor properties
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature waterSensors(&oneWire);

// PWM parameters
int pumpPWM     = 128;
int heaterPWM   = 128;
int peltierPWM  = 128;

// PID parameters
float Kp        = 100.0;
float Ki        =   5.5;
float Kd        =   0.0;
const float T         =   1.0; // perioda vzorkovania
float setpoint  =  22.0;

float previous_error = 0;
float integral       = 0;
unsigned long lastTime = 0;

// Constants
const unsigned long SAMPLE_PERIOD_MS = (unsigned long)(T * 1000);
const int TEMP_DECIMAL_PRECISION = 1;


void setup() {
  Serial.begin(9600);
  waterSensors.begin();

  pinMode(PELTIER_PWM_PIN, OUTPUT);
  pinMode(PUMP_PWM_PIN, OUTPUT);
  pinMode(HEATER_PWM_PIN, OUTPUT);
}

void loop() {
  if (millis() - lastTime >= SAMPLE_PERIOD_MS) {
    lastTime = millis();

    waterSensors.requestTemperatures();
    float tempInput  = waterSensors.getTempCByIndex(0);
    float tempOutput = waterSensors.getTempCByIndex(1);

    if (tempInput != DEVICE_DISCONNECTED_C) {
      peltierPWM = PID_Controller(setpoint, tempInput, Kp, Ki, Kd, T, 0.0, 255.0);
    } else {
      peltierPWM = 0;
    }

    analogWrite(PELTIER_PWM_PIN, peltierPWM);
    analogWrite(PUMP_PWM_PIN, pumpPWM);
    analogWrite(HEATER_PWM_PIN, heaterPWM);

    publishJson(tempInput, tempOutput);
  }
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

void publishJson(float tempInput, float tempOutput) {
  Serial.print("{\"cold\":");
  if (tempInput != DEVICE_DISCONNECTED_C) Serial.print(tempInput, TEMP_DECIMAL_PRECISION);
  else Serial.print("null");

  Serial.print(",\"warm\":");
  if (tempOutput != DEVICE_DISCONNECTED_C) Serial.print(tempOutput, TEMP_DECIMAL_PRECISION);
  else Serial.print("null");

  Serial.print(",\"setpoint\":"); Serial.print(setpoint, TEMP_DECIMAL_PRECISION);
  Serial.print(",\"peltier_pwm\":"); Serial.print(peltierPWM);
  Serial.print(",\"pump_pwm\":"); Serial.print(pumpPWM);
  Serial.print(",\"heater_pwm\":"); Serial.print(heaterPWM);
  Serial.println("}");
}