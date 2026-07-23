const { Client, GatewayIntentBits } = require('discord.js');
const { Player, BaseExtractor, Track } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { search, videoInfo } = require('youtube-ext');
const { spawn } = require('child_process');
const path = require('path');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

class YoutubeDlpExtractor extends BaseExtractor {
    static identifier = "YoutubeDlpExtractor";

    async validate(query) {
        return true;
    }

    async handle(query, context) {
        try {
          if (query.includes('youtube.com') || query.includes('youtu.be')) {
              const info = await videoInfo(query);
              return this.createResponse(null, [this.buildTrack(info, context)]);
          }
          const results = await search(query, { filterType: 'video' });
          if (!results.videos || !results.videos.length) return this.createResponse();
          const tracks = results.videos.map(v => this.buildTrack(v, context));
          return this.createResponse(null, tracks);
        } catch(e) {
          console.error("Extractor error:", e);
          return this.createResponse();
        }
    }

    buildTrack(video, context) {
        return new Track(this.context.player, {
            title: video.title,
            description: video.description || "",
            author: video.channel?.name || "Unknown",
            url: video.url,
            thumbnail: video.thumbnails?.[0]?.url || "",
            duration: video.duration?.text || video.durationFormatted || "0:00",
            views: video.viewCount,
            requestedBy: context?.requestedBy,
            source: "youtube",
            queryType: context?.type || "youtubeVideo"
        });
    }

    async stream(info) {
        const ytdl = require('youtube-dl-exec');
        // Obligamos a que devuelva un formato Opus nativo en WebM, ya que si es mp4/m4a el bot sin ffmpeg crasheará.
        const streamUrl = await ytdl(info.url, {
            getUrl: true,
            f: 'bestaudio[ext=webm+acodec=opus+asr=48000]/bestaudio[ext=webm+acodec=opus]/bestaudio',
            noWarnings: true,
            callHome: false
        });
        
        return typeof streamUrl === 'string' ? streamUrl.trim() : streamUrl;
    }
}

const app = express();
app.use(cors());
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const client = new Client({
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages ]
});
const player = new Player(client, {
  probeTimeout: 60000 // Aumentado a 60s para que yt-dlp tenga tiempo de iniciar
});

// Funciones para emitir la cola actualizada al Frontend
function emitQueue(queue) {
  if (!queue) return;
  const tracks = queue.tracks.toArray().map(t => ({ title: t.title, author: t.author, thumbnail: t.thumbnail }));
  const current = queue.currentTrack ? { title: queue.currentTrack.title, author: queue.currentTrack.author, thumbnail: queue.currentTrack.thumbnail } : null;
  io.emit('queue_update', { current, tracks });

  if (current) {
    const query = `${current.title} ${current.author}`;
    player.lyrics.search({ q: query }).then(res => {
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

// Intervalo para enviar el progreso de las canciones al frontend
setInterval(() => {
  player.nodes.cache.forEach(queue => {
    if (queue.isPlaying() && !queue.node.isPaused()) {
      io.emit('progress', { 
        guildId: queue.guild.id, 
        timestamp: queue.node.getTimestamp() 
      });
    }
  });
}, 1000);

player.events.on('playerStart', (queue, track) => emitQueue(queue));
player.events.on('audioTrackAdd', (queue, track) => emitQueue(queue));
player.events.on('audioTrackRemove', (queue) => emitQueue(queue));
player.events.on('emptyQueue', (queue) => io.emit('queue_update', { current: null, tracks: [] }));
player.events.on('error', (queue, error) => console.error(`[Player Error] ${error.message}`));
player.events.on('playerError', (queue, error) => console.error(`[PlayerError] ${error.message}`));

io.on('connection', (socket) => {
  socket.on('play_song', async (data) => {
    console.log("Recibida petición play_song:", data.query);
    const { query, guildId, channelId } = data;
    if (!guildId || !channelId) {
       console.log("Falta guildId o channelId");
       return socket.emit('play_error', { message: 'Falta ID del servidor o canal. Entra a un canal de voz.' });
    }

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) return;

      let finalQuery = query;
      let searchEngine = 'ext:YoutubeDlpExtractor';

      if (query.startsWith('http') && !query.includes('youtube.com') && !query.includes('youtu.be')) {
        searchEngine = 'auto'; // Soporte nativo para enlaces de Spotify/Apple Music etc.
      }
      
      await player.play(channel, query, {
        nodeOptions: { 
          metadata: { channel: channel }, 
          volume: 80, 
          leaveOnEmpty: true,
          bufferingTimeout: 15000, 
          disableBiquad: true,
          disableVolume: true
        },
        searchEngine: searchEngine
      });
    } catch (e) {
      console.error("Error en play_song:", e);
      socket.emit('play_error', { message: 'No se pudo reproducir: ' + (e.message || 'Error desconocido') });
    }
  });

  socket.on('skip_song', (data) => {
    const queue = player.nodes.get(data.guildId);
    if (queue) queue.node.skip();
  });

  socket.on('toggle_pause', (data) => {
    const queue = player.nodes.get(data.guildId);
    if (queue) {
      queue.node.setPaused(!queue.node.isPaused());
      io.emit('pause_state', { guildId: data.guildId, isPaused: queue.node.isPaused() });
    }
  });

  socket.on('seek_song', (data) => {
    const queue = player.nodes.get(data.guildId);
    if (queue) queue.node.seek(data.timeMs);
  });

  socket.on('get_queue', (data) => {
    if (!data.guildId) return;
    const queue = player.nodes.get(data.guildId);
    if (queue) {
      const tracks = queue.tracks.toArray().map(t => ({ title: t.title, author: t.author, thumbnail: t.thumbnail }));
      const current = queue.currentTrack ? { title: queue.currentTrack.title, author: queue.currentTrack.author, thumbnail: queue.currentTrack.thumbnail } : null;
      socket.emit('queue_update', { current, tracks });
      socket.emit('pause_state', { guildId: data.guildId, isPaused: queue.node.isPaused() });
    }
  });

  socket.on('search_song', async (data) => {
    if (!data.query) return;
    if (data.query.startsWith('http')) {
      return socket.emit('search_results', []);
    }
    
    try {
      console.log("Buscando canción:", data.query);
      const results = await player.search(data.query, { searchEngine: 'ext:YoutubeDlpExtractor' });
      if (!results || !results.tracks || results.tracks.length === 0) {
         console.log("Búsqueda sin resultados.");
         return socket.emit('search_results', []);
      }
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

async function startServer() {
  await player.extractors.loadMulti(DefaultExtractors);
  await player.extractors.register(YoutubeDlpExtractor, {});
  console.log('✅ Extractores de música cargados (Usando yt-dlp para descargar directamente de YouTube sin bloqueos)');

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`🌐 Servidor API y WebSockets en el puerto ${PORT}`);
  });

  client.login(process.env.DISCORD_TOKEN);
}

startServer();
