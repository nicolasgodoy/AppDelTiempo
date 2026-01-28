// DOM Elements
const searchForm = document.getElementById("search-submit");
const searchInput = document.getElementById("search-input");
const tempDisplay = document.getElementById("Numero-Grados");
const weatherIcon = document.getElementById("wheater-Icon");
const description = document.getElementById("Descripcion");
const cityName = document.getElementById("timezone");
const dateDisplay = document.getElementById("date");
const minTemp = document.getElementById("min");
const maxTemp = document.getElementById("max");
const humidityDisplay = document.getElementById("humidity");
const windDisplay = document.getElementById("wind");
const feelsLikeDisplay = document.getElementById("feels-like");
const pressureDisplay = document.getElementById("pressure");
const forecastContainer = document.getElementById("forecast-container");
const bgOverlay = document.getElementById("bg-overlay");
const geoBtn = document.getElementById("geo-btn");
const dayModal = document.getElementById("day-modal");
const modalCloseBtn = document.getElementById("modal-close-btn");
const modalCloseBg = document.getElementById("modal-close-bg");

const API_KEY = "9947d68c29bd23ed5b9b2fd3d9670ea1";
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos en ms
let weatherChart = null;
let fullForecastList = [];

// --- Map Variables ---
let weatherMap = null;
let precipLayer = null; // OWM static fallback
let tempLayer = null;
let windLayer = null;
let currentWeatherLayer = null;

// --- Radar Animation (RainViewer) ---
let radarLayers = []; // Almacena los frames del radar
let radarInterval = null;
let currentFrame = 0;
let isRadarLoading = false;

// --- Cache Utilities ---
const getCache = (key) => {
    const cached = localStorage.getItem(`weather_cache_${key}`);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    const now = Date.now();

    if (now - timestamp > CACHE_DURATION) {
        localStorage.removeItem(`weather_cache_${key}`);
        return null;
    }
    return data;
};

const setCache = (key, data) => {
    const cacheData = {
        data,
        timestamp: Date.now()
    };
    localStorage.setItem(`weather_cache_${key}`, JSON.stringify(cacheData));
};

const getWeatherIcon = (iconCode) => {
    const iconMap = {
        '01d': 'sun', '01n': 'moon',
        '02d': 'cloud-sun', '02n': 'cloud-moon',
        '03d': 'cloud', '03n': 'cloud',
        '04d': 'cloud', '04n': 'cloud',
        '09d': 'cloud-drizzle', '09n': 'cloud-drizzle',
        '10d': 'cloud-rain', '10n': 'cloud-rain',
        '11d': 'cloud-lightning', '11n': 'cloud-lightning',
        '13d': 'snowflake', '13n': 'snowflake',
        '50d': 'cloud-fog', '50n': 'cloud-fog'
    };
    const iconName = iconMap[iconCode] || 'help-circle';
    return `<i data-lucide="${iconName}"></i>`;
};

const updateBackground = (weatherCode, timezoneOffset) => {
    // Determine time of day based on offset
    const utcSeconds = Math.floor(Date.now() / 1000);
    const localTime = new Date((utcSeconds + timezoneOffset) * 1000);
    const hour = localTime.getUTCHours();

    // Time slots
    const isDay = hour >= 6 && hour < 18;
    const isSunset = hour >= 18 && hour < 21;
    const isNight = hour >= 21 || hour < 6;

    let bgClass = "bg-clear-day";

    if (weatherCode >= 200 && weatherCode < 300) {
        bgClass = "bg-storm";
    } else if (weatherCode >= 300 && weatherCode < 700) {
        bgClass = "bg-rain";
    } else if (weatherCode >= 801) {
        if (isSunset) bgClass = "bg-sunset";
        else bgClass = isDay ? "bg-cloud-day" : "bg-cloud-night";
    } else {
        if (isSunset) bgClass = "bg-sunset";
        else bgClass = isDay ? "bg-clear-day" : "bg-clear-night";
    }

    bgOverlay.className = `background-overlay ${bgClass}`;

    // Update container class for specific styling
    const appContainer = document.getElementById("container");
    appContainer.className = `app-container ${bgClass}`;
};

const updateDateTime = (timezoneOffset) => {
    moment.locale('es');
    const localTime = moment().utcOffset(timezoneOffset / 60);
    dateDisplay.textContent = localTime.format('dddd, D [de] MMMM');
};

const updateChart = (data) => {
    const ctx = document.getElementById('tempChart').getContext('2d');

    // Tomamos las primeras 8 lecturas (próximas 24hs)
    const nextReadings = data.list.slice(0, 8);
    const labels = nextReadings.map(item => moment(item.dt * 1000).format('HH:mm'));
    const temps = nextReadings.map(item => Math.round(item.main.temp));

    if (weatherChart) {
        weatherChart.destroy();
    }

    weatherChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Temperatura (°C)',
                data: temps,
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.2)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#ffffff',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                }
            }
        }
    });
};

const showDayDetails = (dateString) => {
    const dayData = fullForecastList.filter(item => item.dt_txt.includes(dateString));
    if (dayData.length === 0) return;

    const firstItem = dayData[0];
    const dateMoment = moment(firstItem.dt * 1000).locale('es');

    // UI Elements Modal
    document.getElementById("modal-day-name").textContent = dateMoment.format('dddd');
    document.getElementById("modal-date").textContent = dateMoment.format('D [de] MMMM');

    // Stats calculations
    const avgHum = Math.round(dayData.reduce((acc, curr) => acc + curr.main.humidity, 0) / dayData.length);
    const maxWind = Math.round(Math.max(...dayData.map(item => item.wind.speed * 3.6)));
    const maxRainProb = Math.round(Math.max(...dayData.map(item => item.pop || 0)) * 100);

    document.getElementById("modal-hum").textContent = `${avgHum}%`;
    document.getElementById("modal-wind").textContent = `${maxWind} km/h`;
    document.getElementById("modal-rain").textContent = `${maxRainProb}%`;

    // Hourly list
    const hourlyList = document.getElementById("modal-hourly-list");
    hourlyList.innerHTML = "";

    dayData.forEach(hour => {
        const hTime = moment(hour.dt * 1000).format('HH:mm');
        const hItem = document.createElement("div");
        hItem.className = "hourly-item";
        hItem.innerHTML = `
            <span class="hourly-time">${hTime} hs</span>
            <span class="hourly-desc">${hour.weather[0].description}</span>
            <div class="hourly-icon">${getWeatherIcon(hour.weather[0].icon)}</div>
            <span class="hourly-temp"><b>${Math.round(hour.main.temp)}°</b></span>
        `;
        hourlyList.appendChild(hItem);
    });

    dayModal.classList.add("active");
    if (window.lucide) lucide.createIcons();
};

const closeModal = () => {
    dayModal.classList.remove("active");
};

// --- Map Functions ---

const initMap = () => {
    // Límites aproximados de Argentina
    const argentinaBounds = L.latLngBounds(
        L.latLng(-56.5, -75),
        L.latLng(-21, -50.5)
    );

    const argentinaCenter = [-38.4161, -63.6167];

    weatherMap = L.map('weather-map', {
        center: argentinaCenter,
        zoom: 4,
        minZoom: 4,
        maxBounds: argentinaBounds,
        maxBoundsViscosity: 1.0
    });

    // 1. Capa BASE (Solo terreno/calles, SIN etiquetas)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(weatherMap);

    // 2. Capas de OpenWeatherMap (Sándwich: entre base y etiquetas)
    precipLayer = L.tileLayer(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${API_KEY}`, {
        opacity: 0.9,
        className: 'vivid-layer',
        zIndex: 5
    });

    tempLayer = L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${API_KEY}`, {
        opacity: 0.95,
        className: 'vivid-layer',
        zIndex: 5
    });

    windLayer = L.tileLayer(`https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${API_KEY}`, {
        opacity: 0.95,
        className: 'vivid-layer',
        zIndex: 5
    });

    // 3. Capa de ETIQUETAS (Siempre arriba de todo para ver ciudades)
    const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
        zIndex: 100, // Forzar arriba
        opacity: 0.9
    });

    // Empezar con Lluvias por defecto
    precipLayer.addTo(weatherMap);
    labelsLayer.addTo(weatherMap);
    currentWeatherLayer = precipLayer;

    // Cargar radar y leyenda
    loadRadarFrames();
    updateMapLegend('precip');
};

const updateMapLegend = (type) => {
    const legend = document.getElementById("map-legend");
    let content = "";

    if (type === 'precip') {
        content = `
            <div class="legend-title">Intensidad Lluvia</div>
            <div class="legend-gradient" style="background: linear-gradient(to right, #f7fbff, #9ecae1, #4292c6, #084594, #08306b);"></div>
            <div class="legend-labels">
                <span>Ligera</span>
                <span>Fuerte</span>
            </div>
        `;
    } else if (type === 'temp') {
        content = `
            <div class="legend-title">Temperatura (°C)</div>
            <div class="legend-gradient" style="background: linear-gradient(to right, #0000ff, #00ffff, #ffff00, #ff0000, #8b0000);"></div>
            <div class="legend-labels">
                <span>-30°</span>
                <span>0°</span>
                <span>45°</span>
            </div>
        `;
    } else if (type === 'wind') {
        content = `
            <div class="legend-title">Velocidad Viento</div>
            <div class="legend-gradient" style="background: linear-gradient(to right, #ffffff, #00ff00, #ffff00, #ff0000);"></div>
            <div class="legend-labels">
                <span>Baja</span>
                <span>Alta</span>
            </div>
        `;
    }

    legend.innerHTML = content;
};

const loadRadarFrames = async () => {
    if (isRadarLoading) return;
    isRadarLoading = true;

    try {
        const response = await fetch("https://api.rainviewer.com/public/weather-maps.json");
        const data = await response.json();

        if (!data.radar || !data.radar.past) return;

        // Tomamos los últimos 10 frames para una animación fluida
        const frames = data.radar.past.slice(-10);
        const host = data.host;

        // Limpiar capas anteriores si hubiera
        radarLayers.forEach(layer => weatherMap.removeLayer(layer));
        radarLayers = [];

        frames.forEach(frame => {
            const layer = L.tileLayer(`${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
                opacity: 0, // Invisibles al inicio
                zIndex: 15, // Por debajo de las etiquetas
                className: 'vivid-layer'
            });
            radarLayers.push(layer);
            layer.addTo(weatherMap);
        });

        console.log(`Radar cargado: ${radarLayers.length} frames.`);
    } catch (error) {
        console.error("Error cargando radar animado:", error);
    } finally {
        isRadarLoading = false;
    }
};

const startRadarLoop = () => {
    if (radarInterval) clearInterval(radarInterval);
    if (radarLayers.length === 0) return;

    radarInterval = setInterval(() => {
        // Ocultar todos los frames
        radarLayers.forEach(l => l.setOpacity(0));

        // Mostrar el frame actual
        radarLayers[currentFrame].setOpacity(0.9);

        currentFrame = (currentFrame + 1) % radarLayers.length;
    }, 800); // 800ms por frame para que se note el movimiento

    // Mostrar el scanner visual
    document.querySelector(".map-container").classList.add("radar-active");
};

const stopRadarLoop = () => {
    if (radarInterval) {
        clearInterval(radarInterval);
        radarInterval = null;
    }
    radarLayers.forEach(l => l.setOpacity(0));
    document.querySelector(".map-container").classList.remove("radar-active");
};

const updateMapPosition = (lat, lon) => {
    if (weatherMap) {
        weatherMap.setView([lat, lon], 8);
        // Opcional: Agregar un marcador en la ubicación buscada
        L.marker([lat, lon]).addTo(weatherMap)
            .bindPopup('Ubicación seleccionada')
            .openPopup();
    }
};

const switchLayer = (type) => {
    if (!weatherMap) return;

    // Detener animación previa si la hubiera
    stopRadarLoop();

    // Limpiar clases de animación
    const mapContainer = document.querySelector(".map-container");
    mapContainer.classList.remove("radar-active", "pulse-active");

    if (currentWeatherLayer) {
        weatherMap.removeLayer(currentWeatherLayer);
    }

    const btnPrecip = document.getElementById("layer-precip");
    const btnTemp = document.getElementById("layer-temp");
    const btnWind = document.getElementById("layer-wind");

    // Limpiar clases activas de botones
    [btnPrecip, btnTemp, btnWind].forEach(btn => btn.classList.remove("active"));

    if (type === 'precip') {
        // En modo lluvia, usamos el radar animado si está listo
        if (radarLayers.length > 0) {
            startRadarLoop();
        } else {
            // Fallback al estático si falla RainViewer
            precipLayer.addTo(weatherMap);
        }
        currentWeatherLayer = precipLayer;
        btnPrecip.classList.add("active");
    } else if (type === 'temp') {
        tempLayer.addTo(weatherMap);
        currentWeatherLayer = tempLayer;
        btnTemp.classList.add("active");
        mapContainer.classList.add("pulse-active"); // Efecto de calor pulsante
    } else {
        windLayer.addTo(weatherMap);
        currentWeatherLayer = windLayer;
        btnWind.classList.add("active");
    }

    // Actualizar la leyenda visual
    updateMapLegend(type);
};

// --- Main Data Functions ---

const displayCurrentWeather = (data) => {
    tempDisplay.textContent = Math.round(data.main.temp);
    cityName.textContent = data.name;
    description.textContent = data.weather[0].description;
    minTemp.textContent = Math.floor(data.main.temp_min);
    maxTemp.textContent = Math.ceil(data.main.temp_max);

    // Metrics
    humidityDisplay.textContent = `${data.main.humidity}%`;
    windDisplay.textContent = `${Math.round(data.wind.speed * 3.6)} km/h`;
    feelsLikeDisplay.textContent = `${Math.round(data.main.feels_like)}°C`;
    pressureDisplay.textContent = `${data.main.pressure} hPa`;

    // Icon - Usando Lucide para evitar errores de carga
    weatherIcon.innerHTML = getWeatherIcon(data.weather[0].icon);

    // Background & Time
    updateBackground(data.weather[0].id, data.timezone);
    updateDateTime(data.timezone);

    // Refresh icons
    if (window.lucide) lucide.createIcons();
};

const displayForecast = (data) => {
    forecastContainer.innerHTML = "";
    fullForecastList = data.list;

    // API returns readings every 3 hours. We pick one per day (around noon).
    const dailyData = data.list.filter(item => item.dt_txt.includes("12:00:00"));

    dailyData.forEach(day => {
        const date = moment(day.dt * 1000).locale('es');
        const item = document.createElement("div");
        item.className = "forecast-item";

        // Obtenemos solo la fecha YYYY-MM-DD para filtrar mas tarde
        const dateStr = day.dt_txt.split(" ")[0];

        item.innerHTML = `
            <span class="forecast-day">${date.format('ddd')}</span>
            <div class="forecast-icon">${getWeatherIcon(day.weather[0].icon)}</div>
            <span class="forecast-temp">${Math.round(day.main.temp)}°C</span>
        `;

        item.addEventListener("click", () => showDayDetails(dateStr));
        forecastContainer.appendChild(item);
    });

    updateChart(data);

    if (window.lucide) lucide.createIcons();
};

async function fetchAllWeather(cityOrCoords) {
    let lat, lon, officialName, state;

    try {
        if (typeof cityOrCoords === 'string') {
            const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${cityOrCoords}&limit=1&appid=${API_KEY}`;
            const geoRes = await fetch(geoUrl);
            const geoData = await geoRes.json();

            if (!geoData || geoData.length === 0) throw new Error("Ciudad no encontrada");

            lat = geoData[0].lat;
            lon = geoData[0].lon;
            state = geoData[0].state;

            // Actualizar mapa si existe una búsqueda
            updateMapPosition(lat, lon);

            // Intentar obtener el nombre en Español (local_names.es)
            officialName = (geoData[0].local_names && geoData[0].local_names.es)
                ? geoData[0].local_names.es
                : geoData[0].name;
        } else {
            console.log("Obteniendo clima por coordenadas...");
            lat = cityOrCoords.lat;
            lon = cityOrCoords.lon;

            // Reverse geocoding para obtener nombre y estado al usar GPS
            const revGeoUrl = `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`;
            const revRes = await fetch(revGeoUrl);
            const revData = await revRes.json();
            if (revData && revData.length > 0) {
                state = revData[0].state;
                officialName = (revData[0].local_names && revData[0].local_names.es)
                    ? revData[0].local_names.es
                    : revData[0].name;
            }
        }

        // Generar una clave única para el cache
        const cacheKey = typeof cityOrCoords === 'string'
            ? cityOrCoords.toLowerCase().trim()
            : `${cityOrCoords.lat.toFixed(4)}_${cityOrCoords.lon.toFixed(4)}`;

        const cachedData = getCache(cacheKey);
        if (cachedData) {
            console.log("Cargando datos desde el cache...");
            displayCurrentWeather(cachedData.current);
            displayForecast(cachedData.forecast);
            return;
        }

        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=es`;
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=es`;

        const [currentRes, forecastRes] = await Promise.all([
            fetch(currentUrl),
            fetch(forecastUrl)
        ]);

        if (!currentRes.ok) throw new Error("Error al obtener el clima");

        const currentData = await currentRes.json();
        const forecastData = await forecastRes.json();

        // Enriquecer el nombre con Traducción
        if (officialName) {
            // Limpiar el nombre del estado (quitar "Province", "Provincia", etc.)
            let cleanState = state ? state.replace(/ province| provincia/gi, "") : "";

            // Evitar repetir si el estado es igual a la ciudad
            if (cleanState && cleanState !== officialName) {
                currentData.name = `${officialName}, ${cleanState}`;
            } else {
                currentData.name = officialName;
            }
        }

        // Guardar en cache el resultado final procesado
        setCache(cacheKey, { current: currentData, forecast: forecastData });

        displayCurrentWeather(currentData);
        displayForecast(forecastData);

    } catch (error) {
        console.error("Error fetching weather:", error);
        alert(error.message);
    }
}

// --- Geolocation ---

const getUserLocation = () => {
    geoBtn.classList.add("loading");
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                fetchAllWeather({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                });
                geoBtn.classList.remove("loading");
            },
            () => {
                fetchAllWeather("Parana");
                geoBtn.classList.remove("loading");
            }
        );
    } else {
        fetchAllWeather("Parana");
        geoBtn.classList.remove("loading");
    }
};

// --- Listeners ---

const CITY_ALIASES = {
    "brugo": "Pueblo Brugo",
    "pueblo brugo": "Pueblo Brugo",
    "parana": "Paraná",
    "caba": "Buenos Aires",
    "cordoba": "Córdoba",
    "rosario": "Rosario",
    "russia": "Moscú",
    "rusia": "Moscú",
    "brazil": "Brasilia",
    "brasil": "Brasilia",
    "argentina": "Buenos Aires",
    "usa": "Washington D.C.",
    "eeuu": "Washington D.C.",
    "españa": "Madrid",
    "spain": "Madrid",
    "china": "Pekín"
};

const COUNTRY_NAMES = {
    "AR": "Argentina", "RU": "Rusia", "CN": "China", "US": "EE.UU.",
    "ES": "España", "BR": "Brasil", "IT": "Italia", "FR": "Francia",
    "DE": "Alemania", "GB": "Reino Unido", "JP": "Japón", "MX": "México",
    "UY": "Uruguay", "CL": "Chile", "CO": "Colombia", "PE": "Perú"
};

searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const rawInput = searchInput.value.trim().toLowerCase();

    // Buscar en el mapa de alias o usar el original
    let city = CITY_ALIASES[rawInput] || searchInput.value.trim();

    if (city) {
        fetchAllWeather(city);
        searchInput.value = "";
    }
});

geoBtn.addEventListener("click", getUserLocation);
modalCloseBtn.addEventListener("click", closeModal);
modalCloseBg.addEventListener("click", closeModal);

// Map Controls
document.getElementById("layer-precip").addEventListener("click", () => switchLayer('precip'));
document.getElementById("layer-temp").addEventListener("click", () => switchLayer('temp'));
document.getElementById("layer-wind").addEventListener("click", () => switchLayer('wind'));

window.onload = () => {
    getUserLocation();
    initMap();
};