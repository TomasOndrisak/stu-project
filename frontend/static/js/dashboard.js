const REFRESH_INTERVAL_MS = 1000;
const CHART_HOURS = 1; // 1 hour of history


const elements = {
    status: document.getElementById("status"),
    cold: document.getElementById("val-cold"),
    warm: document.getElementById("val-warm"),
    setpoint: document.getElementById("val-setpoint"),
    peltier: document.getElementById("val-peltier"),
    pump: document.getElementById("val-pump"),
    heater: document.getElementById("val-heater"),
    resistance: document.getElementById("val-resistance"),
};

async function fetchCurrent() {
    try {
        const response = await fetch("/api/current");

        if (!response.ok) {
            elements.status.textContent = "● No data";
            return;
        }

        const data = await response.json();
        updateCards(data);
        elements.status.textContent = "● Connected";

    } catch (error) {
        console.error("Fetch error:", error);
        elements.status.textContent = "● Disconnected";
    }
}

function updateCards(data) {
    elements.cold.textContent = data.cold ?? "—";
    elements.warm.textContent = data.warm ?? "—";
    elements.setpoint.textContent = data.setpoint ?? "—";
    elements.peltier.textContent = data.peltier_pwm ?? "—";
    elements.pump.textContent = data.pump_pwm ?? "—";
    elements.heater.textContent = data.heater_pwm ?? "—";
    elements.resistance.textContent = data.resistance ?? "—";
}

async function fetchHistory() {
    try {
        const response = await fetch(`/api/history?hours=${CHART_HOURS}`);

        if (!response.ok) {
            console.warn("History fetch failed:", response.status);
            return;
        }

        const data = await response.json();
        updateCharts(data);

    } catch (error) {
        console.error("History fetch error:", error);
    }
}

function updateCharts(measurements) {
    const points = measurements.map(m => ({
        cold: { x: m.timestamp, y: m.cold },
        warm: { x: m.timestamp, y: m.warm },
        setpoint: { x: m.timestamp, y: m.setpoint },
        peltier: { x: m.timestamp, y: m.peltier_pwm },
        pump: { x: m.timestamp, y: m.pump_pwm },
        heater: { x: m.timestamp, y: m.heater_pwm },
    }));

    chartTemperatures.data.datasets[0].data = points.map(p => p.cold);
    chartTemperatures.data.datasets[1].data = points.map(p => p.warm);
    chartTemperatures.data.datasets[2].data = points.map(p => p.setpoint);
    chartTemperatures.update("none");

    chartActuators.data.datasets[0].data = points.map(p => p.peltier);
    chartActuators.data.datasets[1].data = points.map(p => p.pump);
    chartActuators.data.datasets[2].data = points.map(p => p.heater);
    chartActuators.update("none");
}

// Controls
// Setpoint
const ctrlSetpoint = document.getElementById("ctrl-setpoint");
const ctrlSetpointValue = document.getElementById("ctrl-setpoint-value");

// Setpoint on change event
ctrlSetpoint.addEventListener("change", async () => {
    const value = parseFloat(ctrlSetpoint.value);
    await sendCommand({ setpoint: value });
});

// Setpoint input event
ctrlSetpoint.addEventListener("input", () => {
    ctrlSetpointValue.textContent = parseFloat(ctrlSetpoint.value).toFixed(1);
});

// Pump
const ctrlPump = document.getElementById("ctrl-pump");
const ctrlPumpValue = document.getElementById("ctrl-pump-value");
const ctrlPumpPot = document.getElementById("ctrl-pump-pot");

// Pump input event - updates displayed value
ctrlPump.addEventListener("input", () => {
    ctrlPumpValue.textContent = ctrlPump.value;
});

// On change event - sends command to backend
ctrlPump.addEventListener("change", async () => {
    // If potentiometer mode is enabled, ignore manual input
    if (ctrlPumpPot.checked) return;

    const value = parseInt(ctrlPump.value);
    await sendCommand({ pumpPWM: value });
});

// Heater
const ctrlHeater = document.getElementById("ctrl-heater");
const ctrlHeaterValue = document.getElementById("ctrl-heater-value");

ctrlHeater.addEventListener("input", () => {
    ctrlHeaterValue.textContent = ctrlHeater.value;
});

ctrlHeater.addEventListener("change", async () => {
    const value = parseInt(ctrlHeater.value);
    await sendCommand({ heaterPWM: value });
});



// On change event - sends command to backend
ctrlPumpPot.addEventListener("change", async () => {
    if (ctrlPumpPot.checked) {
        // Activate potentiometer mode — disable manual slider and send -1 to indicate auto mode
        ctrlPump.disabled = true;
        await sendCommand({ pumpPWM: -1 });
    } else {
        // Deactivate — send current slider value
        ctrlPump.disabled = false;
        const value = parseInt(ctrlPump.value);
        await sendCommand({ pumpPWM: value });
    }
});


// PID controls
const ctrlKp = document.getElementById("ctrl-kp");
const ctrlKi = document.getElementById("ctrl-ki");
const ctrlKd = document.getElementById("ctrl-kd");

document.getElementById("ctrl-pid-apply").addEventListener("click", async () => {
    const Kp = parseFloat(ctrlKp.value);
    const Ki = parseFloat(ctrlKi.value);
    const Kd = parseFloat(ctrlKd.value);

    // Sends each parameter separately
    await sendCommand({ Kp });
    await sendCommand({ Ki });
    await sendCommand({ Kd });
});

document.getElementById("ctrl-pid-reset").addEventListener("click", async () => {
    await sendCommand({ reset: 1 });
});

// Command API handler
async function sendCommand(payload) {
    try {
        const response = await fetch("/api/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error("Command failed:", response.status);
            return;
        }

        console.log("Command sent:", payload);

    } catch (error) {
        console.error("Command error:", error);
    }
}


const chartTemperatures = new Chart(
    document.getElementById("chart-temperatures"),
    {
        type: "line",
        data: {
            datasets: [
                {
                    label: "Cold",
                    borderColor: "#0d6efd",
                    backgroundColor: "rgba(13, 110, 253, 0.1)",
                    data: [],
                    tension: 0.3,
                },
                {
                    label: "Warm",
                    borderColor: "#dc3545",
                    backgroundColor: "rgba(220, 53, 69, 0.1)",
                    data: [],
                    tension: 0.3,
                },
                {
                    label: "Setpoint",
                    borderColor: "#198754",
                    borderDash: [5, 5],
                    data: [],
                    tension: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: "time",
                    time: { unit: "minute" },
                },
                y: {
                    title: { display: true, text: "°C" },
                },
            },
        },
    }
);

const chartActuators = new Chart(
    document.getElementById("chart-actuators"),
    {
        type: "line",
        data: {
            datasets: [
                {
                    label: "Peltier",
                    borderColor: "#6610f2",
                    backgroundColor: "rgba(102, 16, 242, 0.1)",
                    data: [],
                    tension: 0.3,
                },
                {
                    label: "Pump",
                    borderColor: "#fd7e14",
                    backgroundColor: "rgba(253, 126, 20, 0.1)",
                    data: [],
                    tension: 0.3,
                },
                {
                    label: "Heater",
                    borderColor: "#d63384",
                    backgroundColor: "rgba(214, 51, 132, 0.1)",
                    data: [],
                    tension: 0.3,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: "time",
                    time: { unit: "minute" },
                },
                y: {
                    title: { display: true, text: "PWM (0-255)" },
                    min: 0,
                    max: 255,
                },
            },
        },
    }
);


fetchCurrent();
setInterval(fetchCurrent, REFRESH_INTERVAL_MS);

fetchHistory();
setInterval(fetchHistory, 5000);