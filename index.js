require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { TwitterApi } = require('twitter-api-v2');

const cryptoNewsApiToken = process.env.CRYPTO_NEWS_API_TOKEN;

// Postgres database
const pgClient = new Client({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

// Twitter client
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// Main function with recursive tracking
async function fetchAndInsertNews(page = 1, attempts = 0) {
  try {
    await pgClient.connect();

    // Use the alternate URL after 3 failed recursive attempts
    const url =
      attempts < 3
        ? `https://cryptonews-api.com/api/v1?tickers=BTC,ETH,XRP,SOL&items=3&page=${page}&token=${cryptoNewsApiToken}`
        : `https://cryptonews-api.com/api/v1/category?section=general&items=3&page=1&token=${cryptoNewsApiToken}`;

    const res = await fetch(url);
    const { data } = await res.json();

    const news = await Promise.allSettled(
      data?.map(async (item) => {
        const findExisting = await pgClient.query(
          `SELECT * FROM news WHERE news_url = $1`,
          [item.news_url]
        );
        if (!findExisting.rows.length) {
          const insertQuery = `
          INSERT INTO news (title, content, image_url, news_url, tickers)
          VALUES ($1, $2, $3, $4, $5)
        `;
          await pgClient.query(insertQuery, [
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
    if (newNewsList.length !== 3) {
      console.log(`No new news found on page ${page}. Fetching next page...`);

      // Increment the recursion attempts counter
      return fetchAndInsertNews(page + 1, attempts + 1); // Increment the page and attempts
    } else {
      // Post to Twitter
      await Promise.allSettled(
        newNewsList.map(async (item) => {
          const result = await postTweet(item.value);
          console.log(result, 'result');
        })
      );
    }

    return await pgClient.end();
  } catch (error) {
    console.log(error.message);
    await pgClient.end(); // Ensure the pgClient is closed on error
  }
}

async function postTweet(dataToPost) {
  const tweetText = trimTweet(dataToPost.text);
  const imageUrl = dataToPost.image_url; // Replace with your image URL
  const imagesDir = path.join(__dirname, '..', 'images');
  fs.mkdirSync(imagesDir, { recursive: true });
  const localPath = path.join(imagesDir, 'image.jpg');

  // Download the image
  try {
    await downloadImage(imageUrl, localPath);
  } catch (error) {
    throw new Error('Error downloading the image.' + error.message);
  }

  // Post the tweet and media
  const mediaId = await twitterClient.v1.uploadMedia(
    path.join(__dirname, '../images/image.jpg')
  );

  // Delete the image
  await deleteImage();

  // Post the tweet
  let result = await twitterClient.v2.tweetThread([
    {
      text: `${tweetText} \n ${dataToPost.news_url}`,
      media: { media_ids: [mediaId] },
    },
  ]);

  return result;
}

async function downloadImage(url, localPath) {
  const writer = fs.createWriteStream(localPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function deleteImage() {
  const imagesDir = path.join(__dirname, '../images/image.jpg');
  if (fs.existsSync(imagesDir)) {
    fs.unlinkSync(imagesDir);
  }
}

function trimTweet(text) {
  if (text.length > 279) {
    return text.substring(0, 279 - 3) + '...';
  } else {
    return text;
  }
}

fetchAndInsertNews(); // Start fetching news from page 1
