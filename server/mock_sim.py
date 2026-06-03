import random


class ThermalSim:
    T = 1.0 

    def __init__(self):
        self.setpoint = 22.0
        self.pump_pwm = 128
        self.heater_pwm = 0
        self.pump_from_pot = False
        self.Kp, self.Ki, self.Kd = 60.0, 10.0, 0.0

        self.cold = 28.0          
        self.warm = 30.0
        self.integral = 0.0
        self.prev_error = 0.0
        self.total_ml = 0.0
        self.active = True       

    def apply_command(self, cmd: dict) -> None:
        if "setpoint" in cmd:
            self.setpoint = float(cmd["setpoint"])
        if "heaterPWM" in cmd:
            self.heater_pwm = max(0, min(255, int(cmd["heaterPWM"])))
        if "pumpPWM" in cmd:
            v = int(cmd["pumpPWM"])
            if v == -1:
                self.pump_from_pot = True
            else:
                self.pump_from_pot = False
                self.pump_pwm = max(0, min(255, v))
        if "Kp" in cmd:
            self.Kp = float(cmd["Kp"])
        if "Ki" in cmd:
            self.Ki = float(cmd["Ki"])
            self.integral = 0.0          
        if "Kd" in cmd:
            self.Kd = float(cmd["Kd"])
        if "reset" in cmd:
            self.integral = 0.0
            self.prev_error = 0.0
        if "activate" in cmd:
            self.active = bool(int(cmd["activate"]))

    def step(self) -> dict:
        error = self.setpoint - self.cold

        # PID
        self.integral += error * self.T
        self.integral = max(-500.0, min(500.0, self.integral))   # anti-windup
        deriv = (error - self.prev_error) / self.T
        self.prev_error = error
        output = self.Kp * error + self.Ki * self.integral + self.Kd * deriv

        peltier_pwm = int(max(0, min(255, -output)))

        cooling = peltier_pwm / 255.0 * 0.6
        heating = self.heater_pwm / 255.0 * 0.8 + 0.05         
        self.cold += (heating - cooling) + random.uniform(-0.03, 0.03)
        self.warm = self.cold + 12.0 + self.heater_pwm / 255.0 * 4 + random.uniform(-0.2, 0.2)

        if self.pump_from_pot:
            self.pump_pwm = random.randint(90, 160)             
        flow = self.pump_pwm / 255.0 * 2.0                      
        self.total_ml += flow / 60.0 * self.T * 1000.0

        return {
            "cold":          round(self.cold, 1),
            "warm":          round(self.warm, 1),
            "setpoint":      self.setpoint,
            "error":         round(error, 2),
            "P_term":        round(self.Kp * error, 2),
            "I_term":        round(self.Ki * self.integral, 2),
            "D_term":        round(self.Kd * deriv, 2),
            "Kp":            self.Kp,
            "Ki":            self.Ki,
            "Kd":            self.Kd,
            "peltier_pwm":   peltier_pwm,
            "pump_pwm":      self.pump_pwm,
            "heater_pwm":    self.heater_pwm,
            "resistance":    random.randint(400, 600),
            "pump_from_pot": self.pump_from_pot,
            "flow_rate_lpm": round(flow, 2),
            "total_ml":      round(self.total_ml, 1),
        }