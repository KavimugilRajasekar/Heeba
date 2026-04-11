// src/core/handlers/weather-handler.js
const fs = require('fs');
const { CREDENTIALS_PATH } = require('../../utils/paths');
const TreeReporter = require('../../utils/tree-reporter');

const weatherHandlers = {
  /**
   * Fetch weather data using OpenWeather APIs
   * Tries One Call 3.0 first, falls back to 2.5 if subscription missing
   * @param {Object} params { location, lat, lon, units }
   */
  get_weather: async (params) => {
    let { location, lat, lon, units = 'metric' } = params;

    // Load API Key
    let apiKey;
    try {
      const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
      apiKey = creds.openweather?.api_key || creds.weather?.api_key;
    } catch (e) {
      return { success: false, message: 'Could not read credentials.json or weather API key is missing.' };
    }

    if (!apiKey) {
      return { success: false, message: 'OpenWeather API key not found in credentials.json.' };
    }

    const tree = new TreeReporter('Weather Service', location || (lat ? `${lat}, ${lon}` : 'Loading...'));
    const tempUnit = units === 'imperial' ? '°F' : (units === 'metric' ? '°C' : 'K');
    const speedUnit = units === 'imperial' ? 'mph' : 'm/s';

    try {
      // 1. Geocoding / Location Resolution
      if (!location && !lat && !lon) {
        location = 'my location';
      }

      if (location && (location.toLowerCase().includes('my location') || location.toLowerCase() === 'me')) {
        tree.branch('Location Discovery', 'Detecting via IP');
        try {
          const ipRes = await fetch('http://ip-api.com/json');
          const ipData = await ipRes.json();
          if (ipData && ipData.status === 'success') {
            location = `${ipData.city}, ${ipData.country}`;
            lat = ipData.lat;
            lon = ipData.lon;
            tree.leaf('Region', `${ipData.city}, ${ipData.regionName}, ${ipData.country}`);
            tree.leaf('Coordinates', `${lat}, ${lon} (IP-based)`);
          }
        } catch (e) {
          tree.leaf('Discovery', 'Failed, using default metadata');
        }
      }

      if (location && (!lat || !lon)) {
        tree.branch('Geocoding', location);
        const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`;
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();

        if (!geoData || geoData.length === 0) {
          return { success: false, message: `Could not find location: ${location}` };
        }

        lat = geoData[0].lat;
        lon = geoData[0].lon;
        const placeName = geoData[0].state ? `${geoData[0].name}, ${geoData[0].state}, ${geoData[0].country}` : `${geoData[0].name}, ${geoData[0].country}`;
        tree.leaf('Resolved', placeName);
      }

      if (!lat || !lon) {
        return { success: false, message: 'Latitude and Longitude are required if location name is missing.' };
      }

      // 2. Try One Call API 3.0
      const weatherUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&units=${units}&appid=${apiKey}`;
      const weatherRes = await fetch(weatherUrl);
      const data = await weatherRes.json();

      if (data.cod && (data.cod === 401 || data.cod === 404 || data.cod === '401')) {
        // Fallback to 2.5 Current + Forecast if 3.0 fails (common for free/standard tiers)
        tree.branch('Status', 'Using standard weather fallback');
        
        // Current Weather 2.5
        const curRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${apiKey}`);
        const curData = await curRes.json();
        
        if (curData.cod && curData.cod !== 200) {
           return { success: false, message: `OpenWeather API Error: ${curData.message || 'Access Denied'}` };
        }

        tree.branch('Current Conditions', `${curData.main.temp}${tempUnit}, ${curData.weather[0].description}`)
            .leaf('Feels Like', `${curData.main.feels_like}${tempUnit}`)
            .leaf('Humidity', `${curData.main.humidity}%`)
            .leaf('Wind', `${curData.wind.speed} ${speedUnit}`);

        // Forecast 2.5 (5-day/3-hour)
        const forRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${apiKey}`);
        const forData = await forRes.json();

        if (forData.cod === '200' || forData.cod === 200) {
          tree.branch('Forecast (Next 3 Days)');
          // Aggregate 3-hour chunks into daily summaries (simplified)
          const days = {};
          forData.list.forEach(item => {
            const date = item.dt_txt.split(' ')[0];
            if (!days[date] && Object.keys(days).length < 3) {
              const dateObj = new Date(item.dt * 1000).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
              days[date] = { date: dateObj, temp: item.main.temp, main: item.weather[0].main };
            }
          });
          Object.values(days).forEach(d => {
            tree.leaf(d.date, `${d.temp}${tempUnit}, ${d.main}`);
          });
        }

        tree.complete('Weather data retrieved (standard tier)');
        return { success: true, message: tree.toString() };
      }

      // If One Call 3.0 worked
      const current = data.current;
      tree.branch('Current Conditions', `${current.temp}${tempUnit}, ${current.weather[0].description}`)
          .leaf('Feels Like', `${current.feels_like}${tempUnit}`)
          .leaf('Humidity', `${current.humidity}%`)
          .leaf('UV Index', current.uvi);

      if (data.alerts && data.alerts.length > 0) {
        tree.branch('⚠️ Alerts', data.alerts[0].event);
      }

      if (data.daily) {
        tree.branch('Forecast (Next 3 Days)');
        for (let i = 1; i <= 3; i++) {
          const day = data.daily[i];
          const date = new Date(day.dt * 1000).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
          tree.leaf(date, `${day.temp.day}${tempUnit}, ${day.weather[0].main}`);
        }
      }

      tree.complete('Weather data retrieved (One Call 3.0)');
      return { success: true, message: tree.toString() };

    } catch (err) {
      return { success: false, message: `Weather Service Error: ${err.message}` };
    }
  }
};

module.exports = weatherHandlers;
