/* ── 🔑 YOUR API KEY ── */
const API_KEY = '1347486dc4cc131b640301b7c1abe29f';   

/* ── API Base URLs (OpenWeatherMap v2.5 — Free Tier) ── */
const BASE_URL     = 'https://api.openweathermap.org/data/2.5/weather';
const FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';
const ICON_URL     = 'https://openweathermap.org/img/wn/';

/* ── localStorage keys ── */
const LS_THEME   = 'skypulse_theme';
const LS_RECENT  = 'skypulse_recent';

/* ══════════════════════════════════════════════════════
   DOM REFERENCES
══════════════════════════════════════════════════════ */
const cityInput      = document.getElementById('cityInput');
const searchBtn      = document.getElementById('searchBtn');
const locateBtn      = document.getElementById('locateBtn');
const themeToggle    = document.getElementById('themeToggle');
const themeIcon      = document.getElementById('themeIcon');
const errorMessage   = document.getElementById('errorMessage');
const errorText      = document.getElementById('errorText');
const loadingState   = document.getElementById('loadingState');
const weatherContent = document.getElementById('weatherContent');
const recentDiv      = document.getElementById('recentSearches');
const bgLayer        = document.getElementById('bgLayer');

// Current weather elements
const cityName       = document.getElementById('cityName');
const countryDate    = document.getElementById('countryDate');
const tempValue      = document.getElementById('tempValue');
const conditionText  = document.getElementById('conditionText');
const feelsLike      = document.getElementById('feelsLike');
const humidity       = document.getElementById('humidity');
const windSpeed      = document.getElementById('windSpeed');
const pressure       = document.getElementById('pressure');
const visibility     = document.getElementById('visibility');
const cloudCover     = document.getElementById('cloudCover');
const weatherIcon    = document.getElementById('weatherIcon');
const forecastGrid   = document.getElementById('forecastGrid');

/* ══════════════════════════════════════════════════════
   BACKGROUND CONDITION MAPPING
══════════════════════════════════════════════════════ */

/**
 * Map an OpenWeather condition ID to a background preset key.
 * Condition ID docs: https://openweathermap.org/weather-conditions
 *
 * @param {number} id        - Weather condition ID from API
 * @param {number} icon_code - Icon code (used to detect day/night via 'd'/'n')
 * @returns {string}         - CSS data-bg value
 */
function getBgKey(id, icon_code) {
  const isNight = icon_code && icon_code.endsWith('n');
  if (isNight) return 'night';
  if (id >= 200 && id < 300) return 'thunder';   // Thunderstorm
  if (id >= 300 && id < 600) return 'rainy';     // Drizzle + Rain
  if (id >= 600 && id < 700) return 'snow';      // Snow
  if (id >= 700 && id < 800) return 'cloudy';    // Atmosphere (fog, mist…)
  if (id === 800)             return 'sunny';     // Clear sky
  if (id > 800)               return 'cloudy';   // Clouds
  return 'sunny';
}

/** Set the data-bg attribute on <html> to trigger CSS variable changes */
function setBackground(id, icon_code) {
  const key = getBgKey(id, icon_code);
  document.documentElement.setAttribute('data-bg', key);
}

/* ══════════════════════════════════════════════════════
   RECENT SEARCHES  (localStorage, max 5)
══════════════════════════════════════════════════════ */

/** Load recent searches from localStorage */
function getRecent() {
  try { return JSON.parse(localStorage.getItem(LS_RECENT)) || []; }
  catch { return []; }
}

/** Save a city to recent searches (deduplicated, capped at 5) */
function saveRecent(city) {
  let list = getRecent().filter(c => c.toLowerCase() !== city.toLowerCase());
  list.unshift(city);               // newest first
  if (list.length > 5) list.pop(); // cap at 5
  localStorage.setItem(LS_RECENT, JSON.stringify(list));
}

/** Render recent-search chips below the search bar */
function renderRecent() {
  const list = getRecent();
  recentDiv.innerHTML = '';
  if (list.length === 0) return;

  // Label
  const label = document.createElement('span');
  label.className = 'recent-label';
  label.textContent = 'Recent:';
  recentDiv.appendChild(label);

  // Chips
  list.forEach(city => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = city;
    chip.setAttribute('aria-label', `Search ${city}`);
    chip.addEventListener('click', () => {
      cityInput.value = city;
      fetchWeather(city);
    });
    recentDiv.appendChild(chip);
  });
}

// Render on page load
renderRecent();

/* ══════════════════════════════════════════════════════
   UI STATE HELPERS
══════════════════════════════════════════════════════ */

function showLoading() {
  errorMessage.classList.add('hidden');
  weatherContent.classList.add('hidden');
  loadingState.classList.remove('hidden');
}

function hideLoading() {
  loadingState.classList.add('hidden');
}

function showError(msg) {
  hideLoading();
  weatherContent.classList.add('hidden');
  errorText.textContent = msg;
  errorMessage.classList.remove('hidden');
}

function showWeather() {
  hideLoading();
  errorMessage.classList.add('hidden');
  weatherContent.classList.remove('hidden');
}

/* ══════════════════════════════════════════════════════
   DATE / TIME HELPERS
══════════════════════════════════════════════════════ */

/**
 * Format a Unix timestamp (seconds) into a readable date string
 * e.g. "Thursday, 14 May 2026"
 */
function formatDate(unixSec, timezoneOffsetSec) {
  const localMs = (unixSec + timezoneOffsetSec) * 1000;
  const d = new Date(localMs);

  // Use UTC values because we've already applied offset
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return `${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Given a UTC date string "2026-05-14 09:00:00",
 * extract a short weekday name like "Thu"
 */
function shortDay(dtTxt) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return days[new Date(dtTxt).getDay()];
}

/* ══════════════════════════════════════════════════════
   WEATHER ICON URL BUILDER
══════════════════════════════════════════════════════ */

/** Returns a high-res (2x) OpenWeatherMap icon URL */
function iconURL(code) {
  return `${ICON_URL}${code}@2x.png`;
}

/* ══════════════════════════════════════════════════════
   RENDER CURRENT WEATHER
══════════════════════════════════════════════════════ */

/**
 * Populate all the current-weather DOM elements.
 * @param {Object} data - JSON response from /weather endpoint
 */
function renderCurrent(data) {
  const { name, sys, main, weather, wind, visibility: vis, clouds, dt, timezone } = data;
  const w = weather[0];

  // Set background based on condition
  setBackground(w.id, w.icon);

  // City name + country + date
  cityName.textContent    = name;
  countryDate.textContent = `${sys.country} · ${formatDate(dt, timezone)}`;

  // Temperature (round to 1 decimal)
  tempValue.textContent   = Math.round(main.temp);

  // Condition
  conditionText.textContent = w.description;

  // Stats
  feelsLike.textContent  = `${Math.round(main.feels_like)}°C`;
  humidity.textContent   = `${main.humidity}%`;
  windSpeed.textContent  = `${(wind.speed * 3.6).toFixed(1)} km/h`; // m/s → km/h
  pressure.textContent   = `${main.pressure} hPa`;
  visibility.textContent = vis ? `${(vis / 1000).toFixed(1)} km` : 'N/A';
  cloudCover.textContent = `${clouds.all}%`;

  // Weather icon
  weatherIcon.src = iconURL(w.icon);
  weatherIcon.alt = w.description;
}

/* ══════════════════════════════════════════════════════
   RENDER 5-DAY FORECAST
══════════════════════════════════════════════════════ */

/**
 * Condense 3-hour forecast slots into one entry per day
 * (takes the midday slot or first available per day).
 *
 * @param {Array} list - Array of 3-hour forecast objects
 * @returns {Array}    - Up to 5 daily summary objects
 */
function buildDailyForecast(list) {
  const days = {};

  list.forEach(item => {
    const dateKey = item.dt_txt.split(' ')[0]; // 'YYYY-MM-DD'

    // Skip today
    const today = new Date().toISOString().split('T')[0];
    if (dateKey === today) return;

    if (!days[dateKey]) {
      days[dateKey] = { items: [] };
    }
    days[dateKey].items.push(item);
  });

  // Pick representative item per day (prefer 12:00 UTC slot)
  return Object.entries(days).slice(0, 5).map(([date, { items }]) => {
    const noon = items.find(i => i.dt_txt.includes('12:00:00')) || items[0];
    const temps = items.map(i => i.main.temp);
    return {
      date,
      icon:    noon.weather[0].icon,
      desc:    noon.weather[0].description,
      high:    Math.round(Math.max(...temps)),
      low:     Math.round(Math.min(...temps)),
      dayName: shortDay(noon.dt_txt),
    };
  });
}

/**
 * Render forecast cards into the forecast grid.
 * @param {Array} list - Raw 3-hour list from /forecast endpoint
 */
function renderForecast(list) {
  const daily = buildDailyForecast(list);
  forecastGrid.innerHTML = '';

  daily.forEach((day, i) => {
    const card = document.createElement('div');
    card.className = 'forecast-card glass-card';
    // Stagger entrance animation
    card.style.animationDelay = `${i * 0.08}s`;
    card.style.animation = `fadeUp 0.4s var(--ease-out) both`;

    card.innerHTML = `
      <p class="forecast-day">${day.dayName}</p>
      <img class="forecast-icon" src="${iconURL(day.icon)}" alt="${day.desc}" loading="lazy" />
      <p class="forecast-temp-high">${day.high}°</p>
      <p class="forecast-temp-low">${day.low}°</p>
      <p class="forecast-desc">${day.desc}</p>
    `;

    forecastGrid.appendChild(card);
  });
}

/* ══════════════════════════════════════════════════════
   API FETCH FUNCTIONS
══════════════════════════════════════════════════════ */

/**
 * Check if the API key looks like it's still the placeholder.
 */
function isKeyMissing() {
  return !API_KEY || API_KEY === 'YOUR_API_KEY_HERE';
}

/**
 * Fetch current weather + 5-day forecast by city name.
 * @param {string} city - City name entered by the user
 */
async function fetchWeather(city) {
  if (!city.trim()) return;

  // Guard: missing API key
  if (isKeyMissing()) {
    showError('⚙️ Please add your OpenWeather API key in script.js (line 20).');
    return;
  }

  showLoading();

  try {
    // Parallel fetch: current weather + forecast
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`${BASE_URL}?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`),
      fetch(`${FORECAST_URL}?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`)
    ]);

    // Handle errors (404 = city not found, 401 = bad key, etc.)
    if (!currentRes.ok) {
      if (currentRes.status === 404) throw new Error('City not found. Please check the spelling and try again.');
      if (currentRes.status === 401) throw new Error('Invalid API key. Please check your OpenWeather API key.');
      throw new Error(`Unexpected error (${currentRes.status}). Please try again.`);
    }

    const currentData  = await currentRes.json();
    const forecastData = await forecastRes.json();

    // Render everything
    renderCurrent(currentData);
    renderForecast(forecastData.list);

    // Save to recent searches & refresh chips
    saveRecent(currentData.name);
    renderRecent();

    showWeather();

  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
    console.error('[SkyPulse] Fetch error:', err);
  }
}

/**
 * Fetch weather by coordinates (used by Geolocation API).
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 */
async function fetchWeatherByCoords(lat, lon) {
  if (isKeyMissing()) {
    showError('⚙️ Please add your OpenWeather API key in script.js (line 20).');
    return;
  }

  showLoading();

  try {
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`${BASE_URL}?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`),
      fetch(`${FORECAST_URL}?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`)
    ]);

    if (!currentRes.ok) throw new Error(`Error ${currentRes.status}: Unable to fetch weather.`);

    const currentData  = await currentRes.json();
    const forecastData = await forecastRes.json();

    // Pre-fill the input with the detected city name
    cityInput.value = currentData.name;

    renderCurrent(currentData);
    renderForecast(forecastData.list);
    saveRecent(currentData.name);
    renderRecent();
    showWeather();

  } catch (err) {
    showError(err.message || 'Could not get location weather. Please try again.');
    console.error('[SkyPulse] Coords fetch error:', err);
  }
}

/* ══════════════════════════════════════════════════════
   GEOLOCATION (Auto-detect)
══════════════════════════════════════════════════════ */

/**
 * Ask the browser for the user's location, then fetch weather for it.
 * Uses the standard navigator.geolocation API.
 */
function detectLocation() {
  if (!navigator.geolocation) {
    showError('Geolocation is not supported by your browser.');
    return;
  }

  showLoading();

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude);
    },
    (err) => {
      let msg = 'Could not detect location.';
      if (err.code === err.PERMISSION_DENIED) msg = 'Location access denied. Please allow location or search manually.';
      showError(msg);
    },
    { timeout: 10000 } // 10-second timeout
  );
}

locateBtn.addEventListener('click', detectLocation);

/* ══════════════════════════════════════════════════════
   SEARCH EVENT LISTENERS
══════════════════════════════════════════════════════ */

// Click Search button
searchBtn.addEventListener('click', () => {
  fetchWeather(cityInput.value.trim());
});

// Press Enter in the input field
cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchWeather(cityInput.value.trim());
});

window.addEventListener('DOMContentLoaded', () => {
  const recent = getRecent();
  if (recent.length > 0) {
    // Silently pre-load the most recent city
    cityInput.value = recent[0];
    fetchWeather(recent[0]);
  }
});
