const RSS_DEBUG = (process.env.RSS_DEBUG || 'false').toLowerCase() === 'true';

const FS = require("fs");
const PATH = require("path");
const rssParser = new (require("rss-parser"))();
const htmlParser = require("node-html-parser");

const feedsFilename = PATH.resolve(__dirname, "../config/feeds.json");
const hashesFilename = PATH.resolve(__dirname, "../cache/hashes.json");

class FeedStorage {
    constructor() {
        this.__LoadFeeds();
        this.__LoadHashes();

        FS.watchFile(feedsFilename, (curr, prev) => this.__LoadFeeds());
    }

    get Feeds() {
        return this.feeds;
    }

    get Hashes() {
        return this.hashes;
    }

    set Hashes(hashes) {
        return FS.writeFileSync(hashesFilename, JSON.stringify(hashes), "utf8");
    }

    __LoadFeeds() {
        this.feeds = JSON.parse(FS.readFileSync(feedsFilename, "utf8"));
    }

    __LoadHashes() {
        try {
            this.hashes = JSON.parse(FS.readFileSync(hashesFilename, "utf8")) || {};
        } catch (error) {
            this.hashes = {};
        }
    }

    async GetLastEntry(feedItem) {
        if (RSS_DEBUG) console.info('FeedStorage.GetLastEntry');

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
}

let storageInstance;

module.exports = () => {
    if (!storageInstance) storageInstance = new FeedStorage();
    return storageInstance;
}; 