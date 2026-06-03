let gaugeCold, gaugeWarm, gaugePeltier, gaugeFlow;

document.addEventListener('DOMContentLoaded', () => {
    let retries = 0;
    const maxRetries = 20;

    function checkAndInitialize() {
        if (typeof RadialGauge !== 'undefined') {
            try {
                initGauges();
                console.log("Gauges.js: Gauges successfully initialized.");
                fetchLatestData();
                setInterval(fetchLatestData, 1500);
            } catch (e) {
                console.error("Gauges.js: Critical error during initialization:", e);
            }
        } else if (retries < maxRetries) {
            retries++;
            console.warn(`Gauges.js: RadialGauge library not loaded yet. Retrying (${retries}/${maxRetries})...`);
            setTimeout(checkAndInitialize, 100);
        } else {
            console.error("Gauges.js: Failed to load 'canvas-gauges' library from CDN.");
            alert("Error: Gauge visualization library could not be loaded. Please check your internet connection.");
        }
    }

    checkAndInitialize();
});

function initGauges() {
    // Cold Temperature Gauge
    gaugeCold = new RadialGauge({
        renderTo: 'gauge-cold',
        width: 190,
        height: 190,
        units: "°C",
        minValue: 0,
        maxValue: 50,
        majorTicks: ["0", "10", "20", "30", "40", "50"],
        minorTicks: 2,
        strokeTicks: true,
        highlights: [
            { from: 0, to: 18, color: "rgba(0, 123, 255, .15)" },
            { from: 18, to: 28, color: "rgba(40, 167, 69, .15)" },
            { from: 28, to: 50, color: "rgba(220, 53, 69, .15)" }
        ],
        colorPlate: "#fff",
        borderShadowWidth: 0,
        borders: false,
        needleType: "arrow",
        needleWidth: 3,
        needleCircleSize: 7,
        needleCircleOuter: true,
        needleCircleInner: false,
        animationDuration: 800,
        animationRule: "linear"
    }).draw();

    //Warm Temperature Gauge
    gaugeWarm = new RadialGauge({
        renderTo: 'gauge-warm',
        width: 190,
        height: 190,
        units: "°C",
        minValue: 0,
        maxValue: 60,
        majorTicks: ["0", "10", "20", "30", "40", "50", "60"],
        minorTicks: 2,
        strokeTicks: true,
        highlights: [
            { from: 0, to: 30, color: "rgba(40, 167, 69, .1)" },
            { from: 30, to: 45, color: "rgba(255, 193, 7, .15)" },
            { from: 45, to: 60, color: "rgba(220, 53, 69, .2)" }
        ],
        colorPlate: "#fff",
        borderShadowWidth: 0,
        borders: false,
        needleType: "arrow",
        needleWidth: 3,
        needleCircleSize: 7,
        needleCircleOuter: true,
        needleCircleInner: false,
        animationDuration: 800,
        animationRule: "linear"
    }).draw();

    // Peltier PWM Gauge
    gaugePeltier = new RadialGauge({
        renderTo: 'gauge-peltier',
        width: 190,
        height: 190,
        units: "PWM",
        minValue: 0,
        maxValue: 255,
        majorTicks: ["0", "50", "100", "150", "200", "255"],
        minorTicks: 5,
        strokeTicks: true,
        highlights: [
            { from: 0, to: 100, color: "rgba(111, 66, 193, .05)" },
            { from: 100, to: 200, color: "rgba(111, 66, 193, .15)" },
            { from: 200, to: 255, color: "rgba(111, 66, 193, .3)" }
        ],
        colorPlate: "#fff",
        borderShadowWidth: 0,
        borders: false,
        needleType: "arrow",
        needleWidth: 3,
        needleCircleSize: 7,
        needleCircleOuter: true,
        needleCircleInner: false,
        animationDuration: 800,
        animationRule: "linear"
    }).draw();

    // Flow Rate Gauge
    gaugeFlow = new RadialGauge({
        renderTo: 'gauge-flow',
        width: 190,
        height: 190,
        units: "LPM",
        minValue: 0,
        maxValue: 10,
        majorTicks: ["0", "2", "4", "6", "8", "10"],
        minorTicks: 2,
        strokeTicks: true,
        highlights: [
            { from: 0, to: 2, color: "rgba(220, 53, 69, .15)" },
            { from: 2, to: 8, color: "rgba(23, 162, 184, .15)" },
            { from: 8, to: 10, color: "rgba(40, 167, 69, .15)" }
        ],
        colorPlate: "#fff",
        borderShadowWidth: 0,
        borders: false,
        needleType: "arrow",
        needleWidth: 3,
        needleCircleSize: 7,
        needleCircleOuter: true,
        needleCircleInner: false,
        animationDuration: 800,
        animationRule: "linear"
    }).draw();
}

function fetchLatestData() {
    fetch('/api/current')
        .then(res => {
            if (!res.ok) throw new Error(`HTTP Error, status: ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (!data) return;
            console.log("Gauges.js: Received raw data:", data);

            let item = data;
            if (Array.isArray(data)) {
                if (data.length === 0) {
                    console.warn("Gauges.js: Received empty array from API.");
                    return;
                }
                item = data[data.length - 1];
            }

            console.log("Gauges.js: Processing item:", item);

            const cold = (item.cold !== undefined && item.cold !== null) ? parseFloat(item.cold) : null;
            const warm = (item.warm !== undefined && item.warm !== null) ? parseFloat(item.warm) : null;
            const peltier = (item.peltier_pwm !== undefined && item.peltier_pwm !== null) ? parseInt(item.peltier_pwm) : null;
            const flow = (item.flow_rate !== undefined && item.flow_rate !== null) ? parseFloat(item.flow_rate) : null;

            if (gaugeCold && cold !== null && !isNaN(cold)) gaugeCold.value = cold;
            if (gaugeWarm && warm !== null && !isNaN(warm)) gaugeWarm.value = warm;
            if (gaugePeltier && peltier !== null && !isNaN(peltier)) gaugePeltier.value = peltier;
            if (gaugeFlow && flow !== null && !isNaN(flow)) gaugeFlow.value = flow;

            setSafeText('val-cold', cold !== null && !isNaN(cold) ? cold.toFixed(1) : '—');
            setSafeText('val-warm', warm !== null && !isNaN(warm) ? warm.toFixed(1) : '—');
            setSafeText('val-peltier', peltier !== null && !isNaN(peltier) ? peltier.toString() : '—');
            setSafeText('val-flow', flow !== null && !isNaN(flow) ? flow.toFixed(2) : '—');

            if (item.timestamp) {
                const dateObj = new Date(item.timestamp);
                const timeStr = !isNaN(dateObj) ? dateObj.toLocaleTimeString() : item.timestamp;
                setSafeText('last-update-abs', timeStr);
            }

            updateNavbarStatus(item);
        })
        .catch(err => {
            console.warn('Gauges.js: Network issue in fetch /api/current:', err.message);
            const statusSpan = document.getElementById('status');
            if (statusSpan) {
                statusSpan.textContent = '● Server Disconnected';
                statusSpan.className = 'navbar-text text-danger';
            }
        });
}

function setSafeText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function updateNavbarStatus(data) {
    const systemStateBadge = document.getElementById('system-state');
    const arduinoStatusBadge = document.getElementById('arduino-status');
    const serverStatusSpan = document.getElementById('status');

    if (serverStatusSpan) {
        serverStatusSpan.textContent = '● Server Connected';
        serverStatusSpan.className = 'navbar-text text-success';
    }

    if (data.system_state && systemStateBadge) {
        systemStateBadge.textContent = `● System — ${data.system_state}`;
        systemStateBadge.className = (data.system_state === 'Active' || data.system_state === 'Running')
            ? 'badge bg-success fs-6 fw-normal'
            : 'badge bg-secondary fs-6 fw-normal';
    }

    if (data.arduino_connected !== undefined && arduinoStatusBadge) {
        if (data.arduino_connected) {
            arduinoStatusBadge.textContent = '● Arduino Connected';
            arduinoStatusBadge.className = 'badge bg-success fs-6 fw-normal';
        } else {
            arduinoStatusBadge.textContent = '● Arduino Disconnected';
            arduinoStatusBadge.className = 'badge bg-danger fs-6 fw-normal';
        }
    }
}