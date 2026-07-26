import { useState, useEffect, useRef } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { io, Socket } from 'socket.io-client';

interface Track {
  title: string;
  author: string;
  url?: string;
  thumbnail?: string;
  requestedBy?: { username: string; avatar: string };
  duration?: string;
  durationSec?: number;
}

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || 'PON_TU_CLIENT_ID_AQUI';
const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

const MOCK_USERS = [
  { username: 'Rem (Tú)', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80' },
  { username: 'Alex_DJ', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80' },
  { username: 'Elena_DJ', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80' },
  { username: 'CarlosG', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80' }
];

const Icons = {
  Play: () => <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>,
  Pause: () => <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>,
  SkipNext: () => <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>,
  VolumeMax: () => (
    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>
  ),
  VolumeMute: () => (
    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
    </svg>
  ),
  Search: () => (
    <svg className="w-5 h-5 stroke-current" fill="none" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
    </svg>
  ),
  ListPlus: () => (
    <svg className="w-5 h-5 stroke-current" fill="none" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>
  ),
  Mic: () => (
    <svg className="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z"/>
    </svg>
  ),
  Trash: () => (
    <svg className="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
    </svg>
  ),
  Discord: () => (
    <svg className="w-5 h-5 fill-current" viewBox="0 0 127.14 96.36">
      <path d="M107.7,8.07A105.15,107.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.89,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.42,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14c2.64-27.38-4.51-51.11-18.91-72.13ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.92,53.87,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.92,96.12,53,91.08,65.69,84.69,65.69Z"/>
    </svg>
  ),
  Sparkles: () => (
    <svg className="w-3.5 h-3.5 fill-current text-yellow-400" viewBox="0 0 24 24">
      <path d="M12 0l2.5 8.5L24 12l-9.5 3.5L12 24l-2.5-8.5L0 12l9.5-3.5z"/>
    </svg>
  ),
  Lyrics: () => (
    <svg className="w-5 h-5 stroke-current" fill="none" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
    </svg>
  ),
  Heart: ({ filled }: { filled: boolean }) => (
    <svg className={`w-5 h-5 ${filled ? 'fill-pink-500 text-pink-500' : 'fill-none stroke-current text-gray-300'}`} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
    </svg>
  )
};

const AudioVisualizer = ({ isPlaying }: { isPlaying: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationFrameId: number;

    let bars = Array.from({ length: 28 }, () => ({
      height: Math.random() * 15 + 4,
      targetHeight: Math.random() * 32 + 6,
      speed: 0.15 + Math.random() * 0.1
    }));

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = width / bars.length - 2;

      bars.forEach((bar, i) => {
        if (isPlaying) {
          bar.height += (bar.targetHeight - bar.height) * bar.speed;
          if (Math.abs(bar.height - bar.targetHeight) < 2) {
            bar.targetHeight = Math.random() * (height * 0.8) + 6;
          }
        } else {
          bar.height += (4 - bar.height) * 0.1;
        }

        const x = i * (barWidth + 2);
        const y = (height - bar.height) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + bar.height);
        gradient.addColorStop(0, '#818CF8');
        gradient.addColorStop(1, '#C084FC');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, barWidth, bar.height, 3);
        } else {
          ctx.rect(x, y, barWidth, bar.height);
        }
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying]);

  return <canvas ref={canvasRef} width={240} height={36} className="w-full h-9 opacity-85" />;
};

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [guildId, setGuildId] = useState<string | null>(null);
  const [isMockMode, setIsMockMode] = useState<boolean>(false);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState({ 
    current: { label: '0:00', value: 0 }, 
    total: { label: '0:00', value: 0 }, 
    progress: 0 
  });

  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [rightPanelTab, setRightPanelTab] = useState<'lyrics' | 'queue' | 'search'>('search');
  const [isLiked, setIsLiked] = useState(false);
  const [user, setUser] = useState<{ username: string; avatar: string }>(MOCK_USERS[0]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let newSocket: Socket | null = null;
    
    async function setupDiscord() {
      try {
        await discordSdk.ready();
        setChannelId(discordSdk.channelId);
        setGuildId(discordSdk.guildId);

        try {
          const { code } = await discordSdk.commands.authorize({
            client_id: DISCORD_CLIENT_ID,
            response_type: "code",
            state: "",
            prompt: "none",
            scope: ["identify", "guilds"],
          });
          const response = await fetch('/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
          });
          const tokenData = await response.json();
          const access_token = tokenData.access_token;
          if (access_token) {
            await discordSdk.commands.authenticate({ access_token });
            const userRes = await fetch('https://discord.com/api/v10/users/@me', {
              headers: { Authorization: `Bearer ${access_token}` }
            });
            if (userRes.ok) {
              const u = await userRes.json();
              const avatarUrl = u.avatar 
                ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png`
                : `https://cdn.discordapp.com/embed/avatars/${Number(u.discriminator || 0) % 5}.png`;
              setUser({
                username: u.global_name || u.username,
                avatar: avatarUrl
              });
            }
          }
        } catch (e) {
          console.log("Discord Auth fallback", e);
        }
        
        newSocket = io();
        setupSocketListeners(newSocket, discordSdk.guildId);
      } catch (err) {
        // Modo de Prueba Local (Sin Discord)
        setIsMockMode(true);
        const mockGuild = 'mock-guild-1';
        const mockChannel = 'mock-channel-1';
        setGuildId(mockGuild);
        setChannelId(mockChannel);

        newSocket = io();
        setupSocketListeners(newSocket, mockGuild);
      }
    }

    function setupSocketListeners(sock: Socket, currentGuildId: string | null) {
      sock.on('connect', () => {
        if (currentGuildId) {
          sock.emit('get_queue', { guildId: currentGuildId });
        }
      });

      sock.on('queue_update', (data: { current: Track | null, tracks: Track[] }) => {
        setCurrentTrack(data.current);
        setQueue(data.tracks);
      });

      // --- CAMBIO DE PESTAÑA AUTOMÁTICO SEGÚN LAS LETRAS ---
      sock.on('song_lyrics', (text: string | null) => {
        if (text && text !== "No se encontraron letras" && text !== "No se encontraron letras para esta canción." && text !== "Buscando letras...") {
          setLyrics(text);
          setRightPanelTab('lyrics'); // Si encuentra la letra, se queda/cambia a Letras
        } else if (text === "No se encontraron letras" || text === "No se encontraron letras para esta canción.") {
          setLyrics(null);
          setRightPanelTab('search'); // Si no la encuentra, cambia automáticamente al buscador
        } else {
          setLyrics(text);
        }
      });
      
      sock.on('search_results', (results: Track[]) => {
        setSearchResults(results);
      });

      sock.on('pause_state', (data: { guildId: string, isPaused: boolean }) => {
        if (data.guildId === currentGuildId) {
          setIsPaused(data.isPaused);
        }
      });

      sock.on('progress', (data: { guildId: string, timestamp: any }) => {
        if (data.guildId === currentGuildId && data.timestamp) {
          setProgress({
            current: { label: data.timestamp.current?.label || '0:00', value: data.timestamp.current?.value || 0 },
            total: { label: data.timestamp.total?.label || '0:00', value: data.timestamp.total?.value || 0 },
            progress: data.timestamp.progress || 0
          });
        }
      });

      setSocket(sock);
    }

    setupDiscord();

    return () => {
      if (newSocket) newSocket.disconnect();
    };
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (val.trim().length > 2 && !val.startsWith('http')) {
      searchDebounceRef.current = setTimeout(() => {
        socket?.emit('search_song', { query: val });
      }, 400);
    } else {
      setSearchResults([]);
    }
  };

  const handlePlaySong = (songUrl?: string) => {
    const query = songUrl || searchQuery;
    if (!query || !query.trim()) return;

    if (socket && guildId && channelId) {
      socket.emit('play_song', { query, channelId, guildId, user });
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  const handleNextTrack = () => {
    if (socket && guildId) {
      socket.emit('skip_song', { guildId });
    }
  };

  const togglePause = () => {
    if (socket && guildId) {
      socket.emit('set_pause', { guildId, paused: !isPaused });
    }
  };

  const handleRemoveFromQueue = (index: number, track: Track) => {
    if (socket && guildId) {
      socket.emit('remove_song', {
        guildId,
        index,
        title: track.title,
        url: track.url
      });
    }
  };

  const handleScrubberChange = (timeValueMs: number) => {
    if (socket && guildId) {
      socket.emit('seek_song', { guildId, timeMs: timeValueMs });
    }
  };

  return (
    <div className="relative h-screen w-full bg-[#0a0c12] text-gray-100 font-sans flex flex-col justify-between overflow-hidden select-none">
      
      {/* Background Ambient Glow */}
      {currentTrack?.thumbnail && (
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-15 filter blur-3xl scale-125 transition-all duration-1000 pointer-events-none"
          style={{ backgroundImage: `url(${currentTrack.thumbnail})` }}
        />
      )}

      {/* Edge-to-Edge Top Bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-3 bg-[#11131c]/90 border-b border-white/10 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-indigo-600/30 text-indigo-400 border border-indigo-500/30">
            <Icons.Discord />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-sm sm:text-base tracking-wide text-white">
                JamBot Player Activity
              </h1>
              <span className="flex items-center space-x-1.5 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>#General</span>
              </span>
            </div>
          </div>
        </div>

        {/* Discord Voice / Local Users Selector */}
        <div className="flex items-center space-x-3 bg-black/40 px-3 py-1 rounded-full border border-white/10 text-xs">
          <Icons.Mic />
          <span className="font-medium text-gray-400 hidden sm:inline">
            {isMockMode ? 'Simular Usuario:' : 'Oyentes:'}
          </span>
          <div className="flex space-x-1">
            {MOCK_USERS.map((u, idx) => {
              const isSelected = user.username === u.username;
              return (
                <button
                  key={idx}
                  onClick={() => setUser(u)}
                  className={`relative transition-all rounded-full p-0.5 border ${
                    isSelected ? 'border-indigo-400 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                  title={`Simular como ${u.username}`}
                >
                  <img src={u.avatar} alt={u.username} className="w-6 h-6 rounded-full object-cover" />
                  {idx === 0 && (
                    <span className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-0.5">
                      <Icons.Sparkles />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Workspace (Continuous 2-Column Split) */}
      <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
        
        {/* LEFT COLUMN: Cover, Info & Canvas Visualizer */}
        <section className="md:col-span-5 lg:col-span-4 bg-[#0e111a]/80 backdrop-blur-lg border-r border-white/10 p-6 flex flex-col items-center justify-between overflow-y-auto">
          
          {currentTrack ? (
            <div className="w-full flex flex-col items-center my-auto space-y-5">
              {/* Artwork Container */}
              <div className="relative group/art max-w-[240px] sm:max-w-[280px] w-full aspect-square">
                <div className={`absolute -inset-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur-xl transition-all duration-700 ${!isPaused ? 'opacity-40 scale-105' : 'opacity-10 scale-95'}`} />
                <img
                  src={currentTrack.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80'}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover rounded-xl shadow-2xl relative z-10 border border-white/10"
                />
                <button 
                  onClick={() => setIsLiked(!isLiked)}
                  className="absolute top-3 right-3 z-20 p-2 rounded-full bg-black/50 backdrop-blur-md transition-transform hover:scale-110 active:scale-95"
                >
                  <Icons.Heart filled={isLiked} />
                </button>
              </div>

              {/* Song Meta */}
              <div className="text-center w-full px-2 space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight line-clamp-1">
                  {currentTrack.title}
                </h2>
                <p className="text-sm text-indigo-300 font-medium line-clamp-1">
                  {currentTrack.author}
                </p>
                {currentTrack.requestedBy && (
                  <div className="inline-flex items-center space-x-1.5 pt-1 text-xs text-gray-400">
                    <span>Pedida por</span>
                    {currentTrack.requestedBy.avatar ? (
                      <img src={currentTrack.requestedBy.avatar} className="w-4 h-4 rounded-full" alt="" />
                    ) : (
                      <span>👤</span>
                    )}
                    <span className="font-semibold text-gray-300">{currentTrack.requestedBy.username}</span>
                  </div>
                )}
              </div>

              {/* Audio Spectrum Visualizer */}
              <div className="w-full max-w-[240px]">
                <AudioVisualizer isPlaying={!isPaused} />
              </div>
            </div>
          ) : (
            <div className="my-auto text-center space-y-3 opacity-60">
              <div className="w-24 h-24 mx-auto rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Icons.Play />
              </div>
              <h3 className="text-lg font-semibold text-white">Listo para reproducir</h3>
              <p className="text-xs text-gray-400">Busca una canción o pega un enlace para comenzar</p>
            </div>
          )}

        </section>

        {/* RIGHT COLUMN: Live Lyrics / Queue / Search */}
        <section className="md:col-span-7 lg:col-span-8 bg-[#0a0c12]/60 backdrop-blur-lg flex flex-col overflow-hidden">
          
          {/* Top Panel Controls / Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-3 bg-[#11131c]/50">
            <div className="flex space-x-1 bg-black/40 p-1 rounded-xl border border-white/10">
              {[
                { id: 'lyrics' as const, label: 'Letra en Vivo', icon: Icons.Lyrics },
                { id: 'queue' as const, label: `Cola (${queue.length})`, icon: Icons.ListPlus },
                { id: 'search' as const, label: 'Buscar / Añadir', icon: Icons.Search }
              ].map((tab) => {
                const Icon = tab.icon;
                const active = rightPanelTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setRightPanelTab(tab.id)}
                    className={`flex items-center space-x-2 py-1.5 px-4 rounded-lg font-medium text-xs transition-all ${
                      active
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Content Panel */}
          <div className="flex-1 overflow-y-auto p-6 relative">
            
            {/* TAB: LYRICS */}
            {rightPanelTab === 'lyrics' && (
              <div className="h-full flex flex-col justify-center items-center text-center space-y-6 max-w-xl mx-auto py-8 overflow-y-auto">
                {lyrics ? (
                  <pre className="whitespace-pre-wrap font-sans text-base sm:text-lg font-medium leading-relaxed text-indigo-200 drop-shadow-[0_0_12px_rgba(129,140,248,0.4)]">
                    {lyrics}
                  </pre>
                ) : (
                  <div className="my-auto text-gray-500 text-sm italic">
                    Buscando o cargando letras sincronizadas...
                  </div>
                )}
              </div>
            )}

            {/* TAB: QUEUE */}
            {rightPanelTab === 'queue' && (
              <div className="space-y-2 max-w-3xl mx-auto">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  A continuación en la cola
                </p>
                {queue.length > 0 ? (
                  queue.map((track, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 transition-all duration-200 bg-black/30 border border-white/5 rounded-xl hover:bg-white/5 text-gray-300"
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <span className="w-5 text-center font-bold text-xs text-indigo-400">
                          {idx + 1}
                        </span>
                        {track.thumbnail && (
                          <img src={track.thumbnail} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                        )}
                        <div className="truncate">
                          <p className="text-sm font-semibold text-gray-200 truncate">
                            {track.title}
                          </p>
                          <div className="flex items-center space-x-2 text-xs text-gray-400">
                            <span>{track.author}</span>
                            {track.requestedBy && (
                              <span className="text-[11px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                                Pedido por {track.requestedBy.username}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveFromQueue(idx, track)}
                        className="p-2 text-gray-400 hover:text-rose-400 transition rounded-lg hover:bg-rose-500/10"
                        title="Quitar de la cola"
                      >
                        <Icons.Trash />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-gray-500 text-sm">
                    No hay más canciones en la cola. ¡Usa la pestaña de búsqueda para añadir algunas!
                  </div>
                )}
              </div>
            )}

            {/* TAB: SEARCH */}
            {rightPanelTab === 'search' && (
              <div className="space-y-4 max-w-3xl mx-auto">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePlaySong()}
                      placeholder="Buscar canción, artista o pegar URL..."
                      className="w-full bg-black/40 border border-white/15 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 transition"
                    />
                    <div className="absolute left-3.5 top-3.5 text-gray-400">
                      <Icons.Search />
                    </div>
                  </div>
                  <button
                    onClick={() => handlePlaySong()}
                    disabled={!searchQuery.trim()}
                    className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reproducir
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-1 mt-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider my-3">
                      Resultados de búsqueda
                    </p>
                    {searchResults.map((track, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 hover:bg-white/5 border-b border-white/5 transition rounded-xl"
                      >
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div className="truncate">
                            <p className="text-sm font-semibold text-gray-200 truncate">{track.title}</p>
                            <p className="text-xs text-gray-400 truncate">{track.author}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handlePlaySong(track.url)}
                          className="px-3.5 py-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition"
                        >
                          <Icons.ListPlus />
                          <span>Añadir a la cola</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

        </section>

      </div>

      {/* Bottom Integrated Controls Bar (Sin Shuffle, Repeat ni SkipPrev) */}
      <footer className="relative z-20 bg-[#0d0f17]/95 border-t border-white/10 px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Left Track Info */}
        <div className="flex items-center space-x-3 w-full md:w-1/4">
          {currentTrack?.thumbnail && (
            <img
              src={currentTrack.thumbnail}
              alt=""
              className="w-11 h-11 rounded object-cover flex-shrink-0 border border-white/10"
            />
          )}
          <div className="truncate">
            <h4 className="text-xs sm:text-sm font-bold text-white truncate">{currentTrack?.title || 'Sin canción'}</h4>
            <p className="text-[11px] text-gray-400 truncate">{currentTrack?.author || 'Selecciona una canción'}</p>
          </div>
        </div>

        {/* Center Controls & Time Scrubber */}
        <div className="flex flex-col items-center w-full md:w-2/4 max-w-xl space-y-1">
          <div className="flex items-center space-x-5">
            <button
              onClick={togglePause}
              className="p-2.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 transition shadow-lg shadow-indigo-600/30"
              title={isPaused ? 'Reanudar' : 'Pausar'}
            >
              {isPaused ? <Icons.Play /> : <Icons.Pause />}
            </button>
            <button 
              onClick={handleNextTrack} 
              className="text-gray-300 hover:text-white transition p-2 rounded-full hover:bg-white/10"
              title="Saltar canción"
            >
              <Icons.SkipNext />
            </button>
          </div>

          {/* Scrubber Slider */}
          <div className="w-full flex items-center space-x-2 text-[11px] text-gray-400 font-mono">
            <span>{progress.current.label}</span>
            <div className="relative flex-1 cursor-pointer flex items-center">
              <input
                type="range"
                min={0}
                max={progress.total.value || 100}
                value={progress.current.value || 0}
                onChange={(e) => handleScrubberChange(Number(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none"
              />
            </div>
            <span>{progress.total.label}</span>
          </div>
        </div>

        {/* Right Volume Controls */}
        <div className="flex items-center justify-end space-x-2 w-full md:w-1/4">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="text-gray-400 hover:text-white transition"
          >
            {isMuted || volume === 0 ? <Icons.VolumeMute /> : <Icons.VolumeMax />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              if (isMuted) setIsMuted(false);
            }}
            className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none"
          />
        </div>

      </footer>
    </div>
  );
}
