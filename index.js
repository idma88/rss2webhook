const fs = require("fs");
const request = require("request");
const rssParser = new (require("rss-parser"))();
const htmlParser = require("node-html-parser");
const md5 = require("md5");

const feedsFilename = "feeds.json";
const hashesFilename = "hashes.json";
const UpdateTimeout = process.env.RSS_UPDATE_TIMEOUT || 60 * 1000;

function LoadFeeds() {
    return JSON.parse(fs.readFileSync(feedsFilename, "utf8"));
}

function LoadHashes() {
    try {
        return JSON.parse(fs.readFileSync(hashesFilename, "utf8")) || {};
    } catch (error) {
        return {};
    }
}

function SaveHashes(hashes) {
    return fs.writeFileSync(hashesFilename, JSON.stringify(hashes), "utf8");
}

async function GetLastEntry(feedItem) {
    let feed = await rssParser.parseURL(feedItem.url);

    let lastEntry = feed.items.reduce((acc, current) => {
        let curDate = Date.parse(current.pubDate);
        return curDate > acc ? curDate : acc;
    }, feed.items[0]);

    let entryTitle = lastEntry.title || "";
    let entryUrl = lastEntry.link || "";
    let entryAuthor = lastEntry.creator | "";
    let entryContent = lastEntry.content | "";
    let entryPublished = lastEntry.pubDate | "";

    let entryImageUrl;
    try {
        entryImageUrl = lastEntry.enclosure.url;
    } catch (error) { }

    if (!entryImageUrl) {
        try {
            entryImageUrl = htmlParser
                .parse(lastEntry.content)
                .querySelector("img")
                .getAttribute("src");
        } catch (error) {
            entryImageUrl = "";
        }
    }

    return {
        EntryTitle: entryTitle,
        EntryUrl: entryUrl,
        EntryAuthor: entryAuthor,
        EntryContent: entryContent,
        EntryPublished: entryPublished,
        EntryImageUrl: entryImageUrl
    };
}

async function SendWebhook(webhookOptions, Entry) {
    let webhookBody = webhookOptions.template;

    for (const key in Entry) {
        if (Entry.hasOwnProperty(key))
            webhookBody = webhookBody.replace("{{" + key + "}}", Entry[key]);
    }

    request.post({
        headers: { "content-type": "application/json" },
        url: webhookOptions.url,
        body: webhookBody
    });
}

async function ProcessAllFeeds(feeds, hashes) {
    for (let index = 0; index < feeds.length; index++) {
        let feedItem = feeds[index];
        let entry = await GetLastEntry(feedItem);

        let feedHash = md5(feedItem.url);
        let entryHash = entry.EntryUrl;

        if (hashes[feedHash] !== entryHash) {
            SendWebhook(feedItem.webhook, entry);
            hashes[feedHash] = entryHash;
        }
    }

    SaveHashes(hashes);
}

// Entry point
(async () => {
    let feeds = LoadFeeds();
    let hashes = LoadHashes();

    await ProcessAllFeeds(feeds, hashes); // Force first check
    let timerId = setInterval(
        async () => await ProcessAllFeeds(feeds, hashes),
        UpdateTimeout
    );
})();
