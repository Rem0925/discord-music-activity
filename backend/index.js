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

const app = express();
app.use(cors());
app.use(express.json());
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
        client_id: process.env.DISCORD_CLIENT_ID,
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
    requestedBy: req
  };
}

// --- SISTEMA DE COLA MOCK PARA PRUEBAS LOCALES SIN DISCORD ---
const mockQueues = new Map();
const skipLocks = new Map();

function getOrCreateMockQueue(guildId) {
  if (!mockQueues.has(guildId)) {
    mockQueues.set(guildId, {
      guildId,
      currentTrack: null,
      tracks: [],
      isPaused: false,
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

function startMockPlayback(guildId) {
  const q = mockQueues.get(guildId);
  if (!q || !q.currentTrack) return;
  if (q.timer) clearInterval(q.timer);

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

  q.timer = setInterval(() => {
    if (q.isPaused) return;
    q.progressMs += 1000;
    if (q.progressMs >= q.durationMs) {
      q.progressMs = 0;
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

player.events.on("playerStart", (queue, track) => {
  emitQueue(queue);
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

      const res = await player.play(channel, query, {
        requestedBy: requestedByUser,
        nodeOptions: {
          metadata: { channel: channel },
          volume: 80,
          leaveOnEmpty: true,
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

      const queue = player.nodes.get(guildId);
      if (queue) emitQueue(queue);
    } catch (e) {
      console.error("Error en play_song:", e);
      socket.emit("play_error", {
        message: "No se pudo reproducir: " + (e.message || "Error desconocido"),
      });
    }
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
      let idx = -1;
      if (typeof data.index === "number" && q.tracks[data.index]) {
        const t = q.tracks[data.index];
        if ((!data.title || t.title === data.title) && (!data.url || t.url === data.url)) {
          idx = data.index;
        }
      }
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
    let targetIndex = -1;
    if (typeof data.index === "number" && tracksArray[data.index]) {
      const trackAtIndex = tracksArray[data.index];
      if ((!data.title || trackAtIndex.title === data.title) &&
          (!data.url || trackAtIndex.url === data.url)) {
        targetIndex = data.index;
      }
    }
    if (targetIndex === -1 && (data.url || data.title)) {
      targetIndex = tracksArray.findIndex((t) =>
        (data.url && t.url === data.url) ||
        (data.title && t.title === data.title)
      );
    }
    if (targetIndex !== -1 && targetIndex < tracksArray.length) {
      try {
        const targetTrack = tracksArray[targetIndex];
        if (typeof queue.node.remove === "function") {
          queue.node.remove(targetTrack);
        } else if (typeof queue.removeTrack === "function") {
          queue.removeTrack(targetIndex);
        } else if (typeof queue.tracks.removeOne === "function") {
          queue.tracks.removeOne(targetIndex);
        }
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

client.once("clientReady", () => {
  console.log(`🤖 Bot iniciado correctamente como ${client.user.tag}`);
});

async function startServer() {
  await player.extractors.register(YoutubeExtractor, {});
  await player.extractors.loadMulti(DefaultExtractors);
  console.log("✅ Extractores de música cargados");

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`🌐 Servidor API y WebSockets en el puerto ${PORT}`);
  });

  client.login(process.env.DISCORD_TOKEN);
}

startServer();
