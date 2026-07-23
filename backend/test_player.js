require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { Client, GatewayIntentBits } = require('discord.js');
const { Player } = require('discord-player');
const ytdl = require('youtube-dl-exec');
const https = require('https');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

const player = new Player(client, { probeTimeout: 60000 });

player.events.on('playerStart', (queue, track) => console.log('Started:', track.title));
player.events.on('error', (queue, e) => console.error('Error:', e));
player.events.on('playerError', (queue, e) => console.error('PlayerError:', e));
player.events.on('debug', (queue, msg) => console.log('DEBUG:', msg));

client.on('ready', async () => {
  console.log("Ready as", client.user.tag);
  try {
    const channel = client.channels.cache.filter(c => c.isVoiceBased()).first();
    if (!channel) { console.log("No voice channel found"); process.exit(0); }
    
    console.log("Playing in", channel.name);
    
    const url = await ytdl('https://www.youtube.com/watch?v=R-IKO27MNuk', {
        getUrl: true,
        f: 'bestaudio[ext=webm][acodec=opus]/bestaudio[ext=webm]/bestaudio',
        noWarnings: true,
        callHome: false
    });
    console.log("Got stream URL");

    const track = new (require('discord-player').Track)(player, {
      title: "Test",
      url: "https://www.youtube.com/watch?v=R-IKO27MNuk",
      source: "youtube"
    });

    const queue = player.nodes.create(channel.guild, {
      metadata: { channel },
      disableBiquad: true,
      disableVolume: true,
      leaveOnEmpty: true
    });
    await queue.connect(channel);
    
    // Custom stream simulation
    https.get(url, (res) => {
      console.log("Got HTTP response for stream:", res.statusCode);
      // Give it to discord-player
      // Wait, we need to overwrite track extractor so it calls our stream
      const myTrack = track;
      myTrack.extractor = {
        stream: async () => {
          return res; // Return the readable HTTP stream
        }
      };
      
      queue.play(myTrack);
    });
    
  } catch (e) {
    console.error(e);
  }
});

client.login(process.env.DISCORD_TOKEN);
