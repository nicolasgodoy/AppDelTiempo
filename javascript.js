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

const API_KEY = "9947d68c29bd23ed5b9b2fd3d9670ea1";

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

// --- Main Data Functions ---

const displayCurrentWeather = (data) => {
    tempDisplay.textContent = Math.round(data.main.temp);
    cityName.textContent = `${data.name}, ${data.sys.country}`;
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

    // API returns readings every 3 hours. We pick one per day (around noon).
    const dailyData = data.list.filter(item => item.dt_txt.includes("12:00:00"));

    dailyData.forEach(day => {
        const date = moment(day.dt * 1000).locale('es');
        const item = document.createElement("div");
        item.className = "forecast-item";

        item.innerHTML = `
            <span class="forecast-day">${date.format('ddd')}</span>
            <div class="forecast-icon">${getWeatherIcon(day.weather[0].icon)}</div>
            <span class="forecast-temp">${Math.round(day.main.temp)}°C</span>
        `;
        forecastContainer.appendChild(item);
    });

    if (window.lucide) lucide.createIcons();
};

async function fetchAllWeather(cityOrCoords) {
    let currentUrl, forecastUrl;

    if (typeof cityOrCoords === 'string') {
        currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${cityOrCoords}&appid=${API_KEY}&units=metric&lang=es`;
        forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${cityOrCoords}&appid=${API_KEY}&units=metric&lang=es`;
    } else {
        const { lat, lon } = cityOrCoords;
        currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=es`;
        forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=es`;
    }

    try {
        const [currentRes, forecastRes] = await Promise.all([
            fetch(currentUrl),
            fetch(forecastUrl)
        ]);

        if (!currentRes.ok) throw new Error("Ciudad no encontrada");

        const currentData = await currentRes.json();
        const forecastData = await forecastRes.json();

        displayCurrentWeather(currentData);
        displayForecast(forecastData);

    } catch (error) {
        console.error("Error fetching weather:", error);
        alert(error.message);
    }
}

// --- Geolocation ---

const getUserLocation = () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                fetchAllWeather({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                });
            },
            () => fetchAllWeather("Parana") // Fallback
        );
    } else {
        fetchAllWeather("Parana");
    }
};

// --- Listeners ---

searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const city = searchInput.value.trim();
    if (city) {
        fetchAllWeather(city);
        searchInput.value = "";
    }
});

geoBtn.addEventListener("click", getUserLocation);

window.onload = () => {
    getUserLocation();
};