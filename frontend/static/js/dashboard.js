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
    error: document.getElementById("val-error"),
    pTerm: document.getElementById("val-p-term"),
    iTerm: document.getElementById("val-i-term"),
    dTerm: document.getElementById("val-d-term"),

};

async function fetchCurrent() {
    try {
        const response = await fetch("/api/current");
        
        if (!response.ok) {
            elements.status.textContent = "● No data";
            updateArduinoStatus(null);
            return;
        }
        
        const data = await response.json();
        updateCards(data);
        elements.status.textContent = "● Server Connected";

        updateArduinoStatus(data.timestamp);

    } catch (error) {
        console.error("Fetch error:", error);
        elements.status.textContent = "● Error fetching data";
        updateArduinoStatus(null);
    }
}

function updateArduinoStatus(timestamp) {
    const arduinoStatusBadge = document.getElementById('arduino-status');

    if (!timestamp) {
        arduinoStatusBadge.textContent = "● Arduino Unknown";
        arduinoStatusBadge.classList.remove('bg-success', 'bg-danger');
        arduinoStatusBadge.classList.add('bg-secondary');
        return;
    }

  
    const lastUpdate = new Date(timestamp);
    const now = new Date();
    const diffMs = now - lastUpdate;

    if (diffMs > 3000) {
        arduinoStatusBadge.textContent = "● Arduino Disconnected";
        arduinoStatusBadge.classList.remove('bg-neutral', 'bg-success', 'bg-secondary');
        arduinoStatusBadge.classList.add('bg-danger');
    } else {
        arduinoStatusBadge.textContent = "● Arduino Connected";
        arduinoStatusBadge.classList.remove('bg-neutral', 'bg-danger', 'bg-secondary');
        arduinoStatusBadge.classList.add('bg-success');
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
    elements.error.textContent = data.error ?? "—";
    elements.pTerm.textContent = data.p_term ?? "—";
    elements.iTerm.textContent = data.i_term ?? "—";
    elements.dTerm.textContent = data.d_term ?? "—";
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
        error: { x: m.timestamp, y: m.error },
    }));

    chartTemperatures.data.datasets[0].data = points.map(p => p.cold);
    chartTemperatures.data.datasets[1].data = points.map(p => p.warm);
    chartTemperatures.data.datasets[2].data = points.map(p => p.setpoint);
    chartTemperatures.update("none");

    chartError.data.datasets[0].data = points.map(p => p.error);
    chartError.update("none");
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

const chartError = new Chart(
    document.getElementById("chart-error"),
    {
        type: "line",
        data: {
            datasets: [
                {
                    label: "Error (w - y)",
                    borderColor: "#ffc107",
                    backgroundColor: "rgba(255, 193, 7, 0.1)",
                    data: [],
                    tension: 0.3,
                    fill: true,
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
                    title: { display: true, text: "Error (°C)" },
                },
            },
            plugins: {
                annotation: {
                    annotations: {
                        zeroLine: {
                            type: "line",
                            yMin: 0,
                            yMax: 0,
                            borderColor: "#198754",
                            borderWidth: 2,
                            borderDash: [6, 6],
                            label: {
                                content: "Ideal (e = 0)",
                                display: true,
                                position: "end",
                                backgroundColor: "rgba(25, 135, 84, 0.8)",
                                color: "white",
                                font: { size: 11 },
                            },
                        },
                    },
                },
            },
        },
    }
);


fetchCurrent();
setInterval(fetchCurrent, REFRESH_INTERVAL_MS);

fetchHistory();
setInterval(fetchHistory, 5000);