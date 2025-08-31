// Import necessary libraries
const express = require('express');
const axios = require('axios');
const path = require('path');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// --- Security Middleware ---
// Use Helmet to set various security-related HTTP headers
app.use(helmet());

// Serve the static 'index.html' file from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// The main endpoint for handling embed generation
app.get('/embed/:tweetId', async (req, res) => {
    const { tweetId } = req.params;
    const bearerToken = process.env.TWITTER_BEARER_TOKEN;

    if (!bearerToken) {
        return res.status(500).send("Server configuration error: Missing Twitter API Bearer Token.");
    }

    if (!/^\d+$/.test(tweetId)) {
        return res.status(400).send("Invalid Tweet ID format.");
    }
    
    // The URL for the Twitter API v2 endpoint
    const apiUrl = `https://api.twitter.com/2/tweets/${tweetId}`;
    
    // Define the parameters and expansions we need
    const params = {
        "expansions": "author_id,attachments.media_keys",
        "tweet.fields": "text",
        "user.fields": "name,username,profile_image_url",
        "media.fields": "variants,preview_image_url,width,height"
    };

    try {
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Bearer ${bearerToken}`
            },
            params: params
        });

        const tweetData = response.data.data;
        const includes = response.data.includes;

        if (!tweetData || !includes || !includes.media) {
            return res.status(404).send("Could not find a video in this Tweet.");
        }
        
        const author = includes.users[0];
        const media = includes.media.find(m => m.type === 'video');

        if (!media || !media.variants) {
            return res.status(404).send("This Tweet does not contain a processable video.");
        }

        // Find the best quality MP4 video variant
        const videoVariant = media.variants
            .filter(v => v.content_type === 'video/mp4')
            .sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0))[0];

        if (!videoVariant) {
             return res.status(404).send("No MP4 video variant found for this Tweet.");
        }

        // --- Generate the HTML with Meta Tags ---
        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Tweet by ${author.name}</title>

                <!-- Open Graph / General -->
                <meta property="og:title" content="${author.name} (@${author.username})">
                <meta property="og:description" content="${tweetData.text.replace(/"/g, '&quot;')}">
                <meta property="og:image" content="${media.preview_image_url}">
                
                <!-- Twitter Card -->
                <meta name="twitter:card" content="player">
                <meta name="twitter:title" content="${author.name} (@${author.username})">
                <meta name="twitter:description" content="${tweetData.text.replace(/"/g, '&quot;')}">
                <meta name="twitter:image" content="${media.preview_image_url}">
                <meta name="twitter:player" content="${videoVariant.url}">
                <meta name="twitter:player:width" content="${media.width}">
                <meta name="twitter:player:height" content="${media.height}">
                
                <!-- Video Specific Meta Tags for Discord/Telegram -->
                <meta property="og:video" content="${videoVariant.url}">
                <meta property="og:video:secure_url" content="${videoVariant.url}">
                <meta property="og:video:type" content="video/mp4">
                <meta property="og:video:width" content="${media.width}">
                <meta property="og:video:height" content="${media.height}">
                
                <!-- Redirect for users who click the link -->
                <meta http-equiv="refresh" content="0; url=https://twitter.com/${author.username}/status/${tweetId}">
            </head>
            <body>
                <p>Redirecting you to the tweet...</p>
            </body>
            </html>
        `;

        res.send(html);

    } catch (error) {
        console.error("Error fetching from Twitter API:", error.response ? error.response.data : error.message);
        res.status(500).send("Failed to fetch Tweet data from the API.");
    }
});

// Fallback to serve index.html for any other route, useful for single-page apps
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

