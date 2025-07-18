const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { createClient } = require('redis');
const { nanoid } = require('nanoid');
const geoip = require('geoip-lite');
const { log } = require('../Logging Middleware/logger');

const MONGO_URI = "mongodb+srv://chintu28rn:sAfJPKfMUStRlkei@cluster0.sxujwf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const REDIS_PASSWORD = "gz9KImECIeGOrlF1sJ7TocYtBLD2qOSn";
const REDIS_HOST = "redis-19010.c256.us-east-1-2.ec2.redns.redis-cloud.com";
const REDIS_PORT = "19010";

const app = express();
app.use(express.json());

const REDIS_URL = `redis://default:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`;

const mongoClient = new MongoClient(MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const redisClient = createClient({ url: REDIS_URL });

let urlCollection;

async function connectDB() {
    try {
        await mongoClient.connect();
        const db = mongoClient.db('urlShortener');
        urlCollection = db.collection('urls');
        console.log('Connected to MongoDB');
        log('info', 'db', 'Successfully connected to MongoDB');

        redisClient.on('error', (err) => {
            console.log('Redis Error', err);
            log('fatal', 'db', 'Redis connection error');
        });
        await redisClient.connect();
        console.log('Connected to Redis');
        log('info', 'db', 'Successfully connected to Redis');
    } catch (err) {
        console.error("Failed to connect to databases", err);
        log('fatal', 'db', `Failed to connect to databases: ${err.message}`);
        process.exit(1);
    }
}

app.post('/shorturls', async (req, res) => {
    const { url, validity, shortcode: customShortcode } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const shortcode = customShortcode || nanoid(7);
    const existing = await urlCollection.findOne({ shortcode });
    if (existing) return res.status(409).json({ error: 'Shortcode is already in use.' });
    const validityMinutes = parseInt(validity) || 30;
    const expiresAt = new Date(Date.now() + validityMinutes * 60 * 1000);
    const newUrl = { shortcode, originalUrl: url, createdAt: new Date(), expiresAt, totalClicks: 0, clickDetails: [] };
    await urlCollection.insertOne(newUrl);
    await redisClient.set(shortcode, url, { EX: validityMinutes * 60 });
    log('info', 'db', `Successfully created shortcode: ${shortcode}`);
    res.status(201).json({ shortLink: `http://localhost:3000/${shortcode}`, expiry: expiresAt.toISOString() });
});

app.get('/:shortcode', async (req, res) => {
    const { shortcode } = req.params;
    const originalUrl = await redisClient.get(shortcode);
    if (originalUrl) {
        res.redirect(302, originalUrl);
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const geo = geoip.lookup(ip);
        urlCollection.updateOne({ shortcode }, { $inc: { totalClicks: 1 }, $push: { clickDetails: { timestamp: new Date(), referrer: req.get('Referrer') || 'Direct', geoLocation: geo ? `${geo.city}, ${geo.country}` : 'Unknown' } } });
    } else {
        res.status(404).json({ error: 'Link not found or has expired.' });
    }
});

app.get('/shorturls/:shortcode', async (req, res) => {
    const { shortcode } = req.params;
    const stats = await urlCollection.findOne({ shortcode });
    if (stats) {
        res.status(200).json({ total_clicks: stats.totalClicks, original_url: stats.originalUrl, creation_date: stats.createdAt, expiry_date: stats.expiresAt, click_details: stats.clickDetails });
    } else {
        res.status(404).json({ error: 'Statistics not found for this shortcode.' });
    }
});

connectDB().then(() => {
    app.listen(3000, () => {
        console.log('Server running on http://localhost:3000');
        log('info', 'handler', 'Server started successfully on port 3000');
    });
});
