// src/core/handlers/news-handler.js
const fs = require('fs');
const { CREDENTIALS_PATH } = require('../../utils/paths');
const TreeReporter = require('../../utils/tree-reporter');

const newsHandlers = {
  /**
   * Fetch news articles using NewsAPI
   * Uses user's location (IP-based) to get regional news for a topic
   * @param {Object} params { topic, location }
   */
  get_news: async (params) => {
    // Support both 'topic' and 'query' parameter names
    let { topic, location } = params;
    if (!topic && params.query) topic = params.query;

    // Known country names to detect - these should be treated as location, not topic
    const countryNames = {
      'us': 'US', 'usa': 'US', 'united states': 'US', 'united states of america': 'US',
      'uk': 'GB', 'united kingdom': 'GB', 'great britain': 'GB', 'britain': 'GB',
      'india': 'IN', 'canada': 'CA', 'australia': 'AU',
      'germany': 'DE', 'france': 'FR', 'japan': 'JP', 'china': 'CN',
      'my location': 'IP', 'me': 'IP', 'local': 'IP'
    };

    // If topic is missing but location looks like a country name, swap them
    if (!topic && location && countryNames[location.toLowerCase()]) {
      topic = 'general'; // Use general headlines for country requests
    } else if (!topic && location) {
      // Check if location looks like a country name
      const normalizedLoc = location.toLowerCase();
      if (countryNames[normalizedLoc]) {
        topic = 'general';
      } else {
        // Treat as topic
        topic = location;
        location = 'IP'; // Will trigger IP detection
      }
    }

    // Load API Key
    let apiKey;
    try {
      const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
      apiKey = creds.newsapi?.api_key;
    } catch (e) {
      return { success: false, message: 'Could not read credentials.json or NewsAPI key is missing.' };
    }

    if (!apiKey) {
      return { success: false, message: 'NewsAPI key not found in credentials.json.' };
    }

    const tree = new TreeReporter('NewsAPI', topic || 'Top Headlines');

    try {
      // 1. Detect user location via IP if not provided
      let countryCode = 'US';
      if (!location || location === 'IP' || location.toLowerCase().includes('my location') || location.toLowerCase() === 'me') {
        tree.branch('Location Discovery', 'Detecting via IP');
        try {
          const ipRes = await fetch('http://ip-api.com/json');
          const ipData = await ipRes.json();
          if (ipData && ipData.status === 'success') {
            location = ipData.country;
            countryCode = ipData.countryCode || 'US';
            tree.leaf('Region', `${ipData.city}, ${ipData.regionName}, ${ipData.country}`);
            tree.leaf('Country Code', countryCode);
          } else {
            location = 'US';
            tree.leaf('Fallback', 'Using US as default region');
          }
        } catch (e) {
          location = 'US';
          countryCode = 'US';
          tree.leaf('Discovery Failed', 'Using US as default region');
        }
      } else {
        // Map common country names to codes for NewsAPI
        const countryMap = {
          'india': 'IN', 'usa': 'US', 'united states': 'US', 'uk': 'GB',
          'united kingdom': 'GB', 'canada': 'CA', 'australia': 'AU',
          'germany': 'DE', 'france': 'FR', 'japan': 'JP', 'china': 'CN'
        };
        countryCode = countryMap[location.toLowerCase()] || 'US';
      }

      // 2. Sanitize topic input
      if (topic) {
        const original = topic;
        topic = topic.replace(/^(news about|news on|what is the news|latest news|news|headlines about|headlines on)\s+/gi, '')
                     .trim();
        if (original !== topic) tree.leaf('Sanitized Topic', topic);
      }

      // 3. Build the API URL
      // NewsAPI supports: everything (search) or top-headlines
      // Using /everything for topic-based search with country context
      let newsUrl;
      let responseData;

      if (topic && topic.trim() !== '') {
        // Search news by topic using /everything for comprehensive results
        const query = encodeURIComponent(topic);
        newsUrl = `https://newsapi.org/v2/everything?q=${query}&sortBy=publishedAt&pageSize=10&apiKey=${apiKey}`;
        tree.branch('Searching News', `"${topic}"`);
      } else {
        // Top headlines by country
        newsUrl = `https://newsapi.org/v2/top-headlines?country=${countryCode}&pageSize=10&apiKey=${apiKey}`;
        tree.branch('Top Headlines', countryCode);
      }

      const newsRes = await fetch(newsUrl);
      responseData = await newsRes.json();

      if (responseData.status === 'error') {
        tree.complete('NewsAPI Error');
        return { success: false, message: `NewsAPI Error: ${responseData.message}` };
      }

      if (!responseData.articles || responseData.articles.length === 0) {
        tree.complete('No Results');
        return { success: true, message: tree.toString() + '\nNo news articles found for your query.' };
      }

      // 4. Format articles into tree report
      tree.branch('Results', `${responseData.totalResults || responseData.articles.length} articles found`);

      // Sort by date (most recent first) and limit to 5 best articles
      const sortedArticles = [...responseData.articles]
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
        .slice(0, 5);

      sortedArticles.forEach((article, index) => {
        const title = article.title || 'No Title';
        const source = article.source?.name || 'Unknown Source';
        const publishedAt = article.publishedAt ? new Date(article.publishedAt).toLocaleString() : 'No Date';
        const description = article.description ? article.description.substring(0, 120) + '...' : 'No description';
        const url = article.url || '';

        tree.leaf(
          `[${index + 1}] ${source}`,
          `${title}\n   ${description}\n   ${publishedAt}${url ? ` | ${url}` : ''}`
        );
      });

      tree.complete('News retrieved successfully');
      return { success: true, message: tree.toString() };

    } catch (err) {
      return { success: false, message: `News Service Error: ${err.message}` };
    }
  }
};

module.exports = newsHandlers;
