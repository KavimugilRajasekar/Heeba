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

      // Input Sanitization: Strip common fillers often passed by LLMs
      if (location && location.toLowerCase() !== 'my location') {
        const original = location;
        location = location.replace(/^(what is|current|weather|in|my|location|currently|the|at)\s+/gi, '')
                        .replace(/\s+(in|at|location|currently|now)$/gi, '')
                        .trim();
        if (location !== original) tree.leaf('Sanitized Input', location);
        
        // If sanitization emptied it or left "my", default back
        if (!location || location.toLowerCase() === 'my') location = 'my location';
      }

      const detectViaIP = async () => {
        tree.branch('Location Discovery', 'Detecting via IP');
        try {
          const ipRes = await fetch('http://ip-api.com/json');
          const ipData = await ipRes.json();
          if (ipData && ipData.status === 'success') {
            lat = ipData.lat;
            lon = ipData.lon;
            const resLoc = `${ipData.city}, ${ipData.country}`;
            tree.leaf('Region', `${ipData.city}, ${ipData.regionName}, ${ipData.country}`);
            tree.leaf('Coordinates', `${lat}, ${lon} (IP-based)`);
            return resLoc;
          }
        } catch (e) {
          tree.leaf('Discovery', 'Failed, using default metadata');
        }
        return null;
      };

      if (location && (location.toLowerCase().includes('my location') || location.toLowerCase() === 'me')) {
        const detected = await detectViaIP();
        if (detected) location = detected;
      }

      if (location && (!lat || !lon)) {
        tree.branch('Geocoding', location);
        
        const performGeo = async (query) => {
          try {
            const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=1&appid=${apiKey}`;
            const geoRes = await fetch(geoUrl);
            return await geoRes.json();
          } catch (e) { return []; }
        };

        let geoData = await performGeo(location);

        // Fallback 1: Try formatting with commas if spaces exist (e.g. "Coimbatore Tamilnadu" -> "Coimbatore, Tamilnadu")
        if ((!geoData || geoData.length === 0) && location.includes(' ') && !location.includes(',')) {
          const commaQuery = location.replace(/\s+/g, ', ');
          const retryData = await performGeo(commaQuery);
          if (retryData && retryData.length > 0) {
            tree.leaf('Retry Success', `Found via: ${commaQuery}`);
            geoData = retryData;
          }
        }

        // Fallback 2: If still failing and multi-word, try first word (City)
        if ((!geoData || geoData.length === 0) && location.includes(' ')) {
          const cityOnly = location.split(/[\s,]+/)[0];
          const retryData = await performGeo(cityOnly);
          if (retryData && retryData.length > 0) {
            tree.leaf('Retry Success', `Found via city: ${cityOnly}`);
            geoData = retryData;
          }
        }

        // Fallback 3: If it's still missing and user asked for "location", try IP anyway
        if ((!geoData || geoData.length === 0) && location.toLowerCase().includes('location')) {
          const detected = await detectViaIP();
          if (detected) {
            location = detected;
            // lat/lon already set by detectViaIP
          }
        }

        if ((!geoData || geoData.length === 0) && (!lat || !lon)) {
          return { success: false, message: `Could not find location: ${location}` };
        }

        if (geoData && geoData.length > 0) {
          lat = geoData[0].lat;
          lon = geoData[0].lon;
          const placeName = geoData[0].state ? `${geoData[0].name}, ${geoData[0].state}, ${geoData[0].country}` : `${geoData[0].name}, ${geoData[0].country}`;
          tree.leaf('Resolved', placeName);
        }
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
