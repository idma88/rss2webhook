require('dotenv').config()
const DISCORD_TOKEN  = process.env.DISCORD_TOKEN;
const UPDATE_TIMEOUT = process.env.RSS_UPDATE_TIMEOUT || 60 * 1000;
const RSS_DEBUG      = (process.env.RSS_DEBUG || 'false').toLowerCase() === 'true';

const Discord     = require("discord.js");
const Client      = new Discord.Client();
const MD5         = require("md5");
const Webhook     = require("./src/webhook")(Client);
const FeedStorage = require("./src/storage")();

async function ProcessAllFeeds(feeds, hashes) {
    if (RSS_DEBUG) console.info('ProcessAllFeeds');
    
    for (let index = 0; index < feeds.length; index++) {
        let feedItem = feeds[index];
        let entry = await FeedStorage.GetLastEntry(feedItem);

        let feedHash = MD5(feedItem.url);
        let entryHash = entry.EntryUrl;

        if (/*RSS_DEBUG ||*/ hashes[feedHash] !== entryHash) {
            Webhook.Send(feedHash, feedItem.destinations, feedItem.template, entry);
            hashes[feedHash] = entryHash;
        }
    }

    FeedStorage.Hashes = hashes;
}


Client.login(DISCORD_TOKEN);

Client.on("ready", async () => {
    console.log("----------------------------------------------------");
    console.log("I'm online.");

    let feeds = FeedStorage.Feeds;
    let hashes = FeedStorage.Hashes;

    await Webhook.Init(feeds);
    await ProcessAllFeeds(feeds, hashes); // Force first check
    let timerId = setInterval(
        async () => await ProcessAllFeeds(feeds, hashes),
        UPDATE_TIMEOUT
    );
});
