const map = L.map('map').setView([39.8283, -98.5795], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

let routeLayer = null;
let startMarker = null;
let destMarker = null;
let weatherMarkers = [];
let routeCoordinates = [];

let currentSuggestions = [];
let selectedIndex = -1;

function pad2(value) {
    return String(value).padStart(2, '0');
}

function formatDateOption(date) {
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function populateDepartureSelectors() {
    const dateSelect = document.getElementById('departureDate');
    const timeSelect = document.getElementById('departureTime');
    dateSelect.innerHTML = '';
    timeSelect.innerHTML = '';

    const now = new Date();
    for (let i = 0; i < 5; i++) {
        const optionDate = new Date(now);
        optionDate.setDate(now.getDate() + i);
        const value = `${optionDate.getFullYear()}-${pad2(optionDate.getMonth() + 1)}-${pad2(optionDate.getDate())}`;
        const label = i === 0
            ? `Today (${formatDateOption(optionDate)})`
            : i === 1
                ? `Tomorrow (${formatDateOption(optionDate)})`
                : formatDateOption(optionDate);
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        dateSelect.appendChild(option);
    }

    for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
            const value = `${pad2(hour)}:${pad2(minute)}`;
            const displayHour = hour % 12 === 0 ? 12 : hour % 12;
            const suffix = hour < 12 ? 'AM' : 'PM';
            const option = document.createElement('option');
            option.value = value;
            option.textContent = `${displayHour}:${pad2(minute)} ${suffix}`;
            timeSelect.appendChild(option);
        }
    }

    setDefaultDepartureTime();
}

function setDefaultDepartureTime() {
    const now = new Date();
    const roundedMinutes = Math.ceil(now.getMinutes() / 15) * 15;
    if (roundedMinutes === 60) {
        now.setHours(now.getHours() + 1);
        now.setMinutes(0);
    } else {
        now.setMinutes(roundedMinutes);
    }
    now.setSeconds(0);
    now.setMilliseconds(0);

    const dateSelect = document.getElementById('departureDate');
    const timeSelect = document.getElementById('departureTime');
    const dateValue = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const timeValue = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

    if ([...dateSelect.options].some(o => o.value === dateValue)) {
        dateSelect.value = dateValue;
    } else {
        dateSelect.selectedIndex = 0;
    }
    timeSelect.value = timeValue;
}

function getSelectedDepartureTime() {
    const dateValue = document.getElementById('departureDate').value;
    const timeValue = document.getElementById('departureTime').value;
    const [year, month, day] = dateValue.split('-').map(Number);
    const [hour, minute] = timeValue.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0);
}

// ==================== GEOCODING (USA + Canada only) ====================
async function geocode(query) {
    try {
        // Extract city and state/province
        let cityName = query;
        let stateName = null;
        
        if (query.includes(',')) {
            const parts = query.split(',');
            cityName = parts[0].trim();
            stateName = parts[1].trim();
        } else {
            const words = query.trim().split(/\s+/);
            if (words.length > 1) {
                cityName = words[0];
                stateName = words.slice(1).join(' ');
            }
        }
        
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=10&language=en&format=json&countrycodes=US,CA`);
        const data = await res.json();
        let usCaResults = data.results?.filter(r => r.country_code === 'US' || r.country_code === 'CA') || [];
        
        // If state was provided, filter by admin1 (state/province name)
        if (stateName) {
            const filtered = usCaResults.filter(r => r.admin1 && r.admin1.toLowerCase().includes(stateName.toLowerCase()));
            if (filtered.length > 0) {
                usCaResults = filtered;
            }
        }
        
        if (usCaResults.length) {
            const preferred = usCaResults[0];
            return { lat: preferred.latitude, lon: preferred.longitude, name: preferred.name };
        }
    } catch (e) {}
    throw new Error(`Location "${query}" not found`);
}

async function getTimezone(lat, lon) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`);
        const data = await res.json();
        return data.timezone;
    } catch { return "America/New_York"; }
}

// ==================== AUTOCOMPLETE (USA + Canada only) ====================
async function autocompleteLocation(query, suggestionsId) {
    const container = document.getElementById(suggestionsId);
    selectedIndex = -1;
    currentSuggestions = [];

    if (query.length < 3) {
        container.style.display = 'none';
        return;
    }

    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en&format=json&countrycodes=US,CA`);
        const data = await res.json();
        container.innerHTML = '';
        const usCaResults = data.results?.filter(r => r.country_code === 'US' || r.country_code === 'CA') || [];
        if (usCaResults.length) {
            currentSuggestions = usCaResults;
            usCaResults.forEach((item, i) => {
                const div = document.createElement('div');
                div.textContent = `${item.name}${item.admin1 ? ', ' + item.admin1 : ''} (${item.country_code})`;
                div.onclick = () => selectSuggestion(i, suggestionsId);
                container.appendChild(div);
            });
            container.style.display = 'block';
        }
    } catch (e) { container.style.display = 'none'; }
}

function selectSuggestion(index, suggestionsId) {
    const item = currentSuggestions[index];
    if (!item) return;
    const display = `${item.name}${item.admin1 ? ', ' + item.admin1 : ''}`;
    const inputId = suggestionsId.replace('-suggestions', '');
    document.getElementById(inputId).value = display;
    document.getElementById(suggestionsId).style.display = 'none';
}

function setupKeyboardNavigation(inputId, suggestionsId) {
    const input = document.getElementById(inputId);
    input.addEventListener('keydown', (e) => {
        const container = document.getElementById(suggestionsId);
        const items = container.querySelectorAll('div');

        if (container.style.display === 'none' || items.length === 0) {
            if (e.key === 'Enter') getRoute();
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            updateSelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0) selectSuggestion(selectedIndex, suggestionsId);
            else getRoute();
        } else if (e.key === 'Escape') {
            container.style.display = 'none';
            selectedIndex = -1;
        }
    });
}

function updateSelection(items) {
    items.forEach((item, i) => item.classList.toggle('selected', i === selectedIndex));
}

// ==================== WEATHER FUNCTIONS ====================
async function getWeather(lat, lon, targetDate, timezone) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=10&timezone=${encodeURIComponent(timezone)}`;
    const res = await fetch(url);
    const data = await res.json();

    const hourly = data.hourly;
    let bestIndex = 0, minDiff = Infinity;
    for (let i = 0; i < hourly.time.length; i++) {
        const diff = Math.abs(new Date(hourly.time[i]) - targetDate);
        if (diff < minDiff) { minDiff = diff; bestIndex = i; }
    }

    const code = hourly.weather_code[bestIndex];
    return {
        temp: hourly.temperature_2m[bestIndex],
        condition: getWeatherCondition(code),
        weatherCode: code,
        windSpeed: hourly.wind_speed_10m[bestIndex],
        windDirection: hourly.wind_direction_10m[bestIndex],
        windGusts: hourly.wind_gusts_10m[bestIndex] || hourly.wind_speed_10m[bestIndex],
        visibility: hourly.visibility ? hourly.visibility[bestIndex] / 1609.34 : null
    };
}

function getWeatherCondition(code) {
    const map = {
        0: {text:'Clear', icon:'☀️'}, 1: {text:'Mainly clear', icon:'🌤️'},
        2: {text:'Partly cloudy', icon:'⛅'}, 3: {text:'Overcast', icon:'☁️'},
        45: {text:'Fog', icon:'🌫️'}, 48: {text:'Fog', icon:'🌫️'},
        51: {text:'Drizzle', icon:'🌧️'}, 61: {text:'Rain', icon:'🌧️'},
        71: {text:'Snow', icon:'❄️'}, 80: {text:'Showers', icon:'🌦️'},
        95: {text:'Thunderstorm', icon:'⛈️'}
    };
    return map[code] || {text:'Cloudy', icon:'☁️'};
}

function isSnowOrIce(code) { return [71,73,75,77,85,86].includes(code); }
function isLowVisibility(vis) { return vis && vis < 2; }

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959;
    const dLat = (lat2-lat1)*Math.PI/180;
    const dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function sampleRoutePoints(coords) {
    const points = [];
    let cumDist = 0, last = coords[0];
    points.push({lat: last[1], lon: last[0], fraction: 0});
    for (let i = 1; i < coords.length; i++) {
        const curr = coords[i];
        cumDist += calculateDistance(last[1], last[0], curr[1], curr[0]);
        if (cumDist >= points.length * 30) {
            points.push({lat: curr[1], lon: curr[0], fraction: i / (coords.length-1)});
        }
        last = curr;
    }
    if (points[points.length-1].fraction < 0.99) {
        const end = coords[coords.length-1];
        points.push({lat: end[1], lon: end[0], fraction: 1});
    }
    return points;
}

const placeRegionMap = {
    US: {
        'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA','colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA','hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT','virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY'
    },
    CA: {
        'alberta':'AB','british columbia':'BC','manitoba':'MB','new brunswick':'NB','newfoundland and labrador':'NL','nova scotia':'NS','ontario':'ON','prince edward island':'PE','quebec':'QC','saskatchewan':'SK','northwest territories':'NT','nunavut':'NU','yukon':'YT'
    }
};

async function reverseGeocode(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
        const data = await res.json();
        const address = data.address || {};
        const place = address.city || address.town || address.village || address.hamlet || address.county || "Route";
        const country = (address.country_code || 'US').toUpperCase();
        let stateAbbr = address.state_code || null;
        if (!stateAbbr && address.state) {
            stateAbbr = placeRegionMap[country]?.[address.state.toLowerCase()] || null;
        }
        if (stateAbbr && place !== "Route") {
            return `${place}, ${stateAbbr.toUpperCase()}`;
        }
        return place;
    } catch {}
    return "Route";
}

async function getWeatherAlongRoute(coords, durationSec, departureTime, destTimezone, destLat, destLon) {
    weatherMarkers = [];
    const points = sampleRoutePoints(coords);
    const alerts = [];
    const startTime = departureTime;

    for (let i = 0; i < points.length; i++) {
        const p = points[i];

        // Skip second-to-last marker if within 10 miles of destination
        if (i === points.length - 2 && calculateDistance(p.lat, p.lon, destLat, destLon) < 10) {
            continue;
        }

        const arrival = new Date(startTime.getTime() + p.fraction * durationSec * 1000);
        const weather = await getWeather(p.lat, p.lon, arrival, destTimezone);

        const highWind = weather.windSpeed > 25 || weather.windGusts > 35;
        const snowIce = isSnowOrIce(weather.weatherCode);
        const lowVis = isLowVisibility(weather.visibility);

        // Only perform reverse geocode when we need a human-friendly name for alerts
        let locationName = null;
        if (highWind || lowVis) {
            try {
                locationName = await reverseGeocode(p.lat, p.lon);
            } catch (e) {
                locationName = "Route";
            }
        }

        if (highWind) alerts.push({type:'wind', message: `High winds near ${locationName} at ${formatTime(arrival)}`, index: i});
        if (lowVis) alerts.push({type:'visibility', message: `Low visibility (${(weather.visibility || 0).toFixed(1)} mi) near ${locationName} at ${formatTime(arrival)}`, index: i});

        addWeatherMarker(p.lat, p.lon, weather, arrival, highWind, snowIce, lowVis, i);
    }
    displayAlerts(alerts);
}

function addWeatherMarker(lat, lon, w, arrival, highWind, snowIce, lowVis, index) {
    let vis = '';
    if (w.visibility && w.visibility < 5) {
        const color = w.visibility < 2 ? '#e74c3c' : '#f39c12';
        vis = `<div class="vis" style="color:${color}; font-weight:500">Vis: ${w.visibility.toFixed(1)} mi</div>`;
    }

    const html = `
        <div class="weather-marker ${highWind ? 'high-wind' : ''} ${snowIce ? 'snow-ice' : ''} ${lowVis ? 'low-vis' : ''}">
            <div class="cond-temp">
                <div class="condition-icon">${w.condition.icon}</div>
                <div class="temp">${Math.round(w.temp)}°F</div>
            </div>
            <div class="condition-label">${w.condition.text}</div>
            ${vis}
            <div class="wind">
                <span class="wind-arrow" style="transform:rotate(${w.windDirection}deg)">↓</span>
                <span class="wind-values">${Math.round(w.windSpeed)} - ${Math.round(w.windGusts)}<span class="wind-unit">mph</span></span>
            </div>
            <div class="time">${formatTime(arrival)}</div>
        </div>`;

    const icon = L.divIcon({ className: '', html, iconSize: [175, 140], iconAnchor: [87, 70] });
    const marker = L.marker([lat, lon], {icon}).addTo(map);
    weatherMarkers.push({marker, index});
}

function displayAlerts(alerts) {
    const div = document.getElementById('alerts');
    div.innerHTML = '';
    alerts.forEach(a => {
        const el = document.createElement('div');
        el.className = `alert alert-${a.type}`;
        el.textContent = a.message;
        el.onclick = () => focusMarker(a.index);
        div.appendChild(el);
    });
}

function focusMarker(index) {
    if (weatherMarkers[index]) {
        map.flyTo(weatherMarkers[index].marker.getLatLng(), 11, {duration: 1.5});
    }
}

function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDuration(sec) {
    const h = Math.floor(sec/3600);
    const m = Math.floor((sec%3600)/60);
    return h ? `${h}h ${m}m` : `${m}m`;
}

function clearRoute() {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
    if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
    weatherMarkers.forEach(m => map.removeLayer(m.marker));
    weatherMarkers = [];
    document.getElementById('alerts').innerHTML = '';
    document.getElementById('info').style.display = 'none';
}

async function getRoute() {
    const startInput = document.getElementById('start').value.trim();
    const destInput = document.getElementById('destination').value.trim();
    if (!startInput || !destInput) return alert("Please enter both start and destination");

    document.getElementById('loading').style.display = 'block';
    document.getElementById('getRouteBtn').disabled = true;
    clearRoute();

    try {
        const departureTime = getSelectedDepartureTime();
        if (isNaN(departureTime.getTime())) throw new Error("Invalid departure time");

        const start = await geocode(startInput);
        const dest = await geocode(destInput);
        const destTimezone = await getTimezone(dest.lat, dest.lon);

        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson`);
        const data = await res.json();

        if (data.code !== 'Ok') throw new Error("No route found");

        const route = data.routes[0];
        routeCoordinates = route.geometry.coordinates;

        const latlngs = routeCoordinates.map(c => [c[1], c[0]]);
        routeLayer = L.polyline(latlngs, {color: '#3498db', weight: 6, opacity: 0.8}).addTo(map);
        map.fitBounds(routeLayer.getBounds(), {padding: [60, 60]});

        if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
        if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
        startMarker = L.marker([start.lat, start.lon]).addTo(map).bindPopup("Start");
        destMarker = L.marker([dest.lat, dest.lon]).addTo(map).bindPopup("Destination");

        document.getElementById('distance').innerHTML = `📍 ${(route.distance/1609.34).toFixed(1)} mi`;
        document.getElementById('duration').innerHTML = `⏱ ${formatDuration(route.duration)}`;
        const eta = new Date(departureTime.getTime() + route.duration * 1000);
        document.getElementById('eta').innerHTML = `🏁 ${formatTime(eta)}`;
        document.getElementById('info').style.display = 'inline-block';

        await getWeatherAlongRoute(routeCoordinates, route.duration, departureTime, destTimezone, dest.lat, dest.lon);
    } catch (err) {
        alert(err.message || "Error calculating route");
    } finally {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('getRouteBtn').disabled = false;
    }
}

function swapLocations() {
    const startInput = document.getElementById('start');
    const destInput = document.getElementById('destination');
    const startValue = startInput.value.trim();
    const destValue = destInput.value.trim();
    if (!startValue || !destValue) return;
    startInput.value = destValue;
    destInput.value = startValue;
    document.getElementById('start-suggestions').style.display = 'none';
    document.getElementById('destination-suggestions').style.display = 'none';
}

// Initialize
window.onload = () => {
    populateDepartureSelectors();
    ['start', 'destination'].forEach(id => {
        const input = document.getElementById(id);
        const suggId = id + '-suggestions';
        input.addEventListener('input', () => autocompleteLocation(input.value, suggId));
        setupKeyboardNavigation(id, suggId);
    });
};

document.addEventListener('click', e => {
    if (!e.target.closest('#controls')) {
        document.querySelectorAll('.autocomplete-suggestions').forEach(el => el.style.display = 'none');
    }
});
