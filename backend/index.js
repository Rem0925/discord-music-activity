const { Client, GatewayIntentBits } = require("discord.js");
const { Player } = require("discord-player");
const { DefaultExtractors } = require("@discord-player/extractor");
const { YoutubeExtractor } = require("discord-player-youtubei");
const path = require("path");
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/config", (req, res) => {
  res.json({
    clientId:
      process.env.DISCORD_CLIENT_ID ||
      process.env.VITE_DISCORD_CLIENT_ID ||
      "1529520646151737374",
  });
});
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});
const player = new Player(client);

app.post("/api/token", async (req, res) => {
  console.log("[BACKEND Auth] Petición recibida en /api/token. Code:", req.body.code);
  try {
    const fetch = globalThis.fetch || (await import("node-fetch")).default;
    const response = await fetch(`https://discord.com/api/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id:
          process.env.DISCORD_CLIENT_ID ||
          process.env.VITE_DISCORD_CLIENT_ID ||
          "1529520646151737374",
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: req.body.code,
      }),
    });
    const data = await response.json();
    console.log("[BACKEND Auth] Respuesta de Discord:", data.error ? data.error : "Token OK");
    res.json(data);
  } catch (error) {
    console.error("[BACKEND Auth] Token exchange error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/image", async (req, res) => {
  try {
    const fetch = globalThis.fetch || (await import("node-fetch")).default;
    const url = req.query.url;
    if (!url) return res.status(400).send("No URL");
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.set("Content-Type", response.headers.get("content-type"));
    res.send(buffer);
  } catch (e) {
    res.status(500).send("Error fetching image");
  }
});

app.post("/api/log", (req, res) => {
  console.log(`[FRONTEND]`, req.body.message);
  res.send({ success: true });
});

function formatTrack(t) {
  if (!t) return null;
  let req = null;
  if (t.requestedBy) {
    if (typeof t.requestedBy.displayAvatarURL === "function") {
      req = {
        username: t.requestedBy.username || t.requestedBy.globalName || "Usuario",
        avatar: t.requestedBy.displayAvatarURL({ extension: "png", size: 128 }) || ""
      };
    } else {
      req = {
        username: t.requestedBy.username || "Usuario",
        avatar: t.requestedBy.avatar || ""
      };
    }
  }
  return {
    title: t.title,
    author: t.author,
    thumbnail: t.thumbnail ? `/api/image?url=${encodeURIComponent(t.thumbnail)}` : null,
    url: t.url,
    isAutoplay: Boolean(t.isAutoplay || req?.username?.includes("bot") || req?.username?.includes("Radio")),
    requestedBy: req
  };
}

// --- SISTEMA DE COLA MOCK Y AUTOPLAY PARA PRUEBAS Y DISCORD ---
const mockQueues = new Map();
const skipLocks = new Map();
const autoplayStates = new Map();

function getOrCreateMockQueue(guildId) {
  if (!mockQueues.has(guildId)) {
    mockQueues.set(guildId, {
      guildId,
      currentTrack: null,
      tracks: [],
      isPaused: false,
      isAutoplay: false,
      progressMs: 0,
      durationMs: 180000,
      timer: null
    });
  }
  return mockQueues.get(guildId);
}

function formatMs(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function emitMockQueue(guildId) {
  const q = mockQueues.get(guildId);
  if (!q) return;
  const current = q.currentTrack ? {
    ...q.currentTrack,
    thumbnail: q.currentTrack.thumbnail ? `/api/image?url=${encodeURIComponent(q.currentTrack.thumbnail)}` : null
  } : null;
  const tracks = q.tracks.map(t => ({
    ...t,
    thumbnail: t.thumbnail ? `/api/image?url=${encodeURIComponent(t.thumbnail)}` : null
  }));
  io.emit("queue_update", { current, tracks });
}

async function fetchSimilarTracks(currentTrack) {
  if (!currentTrack) return [];

  const artist = currentTrack.author || "";
  const title = currentTrack.title || "";
  const cleanTitle = title.toLowerCase().replace(/feat\..*|ft\..*|\(.*\)|\[.*\]/gi, "").trim();

  // Búsquedas enfocadas exclusivamente en canciones sencillas populares, NUNCA compilaciones ni mixes
  const searchQueries = [
    `${artist} hit songs`,
    `${artist} official video`,
    `${artist} top tracks`
  ];

  for (const q of searchQueries) {
    try {
      const res = await player.search(q).catch(() => null);
      if (res && res.tracks && res.tracks.length > 0) {
        const uniqueTracks = [];
        const seenTitles = new Set();
        seenTitles.add(cleanTitle);

        for (const t of res.tracks) {
          const tClean = t.title.toLowerCase().replace(/feat\..*|ft\..*|\(.*\)|\[.*\]/gi, "").trim();
          
          // Excluir la misma canción o títulos que contengan 'mix', 'compilation', '1 hour', etc.
          if (tClean.includes(cleanTitle) || cleanTitle.includes(tClean)) continue;
          if (seenTitles.has(tClean)) continue;
          if (/mix|megamix|compilation|album|playlist|1 hour|2 hour|3 hour|mashup|best of|top 10|remix|cover|karaoke|instrumental|slowed|reverb|8d|speed up|extended|full album/i.test(t.title)) continue;
          
          // Excluir compilaciones largas (> 7 minutos) o clips cortos (< 1 minuto)
          if (t.durationMS && (t.durationMS > 420000 || t.durationMS < 60000)) continue;

          seenTitles.add(tClean);
          uniqueTracks.push({
            title: t.title,
            author: t.author,
            thumbnail: t.thumbnail || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80",
            url: t.url,
            isAutoplay: true,
            requestedBy: { username: "🤖 Sugerida por el bot", avatar: "https://cdn.discordapp.com/embed/avatars/4.png" }
          });

          if (uniqueTracks.length >= 3) break;
        }

        if (uniqueTracks.length > 0) return uniqueTracks;
      }
    } catch (err) {
      console.error("[Autoplay Search Error]", err);
    }
  }

  return [];
}

async function triggerMockAutoplay(guildId, lastTrack) {
  const q = mockQueues.get(guildId);
  if (!q || !q.isAutoplay) return false;
  try {
    const targetTrack = lastTrack || q.currentTrack;
    const autoTracks = await fetchSimilarTracks(targetTrack);
    if (autoTracks.length > 0) {
      q.tracks.push(...autoTracks);
      emitMockQueue(guildId);
      return true;
    }
  } catch (err) {
    console.error("Error en mock autoplay:", err);
  }
  return false;
}

function startMockPlayback(guildId) {
  const q = mockQueues.get(guildId);
  if (!q || !q.currentTrack) return;
  if (q.timer) clearInterval(q.timer);

  // Si Autoplay está activo y la cola está vacía, buscar sugerencias al iniciar una canción
  if (q.isAutoplay && q.tracks.length === 0) {
    triggerMockAutoplay(guildId, q.currentTrack);
  }

  io.emit("song_lyrics", "Buscando letras...");
  player.lyrics
    .search({ q: `${q.currentTrack.title} ${q.currentTrack.author}` })
    .then((res) => {
      if (res && res.length > 0) {
        const lyricsText = res[0].plainLyrics || res[0].lyrics || res[0].syncedLyrics;
        io.emit("song_lyrics", lyricsText || "No se encontraron letras");
      } else {
        io.emit("song_lyrics", "No se encontraron letras para esta canción.");
      }
    })
    .catch(() => {
      io.emit("song_lyrics", "No se encontraron letras para esta canción.");
    });

  q.timer = setInterval(async () => {
    if (q.isPaused) return;
    q.progressMs += 1000;
    if (q.progressMs >= q.durationMs) {
      q.progressMs = 0;
      const finishedTrack = q.currentTrack;
      if (q.tracks.length === 0 && q.isAutoplay) {
        await triggerMockAutoplay(guildId, finishedTrack);
      }
      if (q.tracks.length > 0) {
        q.currentTrack = q.tracks.shift();
        emitMockQueue(guildId);
        startMockPlayback(guildId);
      } else {
        q.currentTrack = null;
        if (q.timer) clearInterval(q.timer);
        q.timer = null;
        emitMockQueue(guildId);
      }
    } else {
      const currentLabel = formatMs(q.progressMs);
      const totalLabel = formatMs(q.durationMs);
      const prog = (q.progressMs / q.durationMs) * 100;
      io.emit("progress", {
        guildId,
        timestamp: {
          current: { label: currentLabel, value: q.progressMs },
          total: { label: totalLabel, value: q.durationMs },
          progress: prog
        }
      });
    }
  }, 1000);
}

// Funciones para emitir la cola actualizada al Frontend
function emitQueue(queue) {
  if (!queue) return;
  const tracks = queue.tracks.toArray().map(formatTrack);
  const current = formatTrack(queue.currentTrack);
  io.emit("queue_update", { current, tracks });
}

// Intervalo para enviar el progreso de las canciones al frontend
setInterval(() => {
  player.nodes.cache.forEach((queue) => {
    if (queue.isPlaying() && !queue.node.isPaused()) {
      io.emit("progress", {
        guildId: queue.guild.id,
        timestamp: queue.node.getTimestamp(),
      });
    }
  });
}, 1000);

player.events.on("playerStart", async (queue, track) => {
  emitQueue(queue);

  // Si Autoplay está activo y la cola no tiene canciones, buscar sugerencias de inmediato
  const isAuto = Boolean(autoplayStates.get(queue.guild.id));
  if (isAuto && queue.tracks.size === 0) {
    const autoTracks = await fetchSimilarTracks(track);
    if (autoTracks.length > 0) {
      queue.addTrack(autoTracks);
      emitQueue(queue);
    }
  }

  io.emit("song_lyrics", "Buscando letras...");
  const query = `${track.title} ${track.author}`;
  player.lyrics
    .search({ q: query })
    .then((res) => {
      if (res && res.length > 0) {
        const lyricsText =
          res[0].plainLyrics || res[0].lyrics || res[0].syncedLyrics;
        io.emit("song_lyrics", lyricsText || "No se encontraron letras");
      } else if (res && (res.plainLyrics || res.lyrics)) {
        io.emit(
          "song_lyrics",
          res.plainLyrics || res.lyrics || "No se encontraron letras",
        );
      } else {
        io.emit("song_lyrics", "No se encontraron letras");
      }
    })
    .catch((e) => {
      console.error("Letras no encontradas:", e.message);
      io.emit("song_lyrics", "No se encontraron letras");
    });
});
player.events.on("audioTrackAdd", (queue, track) => emitQueue(queue));
player.events.on("audioTrackRemove", (queue) => emitQueue(queue));
player.events.on("emptyQueue", (queue) =>
  io.emit("queue_update", { current: null, tracks: [] }),
);
player.events.on("error", (queue, error) =>
  console.error(`[Player Error] ${error.message}`),
);
player.events.on("playerError", (queue, error) =>
  console.error(`[PlayerError] ${error.message}`),
);

io.on("connection", (socket) => {
  socket.on("play_song", async (data) => {
    console.log("Recibida petición play_song:", data.query, "de:", data.user?.username);
    const { query, guildId, channelId, user } = data;
    if (!guildId || !channelId) {
      console.log("Falta guildId o channelId");
      return socket.emit("play_error", {
        message: "Falta ID del servidor o canal. Entra a un canal de voz.",
      });
    }

    const requestedByUser = user ? {
      username: user.username || "Usuario",
      avatar: user.avatar || ""
    } : null;

    // --- Modo Prueba Local sin Discord ---
    if (String(guildId).startsWith("mock-")) {
      const q = getOrCreateMockQueue(guildId);
      
      // Limpiar TODAS las canciones sugeridas por el bot cuando un usuario añade una canción
      q.tracks = q.tracks.filter(t => {
        const isBot = t.isAutoplay || 
                      t.requestedBy?.username === "🤖 Sugerida por el bot" || 
                      t.requestedBy?.username === "♾️ Radio Autoplay" ||
                      (t.requestedBy?.username && (t.requestedBy.username.includes("bot") || t.requestedBy.username.includes("Radio")));
        return !isBot;
      });

      try {
        let trackObj = null;
        const searchRes = await player.search(query).catch(() => null);
        if (searchRes && searchRes.tracks && searchRes.tracks.length > 0) {
          const first = searchRes.tracks[0];
          trackObj = {
            title: first.title || query,
            author: first.author || "Artista",
            thumbnail: first.thumbnail || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80",
            url: first.url || query,
            requestedBy: requestedByUser
          };
        } else {
          trackObj = {
            title: query.length > 30 ? query.substring(0, 30) + "..." : query,
            author: "Artista Local",
            thumbnail: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80",
            url: query,
            requestedBy: requestedByUser
          };
        }

        if (!q.currentTrack) {
          q.currentTrack = trackObj;
          q.progressMs = 0;
          emitMockQueue(guildId);
          startMockPlayback(guildId);
        } else {
          q.tracks.push(trackObj);
          emitMockQueue(guildId);
        }
      } catch (e) {
        console.error("Error en play_song MOCK:", e);
        socket.emit("play_error", { message: "Error en modo prueba: " + e.message });
      }
      return;
    }

    // --- Modo Normal Discord ---
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) return;

      const queue = player.nodes.get(guildId);
      // Limpiar TODAS las canciones sugeridas por el bot cuando un usuario añade una canción
      if (queue && queue.tracks) {
        const arr = queue.tracks.toArray();
        for (let i = arr.length - 1; i >= 0; i--) {
          const t = arr[i];
          if (t.isAutoplay || 
              t.requestedBy?.username === "🤖 Sugerida por el bot" || 
              t.requestedBy?.username === "♾️ Radio Autoplay" ||
              (t.requestedBy?.username && (t.requestedBy.username.includes("bot") || t.requestedBy.username.includes("Radio")))) {
            try { queue.node.remove(i); } catch (_) {}
          }
        }
      }

      const res = await player.play(channel, query, {
        requestedBy: requestedByUser,
        nodeOptions: {
          metadata: { channel: channel },
          volume: 80,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 300000,
          leaveOnEnd: false,
          leaveOnEndCooldown: 300000,
          bufferingTimeout: 15000,
        },
      });

      if (res && res.track && requestedByUser) {
        res.track.requestedBy = requestedByUser;
      }
      if (res && res.searchResult && res.searchResult.tracks && requestedByUser) {
        res.searchResult.tracks.forEach((t) => {
          t.requestedBy = requestedByUser;
        });
      }

      const updatedQueue = player.nodes.get(guildId);
      if (updatedQueue) emitQueue(updatedQueue);
    } catch (e) {
      console.error("Error en play_song:", e);
      socket.emit("play_error", {
        message: "No se pudo reproducir: " + (e.message || "Error desconocido"),
      });
    }
  });

  socket.on("set_autoplay", async (data) => {
    if (!data.guildId) return;
    const enabled = Boolean(data.enabled);
    autoplayStates.set(data.guildId, enabled);

    if (String(data.guildId).startsWith("mock-")) {
      const q = getOrCreateMockQueue(data.guildId);
      if (q) {
        q.isAutoplay = enabled;
        if (enabled) {
          // SOLO si ya hay una canción sonando actualmente, poblar canciones sugeridas a la cola
          if (q.currentTrack && q.tracks.length === 0) {
            await triggerMockAutoplay(data.guildId, q.currentTrack);
          } else {
            emitMockQueue(data.guildId);
          }
        } else {
          // Al desactivar autoplay, quitar canciones sugeridas por el bot de la cola
          q.tracks = q.tracks.filter(t => !t.isAutoplay && !t.requestedBy?.username?.includes("bot"));
          emitMockQueue(data.guildId);
        }
      }
      io.emit("autoplay_state", { guildId: data.guildId, isAutoplay: enabled });
      return;
    }

    const queue = player.nodes.get(data.guildId);
    if (queue) {
      try {
        const { QueueRepeatMode } = require("discord-player");
        queue.setRepeatMode(enabled ? QueueRepeatMode.AUTOPLAY : QueueRepeatMode.OFF);
        if (enabled && queue.currentTrack && queue.tracks.size === 0) {
          const autoTracks = await fetchSimilarTracks(queue.currentTrack);
          if (autoTracks.length > 0) {
            queue.addTrack(autoTracks);
            emitQueue(queue);
          }
        } else if (!enabled) {
          const autoplays = queue.tracks.toArray().filter(t => t.requestedBy?.username?.includes("bot"));
          autoplays.forEach(t => {
            try { queue.node.remove(t); } catch (_) {}
          });
          emitQueue(queue);
        }
      } catch (err) {
        console.error("Error cambiando repeatMode autoplay:", err);
      }
    }
    io.emit("autoplay_state", { guildId: data.guildId, isAutoplay: enabled });
  });

  socket.on("skip_song", (data) => {
    if (!data.guildId) return;
    // Protección anti race-condition para saltos simultáneos
    const now = Date.now();
    const lastSkip = skipLocks.get(data.guildId) || 0;
    if (now - lastSkip < 800) {
      console.log("[Skip] Salto duplicado ignorado para:", data.guildId);
      return;
    }
    skipLocks.set(data.guildId, now);

    if (String(data.guildId).startsWith("mock-")) {
      const q = mockQueues.get(data.guildId);
      if (!q) return;
      q.progressMs = 0;
      if (q.tracks.length === 0 && q.isAutoplay) {
        triggerMockAutoplay(data.guildId, q.currentTrack).then(() => {
          if (q.tracks.length > 0) {
            q.currentTrack = q.tracks.shift();
            emitMockQueue(data.guildId);
            startMockPlayback(data.guildId);
          } else {
            q.currentTrack = null;
            if (q.timer) clearInterval(q.timer);
            q.timer = null;
            emitMockQueue(data.guildId);
          }
        });
        return;
      }
      if (q.tracks.length > 0) {
        q.currentTrack = q.tracks.shift();
        emitMockQueue(data.guildId);
        startMockPlayback(data.guildId);
      } else {
        q.currentTrack = null;
        if (q.timer) clearInterval(q.timer);
        q.timer = null;
        emitMockQueue(data.guildId);
      }
      return;
    }

    const queue = player.nodes.get(data.guildId);
    if (queue && queue.currentTrack) queue.node.skip();
  });

  socket.on("set_pause", (data) => {
    if (!data.guildId) return;
    const paused = typeof data.paused === "boolean" ? data.paused : undefined;

    if (String(data.guildId).startsWith("mock-")) {
      const q = mockQueues.get(data.guildId);
      if (!q) return;
      q.isPaused = paused !== undefined ? paused : !q.isPaused;
      io.emit("pause_state", {
        guildId: data.guildId,
        isPaused: q.isPaused,
      });
      return;
    }

    const queue = player.nodes.get(data.guildId);
    if (queue) {
      const targetState = paused !== undefined ? paused : !queue.node.isPaused();
      if (queue.node.isPaused() !== targetState) {
        queue.node.setPaused(targetState);
      }
      io.emit("pause_state", {
        guildId: data.guildId,
        isPaused: queue.node.isPaused(),
      });
    }
  });

  socket.on("toggle_pause", (data) => {
    if (!data.guildId) return;
    if (String(data.guildId).startsWith("mock-")) {
      const q = mockQueues.get(data.guildId);
      if (!q) return;
      q.isPaused = !q.isPaused;
      io.emit("pause_state", {
        guildId: data.guildId,
        isPaused: q.isPaused,
      });
      return;
    }

    const queue = player.nodes.get(data.guildId);
    if (queue) {
      queue.node.setPaused(!queue.node.isPaused());
      io.emit("pause_state", {
        guildId: data.guildId,
        isPaused: queue.node.isPaused(),
      });
    }
  });

  socket.on("remove_song", (data) => {
    if (!data.guildId) return;
    if (String(data.guildId).startsWith("mock-")) {
      const q = mockQueues.get(data.guildId);
      if (!q || !q.tracks) return;
      let idx = typeof data.index === "number" && data.index >= 0 && data.index < q.tracks.length ? data.index : -1;
      if (idx === -1 && (data.url || data.title)) {
        idx = q.tracks.findIndex((t) => (data.url && t.url === data.url) || (data.title && t.title === data.title));
      }
      if (idx !== -1 && idx < q.tracks.length) {
        q.tracks.splice(idx, 1);
        emitMockQueue(data.guildId);
      }
      return;
    }

    const queue = player.nodes.get(data.guildId);
    if (!queue || !queue.tracks) return;
    const tracksArray = queue.tracks.toArray();
    let targetIndex = typeof data.index === "number" && data.index >= 0 && data.index < tracksArray.length ? data.index : -1;
    if (targetIndex === -1 && (data.url || data.title)) {
      targetIndex = tracksArray.findIndex((t) =>
        (data.url && t.url === data.url) ||
        (data.title && t.title === data.title)
      );
    }
    if (targetIndex !== -1 && targetIndex < tracksArray.length) {
      try {
        queue.node.remove(targetIndex);
        emitQueue(queue);
      } catch (err) {
        console.error("Error al eliminar canción:", err);
      }
    }
  });

  socket.on("seek_song", async (data) => {
    if (!data.guildId || typeof data.timeMs !== "number") return;
    if (String(data.guildId).startsWith("mock-")) {
      const q = mockQueues.get(data.guildId);
      if (q) q.progressMs = data.timeMs;
      return;
    }
    const queue = player.nodes.get(data.guildId);
    if (queue) {
      try {
        await queue.node.seek(data.timeMs);
        io.emit("progress", {
          guildId: data.guildId,
          timestamp: queue.node.getTimestamp(),
        });
      } catch (err) {
        console.error("Error al realizar seek:", err);
      }
    }
  });

  socket.on("get_queue", (data) => {
    if (!data.guildId) return;
    const isAuto = Boolean(autoplayStates.get(data.guildId));
    socket.emit("autoplay_state", { guildId: data.guildId, isAutoplay: isAuto });

    if (String(data.guildId).startsWith("mock-")) {
      const q = getOrCreateMockQueue(data.guildId);
      emitMockQueue(data.guildId);
      socket.emit("pause_state", {
        guildId: data.guildId,
        isPaused: q.isPaused,
      });
      return;
    }
    const queue = player.nodes.get(data.guildId);
    if (queue) {
      emitQueue(queue);
      socket.emit("pause_state", {
        guildId: data.guildId,
        isPaused: queue.node.isPaused(),
      });
    }
  });

  socket.on("search_song", async (data) => {
    if (!data.query) return;
    if (data.query.startsWith("http")) {
      return socket.emit("search_results", []);
    }

    try {
      console.log("Buscando canción:", data.query);
      const results = await player.search(data.query);
      if (!results || !results.tracks || results.tracks.length === 0) {
        console.log("Búsqueda sin resultados.");
        return socket.emit("search_results", []);
      }
      const tracks = results.tracks
        .slice(0, 5)
        .map((t) => ({ title: t.title, author: t.author, url: t.url }));
      socket.emit("search_results", tracks);
    } catch (e) {
      console.error("Error buscando:", e);
      socket.emit("search_results", []);
    }
  });
});

// Servir archivos estáticos del frontend compilado en producción (dist)
const frontendDist = path.join(__dirname, "../frontend/dist");
if (require("fs").existsSync(frontendDist)) {
  console.log("📦 Servidor Express sirviendo la interfaz frontend compilada desde /frontend/dist");
  app.use(express.static(frontendDist));
  app.get(/(.*)/, (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

client.once("ready", () => {
  console.log(`🤖 Bot iniciado correctamente como ${client.user.tag}`);
});

async function startServer() {
  try {
    const cookieStr = process.env.YOUTUBE_COOKIE ? process.env.YOUTUBE_COOKIE.trim() : "";
    const hasCookie = cookieStr.length > 0;
    console.log(`🍪 Estado de YOUTUBE_COOKIE en entorno Render: ${hasCookie ? `ACTIVA (${cookieStr.length} caracteres detectados)` : "NO DETECTADA (vacía o no guardada)"}`);

    await player.extractors.register(YoutubeExtractor, {
      cookie: hasCookie ? cookieStr : undefined,
    });
    await player.extractors.loadMulti(DefaultExtractors);
    console.log("✅ Extractores de música cargados correctamente" + (hasCookie ? " (con sesión Cookie autenticada de YouTube)" : ""));
  } catch (err) {
    console.error("⚠️ Advertencia cargando extractores de música:", err.message);
  }

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`🌐 Servidor API, WebSockets y Frontend escuchando en el puerto ${PORT}`);
  });

  if (process.env.DISCORD_TOKEN) {
    try {
      await client.login(process.env.DISCORD_TOKEN);
    } catch (loginErr) {
      console.error("❌ Error al iniciar sesión en Discord con DISCORD_TOKEN:", loginErr.message);
    }
  } else {
    console.warn("⚠️ NO se proporcionó DISCORD_TOKEN en .env. El bot funcionará únicamente en Modo Prueba Local.");
  }
}

startServer();
