// Libraries
#include <OneWire.h>
#include <DallasTemperature.h>

// Pin definitions
#define ONE_WIRE_BUS 2       // Pin pre senzor teploty DS18B20
#define PELTIER_PWM_PIN 10   // PWM výstup pre Peltier
#define PUMP_PWM_PIN 11      // PWM výstup pre čerpadlo
#define HEATER_PWM_PIN 9     // PWM výstup pre výhrevné teleso
#define POTENTIOMETER_PIN A0 // Analógový vstup pre potenciometer pumpy
#define FLOW_SENSOR_PIN 3    // Digitálny vstup pre flow sensor

// DS18B20 sensor properties
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature waterSensors(&oneWire);
DeviceAddress sensorCold, sensorWarm;

// Flow sensor
volatile int pulseCount = 0;
float flowRate = 0.0; // litre/min
unsigned long totalMilliLitres = 0;
const float FLOW_CALIBRATION = 4.5;

// PWM parameters
int pumpPWM = 128;
int heaterPWM = 0;
int peltierPWM = 0;

// Potenciometer
int resistance = 0;
bool pumpFromPot = false; // true = potenciometer, false = PWM
const float POT_TOTAL_RESISTANCE = 10730.0;

// PID parameters
float Kp = 60.0;
float Ki = 10.0;
float Kd = 0.0;
const float T = 1.0; // perioda vzorkovania
float setpoint = 22.0;

float previous_error = 0;
float integral = 0;
unsigned long lastTime = 0;

// Last computed PID values
float lastError = 0;
float lastPTerm = 0;
float lastITerm = 0;
float lastDTerm = 0;

// Constants
const unsigned long SAMPLE_PERIOD_MS = (unsigned long)(T * 1000);
const int DECIMAL_PRECISION = 2;

void flowPulseCounter()
{
  pulseCount++;
}

int potentiometerLinearisation(int rawValue)
{
  if (rawValue <= 0)
    return 0;
  else if (rawValue <= 49)
    return map(rawValue, 0, 49, 0, 102);
  else if (rawValue <= 170)
    return map(rawValue, 49, 170, 102, 205);
  else if (rawValue <= 291)
    return map(rawValue, 170, 291, 205, 307);
  else if (rawValue <= 408)
    return map(rawValue, 291, 408, 307, 409);
  else if (rawValue <= 533)
    return map(rawValue, 408, 533, 409, 512);
  else if (rawValue <= 634)
    return map(rawValue, 533, 634, 512, 614);
  else if (rawValue <= 750)
    return map(rawValue, 634, 750, 614, 716);
  else if (rawValue <= 864)
    return map(rawValue, 750, 864, 716, 818);
  else if (rawValue <= 981)
    return map(rawValue, 864, 981, 818, 921);
  else
  {
    if (rawValue > 1023)
      rawValue = 1023;
    return map(rawValue, 981, 1023, 921, 1023);
  }
}

void setup()
{
  Serial.begin(9600);
  waterSensors.begin();
  waterSensors.setWaitForConversion(false); // Non-blocking mode

  if (!waterSensors.getAddress(sensorCold, 0))
    Serial.println("Chyba: Cold senzor nenajdeny!");
  if (!waterSensors.getAddress(sensorWarm, 1))
    Serial.println("Chyba: Warm senzor nenajdeny!");

  pinMode(PELTIER_PWM_PIN, OUTPUT);
  pinMode(PUMP_PWM_PIN, OUTPUT);
  pinMode(HEATER_PWM_PIN, OUTPUT);
  pinMode(POTENTIOMETER_PIN, INPUT);

  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), flowPulseCounter, FALLING);

  waterSensors.requestTemperatures();
}

void loop()
{
  handleSerialCommands();

  if (millis() - lastTime >= SAMPLE_PERIOD_MS)
  {
    lastTime = millis();

    // Set index according to your wiring: 0 for input (cold side), 1 for output (warm side)
    float tempInput = waterSensors.getTempC(sensorCold);
    float tempOutput = waterSensors.getTempC(sensorWarm);

    waterSensors.requestTemperatures();

    if (tempInput != DEVICE_DISCONNECTED_C)
    {
      float pid_output = PID_Controller(setpoint, tempInput, Kp, Ki, Kd, T, -255.0, 0.0);
      peltierPWM = -pid_output;
    }
    else
    {
      peltierPWM = 0;
      lastError = 0;
      lastPTerm = 0;
      lastITerm = 0;
      lastDTerm = 0;
    }

    if (pumpFromPot)
    {
      int rawPotValue = analogRead(POTENTIOMETER_PIN);

      resistance = (int)(POT_TOTAL_RESISTANCE * ((float)rawPotValue / 1023.0));

      // Linearised value
      int linearPotValue = potentiometerLinearisation(rawPotValue);
      pumpPWM = map(linearPotValue, 0, 1023, 0, 255);
    }

    // Flow sensor calculations
    detachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN));
    flowRate = ((float)pulseCount / T) / FLOW_CALIBRATION;
    unsigned int flowMilliLitres = (flowRate / 60.0) * 1000.0 * T;
    totalMilliLitres += flowMilliLitres;

    attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), flowPulseCounter, FALLING);
    analogWrite(PELTIER_PWM_PIN, peltierPWM);
    analogWrite(PUMP_PWM_PIN, pumpPWM);
    analogWrite(HEATER_PWM_PIN, heaterPWM);

    publishJson(tempInput, tempOutput);
    pulseCount = 0;
  }
}

// PID controller function
float PID_Controller(float setpoint, float process_value,
                     float Kp, float Ki, float Kd, float T,
                     float outMin, float outMax)
{
  float error = setpoint - process_value;
  float P_term = Kp * error;

  integral += error * T;

  // Anti-windup clamping
  if (Ki != 0.0)
  {
    if ((Ki * integral) > outMax)
    {
      integral = outMax / Ki;
    }
    else if ((Ki * integral) < outMin)
    {
      integral = outMin / Ki;
    }
  }

  float I_term = Ki * integral;
  float D_term = Kd * (error - previous_error) / T;

  float control_output = P_term + I_term + D_term;
  if (control_output > outMax)
    control_output = outMax;
  else if (control_output < outMin)
    control_output = outMin;

  previous_error = error;

  lastError = error;
  lastPTerm = P_term;
  lastITerm = I_term;
  lastDTerm = D_term;

  return control_output;
}

// Publishing JSON with current temperatures and settings to Serial
void publishJson(float tempInput, float tempOutput)
{
  Serial.print("{\"cold\":");
  if (tempInput != DEVICE_DISCONNECTED_C)
    Serial.print(tempInput, DECIMAL_PRECISION);
  else
    Serial.print("null");

  Serial.print(",\"warm\":");
  if (tempOutput != DEVICE_DISCONNECTED_C)
    Serial.print(tempOutput, DECIMAL_PRECISION);
  else
    Serial.print("null");

  Serial.print(",\"setpoint\":");
  Serial.print(setpoint, DECIMAL_PRECISION);
  Serial.print(",\"peltier_pwm\":");
  Serial.print(peltierPWM);
  Serial.print(",\"pump_pwm\":");
  Serial.print(pumpPWM);
  Serial.print(",\"heater_pwm\":");
  Serial.print(heaterPWM);
  Serial.print(",\"resistance\":");
  Serial.print(resistance);
  Serial.print(",\"pump_from_pot\":");
  Serial.print(pumpFromPot ? "true" : "false");
  Serial.print(",\"flow_rate_lpm\":");
  Serial.print(flowRate, DECIMAL_PRECISION);
  Serial.print(",\"total_ml\":");
  Serial.print(totalMilliLitres);
  Serial.print(",\"error\":");
  Serial.print(lastError, 3);
  Serial.print(",\"P_term\":");
  Serial.print(lastPTerm, 2);
  Serial.print(",\"I_term\":");
  Serial.print(lastITerm, 2);
  Serial.print(",\"D_term\":");
  Serial.print(lastDTerm, 2);
  Serial.print(",\"Kp\":");
  Serial.print(Kp, 2);
  Serial.print(",\"Ki\":");
  Serial.print(Ki, 2);
  Serial.print(",\"Kd\":");
  Serial.print(Kd, 2);
  Serial.println("}");
}

// Handles incoming settings as JSON, one key-value per line.
// Example: {"pumpPWM":200} or {"Kp":120.0}
void handleSerialCommands()
{
  if (!Serial.available())
    return;

  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line.length() == 0)
    return;

  int colonPos = line.indexOf(':');
  if (colonPos < 0)
    return;

  String key = line.substring(line.indexOf('"') + 1, line.lastIndexOf('"', colonPos));
  String val = line.substring(colonPos + 1);
  val.replace("}", "");
  val.trim();

  float value = val.toFloat();

  if (key == "pumpPWM")
  {
    int requestedPwm = (int)value;
    if (requestedPwm == -1)
    {
      pumpFromPot = true;
    }
    else
    {
      pumpFromPot = false;
      pumpPWM = constrain(requestedPwm, 0, 255);
    }
  }
  else if (key == "heaterPWM")
    heaterPWM = constrain((int)value, 0, 255);
  else if (key == "setpoint")
    setpoint = value;
  else if (key == "Kp")
    Kp = value;
  else if (key == "Ki")
  {
    Ki = value;
    integral = 0;
  }
  else if (key == "Kd")
    Kd = value;
  else if (key == "reset")
  {
    integral = 0;
    previous_error = 0;
  }
}