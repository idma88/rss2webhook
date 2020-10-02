const RSS_DEBUG = (process.env.RSS_DEBUG || 'false').toLowerCase() === 'true';

const FS = require("fs");
const PATH = require("path");
const MD5 = require("md5");
const Discord = require("discord.js");
const Axios = require('axios');

const hooksFilename = PATH.join(process.cwd(), "cache/hooks.json");

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class Webhook {
    constructor(client) {
        if (RSS_DEBUG) console.info('Webhook.constructor');

        if (client === undefined) return;
        this.client = client;
    }

    __LoadHooks() {
        if (RSS_DEBUG) console.info('Webhook.__LoadHooks');
        try {
            this.hooks = JSON.parse(FS.readFileSync(hooksFilename, "utf8")) || {};
        } catch (error) {
            this.hooks = {};
        }
    }

    __SaveHooks(hooks) {
        if (RSS_DEBUG) console.info('Webhook.__SaveHooks');
        return FS.writeFileSync(hooksFilename, JSON.stringify(hooks), "utf8");
    }

    async Init(feeds) {
        if (RSS_DEBUG) console.info('Webhooks.Init');

        this.__LoadHooks();

        for (let feedInd = 0; feedInd < feeds.length; ++feedInd) {
            let destinations = feeds[feedInd].destinations;

            for (let destInd = 0; destInd < destinations.length; ++destInd) {
                const destItem = destinations[destInd];

                await this.Create(destItem.guildId, destItem.channelId, MD5(feeds[feedInd].url),
                    feeds[feedInd].avatarUrl, feeds[feedInd].username);
            }
        }
    }

    async Create(guildId, channelId, feedId, avatarUrl, username) {
        if (RSS_DEBUG) console.info('Webhook.Create');

        if (!guildId) return false;
        if (!channelId) return false;

        avatarUrl = avatarUrl || "";
        if (!avatarUrl.length) avatarUrl = this.client.user.avatarURL;

        username = username || "";
        if (!username.length) username = this.client.user.avatarURL;

        let hook = await this.Get(guildId, channelId, feedId);

        if (!hook) {
            let channel = this.__GetChannel(guildId, channelId);
            let options = { avatar: avatarUrl };
            let webhook = await channel.createWebhook(username, options);

            if (webhook) {
                let hookHash = `${feedId}@${guildId}/${channelId}`;
                this.hooks[hookHash] = webhook.id;
                this.__SaveHooks(this.hooks);
            } else {
                console.error(`Failed to create webhook in channel #${channel.id}`)
                return false;
            }
        }

        return true;
    }

    async Get(guildId, channelId, feedId) {
        if (RSS_DEBUG) console.info('Webhook.Get', guildId, channelId, feedId);

        if (!guildId) return false;
        if (!channelId) return false;
        if (!feedId) return false;

        let hookHash = `${feedId}@${guildId}/${channelId}`;
        let hookCachedId;

        if (this.hooks.hasOwnProperty(hookHash)) {
            hookCachedId = this.hooks[hookHash];
        } else {
            console.error(`Failed to get cached hook ID`);
            return false;
        }

        let channel = this.__GetChannel(guildId, channelId)
        if (!channel) {
            console.error(`The specified channel (${channelId}) was not found`);
            return false;
        }

        let channelHooks = await channel.fetchWebhooks();
        if (!channelHooks) {
            console.error(`Failed to get channel webhooks`);
            return false;
        }

        return channelHooks.find(hookItem => (hookItem.owner === this.client.user) && (hookItem.id === hookCachedId));
    }

    async Send(feedId, destinations, template, entry) {
        if (RSS_DEBUG) console.info('Webhook.Send');

        let webhookBody = this.__ProcessTemplate(template, entry);

        for (let index = 0; index < destinations.length; index++) {
            const destItem = destinations[index];

            let webhook = await this.Get(destItem.guildId, destItem.channelId, feedId);

            if (!webhook) {
                console.log('Failed to get webhook');
                continue;
            }

            let content = webhookBody.content || "";
            delete webhookBody.content;

            let postedMessage = await webhook.send(content, webhookBody);

            if (postedMessage.channel.type === 'news') {
                // TODO Поддержка метода crosspost ожидается в ближайших версиях discord.js (> 12.3.1)
                //postedMessage.crosspost().catch(console.error);

                Axios({
                    method: 'post',
                    url: `https://discord.com/api/channels/${postedMessage.channel.id}/messages/${postedMessage.id}/crosspost`,
                    headers: {'Authorization': `Bot ${this.client.token}`}
                }).catch(console.error);
            }

            await sleep(1000);
        }
    }

    __GetChannel(guildId, channelId) {
        if (RSS_DEBUG) console.info('Webhook.__GetChannel');

        if (!guildId) return false;
        if (!channelId) return false;

        let guild = this.client.guilds.cache.find(guild => guild.id === guildId);
        if (!guild) {
            console.error(`The specified guild (${guildId}) was not found`);
            return false;
        }

        return guild.channels.cache.find(channel => channel.id === channelId);
    }

    __ProcessPlaceholders(text, entry) {
        if (RSS_DEBUG) console.info('Webhook.__ProcessPlaceholders');
        if (RSS_DEBUG) console.info(text);

        for (const key in entry) {
            if (entry.hasOwnProperty(key)) text = text.replace("{{" + key + "}}", entry[key]);
        }

        return text;
    }

    __ProcessTemplate(template, entry) {
        if (RSS_DEBUG) console.info('Webhook.__ProcessTemplate');

        if (!template) return {};
        if (!entry) return {};

        const fnPlaceholder = this.__ProcessPlaceholders;
        let ret = {};

        if (template.content) ret.content = fnPlaceholder(template.content, entry);
        if (template.embeds && Array.isArray(template.embeds)) {
            let embeds = template.embeds
                .map((embed, index) => {
                    if (index >= 10) return undefined;

                    let isEmpty = true;
                    let richEmbed = new Discord.MessageEmbed();

                    const props = ['author', 'color', 'description', 'footer', 'image', 'thumbnail', 'timestamp', 'title', 'url'];
                    props.forEach(prop => {
                        if (embed.hasOwnProperty(prop)) {
                            isEmpty = false;

                            switch (prop.toLowerCase()) {
                                case 'author':
                                    richEmbed.setAuthor(fnPlaceholder(embed.author, entry)); break;
                                case 'color':
                                    richEmbed.setColor(fnPlaceholder(embed.color, entry)); break;
                                case 'description':
                                    richEmbed.setDescription(fnPlaceholder(embed.description, entry)); break;
                                case 'footer':
                                    richEmbed.setFooter(fnPlaceholder(embed.footer, entry)); break;
                                case 'image':
                                    richEmbed.setImage(fnPlaceholder(embed.image, entry)); break;
                                case 'thumbnail':
                                    richEmbed.setThumbnail(fnPlaceholder(embed.thumbnail, entry)); break;
                                case 'timestamp':
                                    richEmbed.setTimestamp(fnPlaceholder(embed.timestamp, entry)); break;
                                case 'title':
                                    richEmbed.setTitle(fnPlaceholder(embed.title, entry)); break;
                                case 'url':
                                    richEmbed.setURL(fnPlaceholder(embed.url, entry)); break;
                                default:
                            }
                        }
                    })

                    if (embed.fields && Array.isArray(embed.fields)) {
                        for (let j = 0; j < embed.fields.length; ++j) {
                            const field = embed.fields[j];

                            if (field.name && field.value) {
                                richEmbed.addField(field.name, field.value, !!field.inline);
                                isEmpty = false;
                            }
                        }
                    }

                    return isEmpty ? undefined : richEmbed;
                })
                .filter(item => !!item);

            if (embeds.length) ret.embeds = embeds;
        };

        return ret;
    }
}

let webhooksInstance;

module.exports = (client) => {
    if (!webhooksInstance) webhooksInstance = new Webhook(client);
    return webhooksInstance;
}; 