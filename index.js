require('dotenv').config();
const { Client } = require('pg');
const cryptoNewsApiToken = process.env.CRYPTO_NEWS_API_TOKEN;

const client = new Client({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

async function fetchAndInsertNews(page = 1) {
  try {
    await client.connect();
    const res = await fetch(
      `https://cryptonews-api.com/api/v1?tickers=BTC,ETH,XRP&items=3&page=${page}&token=${cryptoNewsApiToken}`
    );
    const { data } = await res.json();
    console.log(data); // Log fetched data

    const news = await Promise.allSettled(
      data?.map(async (item) => {
        const findExisting = await client.query(
          `SELECT * FROM news WHERE news_url = $1`,
          [item.news_url]
        );
        if (!findExisting.rows.length) {
          const insertQuery = `
          INSERT INTO news (title, content, image_url, news_url, tickers)
          VALUES ($1, $2, $3, $4, $5)
        `;
          await client.query(insertQuery, [
            item.title,
            item.text,
            item.image_url,
            item.news_url,
            item.tickers,
          ]);
          return item;
        }
      })
    );

    const newNewsList = news.filter((x) => x.value !== undefined);
    console.log(newNewsList, 'newNewsList');

    // If newNewsList is empty, call the function recursively with the next page
    if (newNewsList.length === 0) {
      console.log(`No new news found on page ${page}. Fetching next page...`);
      return fetchAndInsertNews(page + 1); // Increment the page and call recursively
    }

    return await client.end();
  } catch (error) {
    console.log(error.message);
    await client.end(); // Ensure the client is closed on error
  }
}

fetchAndInsertNews(); // Start fetching news from page 1