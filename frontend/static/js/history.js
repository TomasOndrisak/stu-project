let loadedData = [];
let historyChart = null;

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    setDefaultDates();

    document.getElementById('btnLoadDB').addEventListener('click', loadDataFromDB);
    document.getElementById('jsonFileInput').addEventListener('change', loadDataFromJSONFile);
    document.getElementById('btnExportJSON').addEventListener('click', exportJSON);
    document.getElementById('btnExportCSV').addEventListener('click', exportCSV);
});

function setDefaultDates() {
    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - (12 * 60 * 60 * 1000));

    const formatDate = (date) => {
        const tzOffset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
    };

    document.getElementById('startDate').value = formatDate(twelveHoursAgo);
    document.getElementById('endDate').value = formatDate(now);
}

function initChart() {
    const ctx = document.getElementById('chart-history').getContext('2d');

    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Cold Temperature (°C)',
                    data: [],
                    borderColor: '#0d6efd',
                    backgroundColor: 'rgba(13, 110, 253, 0.05)',
                    yAxisID: 'y',
                    tension: 0.2,
                    pointRadius: 1
                },
                {
                    label: 'Warm Temperature (°C)',
                    data: [],
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.05)',
                    yAxisID: 'y',
                    tension: 0.2,
                    pointRadius: 1
                },
                {
                    label: 'Setpoint (°C)',
                    data: [],
                    borderColor: '#198754',
                    borderDash: [5, 5],
                    fill: false,
                    yAxisID: 'y',
                    tension: 0,
                    pointRadius: 0
                },
                {
                    label: 'Peltier PWM',
                    data: [],
                    borderColor: '#6f42c1',
                    backgroundColor: 'rgba(111, 66, 193, 0.05)',
                    yAxisID: 'y-pwm',
                    tension: 0.1,
                    pointRadius: 1,
                    hidden: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Temperature (°C)'
                    }
                },
                'y-pwm': {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    max: 255,
                    title: {
                        display: true,
                        text: 'PWM Power'
                    },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

function loadDataFromDB() {
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;

    if (!start || !end) {
        alert('Please select both start and end times.');
        return;
    }

    const btn = document.getElementById('btnLoadDB');
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Loading...';
    btn.disabled = true;

    fetch(`/api/history/range?start=${start}&end=${end}`)
        .then(res => {
            if (!res.ok) throw new Error('Failed to load data.');
            return res.json();
        })
        .then(data => {
            loadedData = data;
            updateDashboard(data, "Displayed Database");
        })
        .catch(err => {
            alert('Communication error: ' + err.message);
        })
        .finally(() => {
            btn.innerHTML = '<i class="fa-solid fa-database me-1"></i> Load from DB';
            btn.disabled = false;
        });
}

function loadDataFromJSONFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const data = JSON.parse(event.target.result);
            if (Array.isArray(data)) {
                loadedData = data;
                updateDashboard(data, `File: ${file.name}`);
            } else {
                alert('Invalid JSON structure. An array of objects is expected.');
            }
        } catch (err) {
            alert('Error parsing file: ' + err.message);
        }
    };
    reader.readAsText(file);
}

function updateDashboard(data, statusText) {
    const tableBody = document.getElementById('tableBody');
    const dataStatus = document.getElementById('dataStatus');

    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No data available for the selected period</td></tr>';
        dataStatus.textContent = "● No Data Available";
        dataStatus.className = "badge bg-danger fw-normal";

        historyChart.data.labels = [];
        historyChart.data.datasets.forEach(ds => ds.data = []);
        historyChart.update();
        return;
    }

    dataStatus.textContent = `● ${statusText} (${data.length} values)`;
    dataStatus.className = "badge bg-success fw-normal";

    const labels = data.map(item => item.timestamp || '');
    historyChart.data.labels = labels;
    historyChart.data.datasets[0].data = data.map(item => item.cold);
    historyChart.data.datasets[1].data = data.map(item => item.warm);
    historyChart.data.datasets[2].data = data.map(item => item.setpoint);
    historyChart.data.datasets[3].data = data.map(item => item.peltier_pwm);
    historyChart.update();

    let tableHTML = '';
    const limit = Math.min(data.length, 200);

    for (let i = 0; i < limit; i++) {
        const item = data[i];
        const errorVal = (item.error !== undefined) ? item.error : (item.setpoint - item.cold);

        tableHTML += `
                    <tr>
                        <td><strong>${item.timestamp || ''}</strong></td>
                        <td class="text-primary">${item.cold !== undefined ? item.cold.toFixed(2) : '—'}</td>
                        <td class="text-danger">${item.warm !== undefined ? item.warm.toFixed(2) : '—'}</td>
                        <td class="text-success">${item.setpoint !== undefined ? item.setpoint.toFixed(2) : '—'}</td>
                        <td class="fw-semibold">${errorVal !== undefined ? errorVal.toFixed(2) : '—'}</td>
                        <td>${item.peltier_pwm !== undefined ? item.peltier_pwm : '—'}</td>
                        <td>${item.flow_rate !== undefined ? item.flow_rate.toFixed(2) : '—'}</td>
                    </tr>
                `;
    }

    if (data.length > 200) {
        tableHTML += `<tr><td colspan="7" class="text-center text-muted small py-3">Displayed are the first 200 rows from the total ${data.length} (for complete analysis use export to CSV/JSON)</td></tr>`;
    }

    tableBody.innerHTML = tableHTML;
}

function exportJSON() {
    if (loadedData.length === 0) {
        alert('No data available for export.');
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(loadedData, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", `export_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
}

function exportCSV() {
    if (loadedData.length === 0) {
        alert('No data available for export.');
        return;
    }
    const keys = Object.keys(loadedData[0]);
    const csvRows = [keys.join(',')];

    for (const row of loadedData) {
        const values = keys.map(key => {
            const val = row[key];
            return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
        });
        csvRows.push(values.join(','));
    }

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const dl = document.createElement('a');
    dl.setAttribute("href", encodedUri);
    dl.setAttribute("download", `export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
}