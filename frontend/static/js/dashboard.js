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

fetchCurrent();
setInterval(fetchCurrent, REFRESH_INTERVAL_MS);       