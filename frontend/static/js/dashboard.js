const REFRESH_INTERVAL_MS = 1000;

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

const CHART_HOURS = 24; // 24 hours of history

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