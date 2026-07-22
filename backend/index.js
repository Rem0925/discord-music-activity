const { Client, GatewayIntentBits } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const client = new Client({
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages ]
});

const player = new Player(client);

async function loadExtractors() {
  await player.extractors.loadMulti(DefaultExtractors);
  console.log('✅ Extractores de música cargados');
}
loadExtractors();

// Funciones para emitir la cola actualizada al Frontend
function emitQueue(queue) {
  if (!queue) return;
  const tracks = queue.tracks.toArray().map(t => ({ title: t.title, author: t.author, thumbnail: t.thumbnail }));
  const current = queue.currentTrack ? { title: queue.currentTrack.title, author: queue.currentTrack.author, thumbnail: queue.currentTrack.thumbnail } : null;
  io.emit('queue_update', { current, tracks });

  // Buscar letras asíncronamente si hay una canción sonando (API Nueva)
  if (current) {
    player.lyrics.search({ q: `${current.title} ${current.author}` }).then(res => {
      if (res && res.length > 0) {
        const lyricsText = res[0].plainLyrics || res[0].lyrics || res[0].syncedLyrics;
        io.emit('song_lyrics', lyricsText || null);
      } else if (res && (res.plainLyrics || res.lyrics)) {
        io.emit('song_lyrics', res.plainLyrics || res.lyrics || null);
      } else {
        io.emit('song_lyrics', null);
      }
    }).catch((e) => {
      console.error("Letras no encontradas:", e.message);
      io.emit('song_lyrics', null);
    });
  } else {
    io.emit('song_lyrics', null);
  }
}

player.events.on('playerStart', (queue, track) => emitQueue(queue));
player.events.on('audioTrackAdd', (queue, track) => emitQueue(queue));
player.events.on('audioTrackRemove', (queue) => emitQueue(queue));
player.events.on('emptyQueue', (queue) => io.emit('queue_update', { current: null, tracks: [] }));

io.on('connection', (socket) => {
  socket.on('play_song', async (data) => {
    const { query, guildId, channelId } = data;
    if (!guildId || !channelId) return;

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) return;
      
      await player.play(channel, query, {
        nodeOptions: { 
          metadata: { channel: channel }, 
          volume: 80, 
          leaveOnEmpty: true,
          bufferingTimeout: 5000, // Dar 5 segundos de colchón a la descarga para los microcortes
          disableBiquad: true // Esto desactiva el procesamiento pesado de audio, eliminando casi todos los microcortes de CPU
        }
      });
    } catch (e) {
      console.error(e);
    }
  });

  socket.on('skip_song', (data) => {
    const queue = player.nodes.get(data.guildId);
    if (queue) queue.node.skip();
  });

  socket.on('get_queue', (data) => {
    if (!data.guildId) return;
    const queue = player.nodes.get(data.guildId);
    if (queue) {
      const tracks = queue.tracks.toArray().map(t => ({ title: t.title, author: t.author, thumbnail: t.thumbnail }));
      const current = queue.currentTrack ? { title: queue.currentTrack.title, author: queue.currentTrack.author, thumbnail: queue.currentTrack.thumbnail } : null;
      socket.emit('queue_update', { current, tracks });
    }
  });

  socket.on('search_song', async (data) => {
    if (!data.query) return;
    // Si pegan un link, no hacemos autocompletado, simplemente esperamos a que le den Play
    if (data.query.startsWith('http')) {
      return socket.emit('search_results', []);
    }
    
    try {
      const results = await player.search(data.query, { searchEngine: 'youtubeSearch' });
      const tracks = results.tracks.slice(0, 5).map(t => ({ title: t.title, author: t.author, url: t.url }));
      socket.emit('search_results', tracks);
    } catch (e) {
      console.error("Error buscando:", e);
    }
  });
});

client.once('clientReady', () => {
  console.log(`🤖 Bot iniciado correctamente como ${client.user.tag}`);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🌐 Servidor API y WebSockets en el puerto ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
