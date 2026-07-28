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
  isAutoplay?: boolean;
}

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || '1529520646151737374';
const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

const MOCK_USERS = [
  { username: 'Usuario', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' },
  { username: 'Alex_DJ', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80' },
  { username: 'Elena_DJ', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80' },
  { username: 'CarlosG', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80' }
];

const BASE_RECOMMENDED_POOL: Track[] = [
  { title: 'Levitating', author: 'Dua Lipa', url: 'https://www.youtube.com/watch?v=TUVcZfQe-Kw' },
  { title: 'As It Was', author: 'Harry Styles', url: 'https://www.youtube.com/watch?v=H5v3kku4y6Q' },
  { title: 'Save Your Tears', author: 'The Weeknd', url: 'https://www.youtube.com/watch?v=XXYlFuWEuKI' },
  { title: 'Blinding Lights', author: 'The Weeknd', url: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ' },
  { title: 'Starboy (feat. Daft Punk)', author: 'The Weeknd', url: 'https://www.youtube.com/watch?v=34Na4j8AVgA' },
  { title: 'Bad Guy', author: 'Billie Eilish', url: 'https://www.youtube.com/watch?v=DyDfgMOUjCI' },
  { title: 'Viva La Vida', author: 'Coldplay', url: 'https://www.youtube.com/watch?v=dvgZkm1xWPE' },
  { title: 'Believer', author: 'Imagine Dragons', url: 'https://www.youtube.com/watch?v=7wtfhZwyrcc' },
  { title: 'Get Lucky', author: 'Daft Punk', url: 'https://www.youtube.com/watch?v=5NV6Rdv1a3I' },
  { title: 'Do I Wanna Know?', author: 'Arctic Monkeys', url: 'https://www.youtube.com/watch?v=bpOSxM0rNPM' },
  { title: 'Tití Me Preguntó', author: 'Bad Bunny', url: 'https://www.youtube.com/watch?v=Cr8K88UcO0s' },
  { title: 'Despechá', author: 'ROSALÍA', url: 'https://www.youtube.com/watch?v=oWEeL5G1hSA' },
  { title: 'Sunflower', author: 'Post Malone & Swae Lee', url: 'https://www.youtube.com/watch?v=ApXoWvfEYVU' },
  { title: 'Shape of You', author: 'Ed Sheeran', url: 'https://www.youtube.com/watch?v=JGwWNGJdvx8' },
  { title: 'Cruel Summer', author: 'Taylor Swift', url: 'https://www.youtube.com/watch?v=ic8j13piAhQ' },
  { title: 'Feel Good Inc.', author: 'Gorillaz', url: 'https://www.youtube.com/watch?v=HyHNuVaZJ-k' },
  { title: 'Lofi Hip Hop Radio', author: 'Lofi Girl', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
  { title: 'Bohemian Rhapsody', author: 'Queen', url: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ' },
  { title: 'Smells Like Teen Spirit', author: 'Nirvana', url: 'https://www.youtube.com/watch?v=hTWKbfoikeg' },
  { title: 'In The End', author: 'Linkin Park', url: 'https://www.youtube.com/watch?v=eVTXPUF4Oz4' },
  { title: 'Flowers', author: 'Miley Cyrus', url: 'https://www.youtube.com/watch?v=G7KNmW9a75Y' },
  { title: 'Heat Waves', author: 'Glass Animals', url: 'https://www.youtube.com/watch?v=mRD0-GxqHVo' },
  { title: 'Stay', author: 'The Kid LAROI & Justin Bieber', url: 'https://www.youtube.com/watch?v=kTJczUoc26U' },
  { title: 'Montero', author: 'Lil Nas X', url: 'https://www.youtube.com/watch?v=6jw18VbNlB8' },
  { title: 'Watermelon Sugar', author: 'Harry Styles', url: 'https://www.youtube.com/watch?v=E07s5ZYygMg' }
];

const SAVED_TRACKS_KEY = 'jambot_saved_recommended_tracks';

function getSavedTracks(): Track[] {
  try {
    const raw = localStorage.getItem(SAVED_TRACKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveTrackToMemory(track: Track) {
  try {
    if (!track || !track.title || !track.author) return;
    const existing = getSavedTracks();
    const isDup = existing.some(t => t.title.toLowerCase() === track.title.toLowerCase());
    if (!isDup) {
      const updated = [{ title: track.title, author: track.author, url: track.url }, ...existing].slice(0, 40);
      localStorage.setItem(SAVED_TRACKS_KEY, JSON.stringify(updated));
    }
  } catch (e) {
    // Ignore storage errors
  }
}

function getRotatedRecommendations(count = 5): Track[] {
  const saved = getSavedTracks();
  const combined: Track[] = [...saved];
  BASE_RECOMMENDED_POOL.forEach(poolTrack => {
    if (!combined.some(t => t.title.toLowerCase() === poolTrack.title.toLowerCase())) {
      combined.push(poolTrack);
    }
  });

  const shuffled = [...combined].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

const Icons = {
  Play: () => <svg className="w-5 h-5 sm:w-6 sm:h-6 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>,
  Pause: () => <svg className="w-5 h-5 sm:w-6 sm:h-6 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>,
  SkipNext: () => <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>,
  Infinity: ({ active }: { active: boolean }) => (
    <svg className={`w-4 h-4 sm:w-5 sm:h-5 stroke-current transition-colors ${active ? 'text-indigo-400 font-bold' : 'text-gray-400 hover:text-white'}`} fill="none" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.178 8c5.096 0 5.096 8 0 8-2.548 0-4.077-2.133-5.607-4-1.53-1.867-3.059-4-5.606-4-5.096 0-5.096 8 0 8 2.547 0 4.076-2.133 5.606-4 1.53-1.867 3.059-4 5.607-4z" />
    </svg>
  ),
  Search: () => (
    <svg className="w-4 h-4 sm:w-5 sm:h-5 stroke-current" fill="none" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
    </svg>
  ),
  ListPlus: () => (
    <svg className="w-4 h-4 sm:w-5 sm:h-5 stroke-current" fill="none" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>
  ),
  Check: () => (
    <svg className="w-4 h-4 stroke-current text-emerald-400" fill="none" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
    </svg>
  ),
  Trash: () => (
    <svg className="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
    </svg>
  ),
  Discord: () => (
    <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 127.14 96.36">
      <path d="M107.7,8.07A105.15,107.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.89,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.42,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14c2.64-27.38-4.51-51.11-18.91-72.13ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.92,53.87,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.92,96.12,53,91.08,65.69,84.69,65.69Z"/>
    </svg>
  ),
  Lyrics: () => (
    <svg className="w-4 h-4 sm:w-5 sm:h-5 stroke-current" fill="none" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
    </svg>
  ),
  MusicNote: () => (
    <svg className="w-4 h-4 sm:w-5 sm:h-5 stroke-current" fill="none" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 .895-2 3-2 3 .895 3 2zm12 0c0 1.105-1.343 2-3 2s-3-.895-3-2 .895-2 3-2 3 .895 3 2zM9 10l12-3" />
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

  return <canvas ref={canvasRef} width={240} height={32} className="w-full h-8 opacity-85" />;
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
  const [isAutoplay, setIsAutoplay] = useState(false);
  const [progress, setProgress] = useState({ 
    current: { label: '0:00', value: 0 }, 
    total: { label: '0:00', value: 0 }, 
    progress: 0 
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [rightPanelTab, setRightPanelTab] = useState<'lyrics' | 'queue' | 'search'>('search');
  const [user, setUser] = useState<{ username: string; avatar: string }>(MOCK_USERS[0]);
  const [recommendedTracks, setRecommendedTracks] = useState<Track[]>(() => getRotatedRecommendations(5));

  // Toast / Feedback Notification State
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'warning' } | null>(null);
  const [addingTrackIndex, setAddingTrackIndex] = useState<number | null>(null);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 2800);
  };

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
        if (data.current) saveTrackToMemory(data.current);
        if (data.tracks && Array.isArray(data.tracks)) {
          data.tracks.forEach(t => saveTrackToMemory(t));
        }
      });

      sock.on('autoplay_state', (data: { guildId: string, isAutoplay: boolean }) => {
        if (data.guildId === currentGuildId) {
          setIsAutoplay(data.isAutoplay);
        }
      });

      // --- CAMBIO AUTOMÁTICO DE PESTAÑA SEGÚN LETRAS ---
      sock.on('song_lyrics', (text: string | null) => {
        if (text && text !== "No se encontraron letras" && text !== "No se encontraron letras para esta canción." && text !== "Buscando letras...") {
          setLyrics(text);
          setRightPanelTab('lyrics');
        } else if (text === "No se encontraron letras" || text === "No se encontraron letras para esta canción.") {
          setLyrics(null);
          setRightPanelTab('search');
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

  useEffect(() => {
    const interval = setInterval(() => {
      setRecommendedTracks(getRotatedRecommendations(5));
    }, 45000); // Rotar cada 45 segundos
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentTrack) {
      saveTrackToMemory(currentTrack);
    }
  }, [currentTrack]);

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

  const handlePlaySong = (songUrl?: string, itemIndex?: number, songTitle?: string) => {
    const query = songUrl || searchQuery;
    if (!query || !query.trim()) return;

    if (itemIndex !== undefined) {
      setAddingTrackIndex(itemIndex);
      setTimeout(() => setAddingTrackIndex(null), 1200);
    }

    if (socket && guildId && channelId) {
      socket.emit('play_song', { query, channelId, guildId, user });
      saveTrackToMemory({
        title: songTitle || query,
        author: 'Canción guardada',
        url: songUrl || query
      });
      showToast(`✨ Canción añadida: ${songTitle || 'Solicitud enviada'}`, 'success');
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  const handleNextTrack = () => {
    if (socket && guildId) {
      socket.emit('skip_song', { guildId });
      showToast('⏭️ Saltando a la siguiente canción...', 'info');
    }
  };

  const togglePause = () => {
    if (socket && guildId) {
      const nextState = !isPaused;
      socket.emit('set_pause', { guildId, paused: nextState });
      showToast(nextState ? '⏸️ Reproducción pausada' : '▶️ Reanudando reproducción', 'info');
    }
  };

  const toggleAutoplay = () => {
    if (socket && guildId) {
      const nextState = !isAutoplay;
      socket.emit('set_autoplay', { guildId, enabled: nextState });
      showToast(nextState ? '♾️ Radio Autoplay Activado: cargando sugerencias del bot...' : '⏹️ Radio Autoplay Desactivado', 'info');
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
      showToast(`🗑️ "${track.title}" eliminada de la cola`, 'warning');
    }
  };

  // Resultados de búsqueda
  const displayedSearchResults = searchResults.length > 0
    ? searchResults
    : (searchQuery.trim() !== ''
        ? recommendedTracks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.author.toLowerCase().includes(searchQuery.toLowerCase()))
        : recommendedTracks);

  return (
    <div className="relative h-screen w-full bg-[#0a0c12] text-gray-100 font-sans flex flex-col justify-between overflow-hidden select-none">
      
      {/* Background Ambient Glow */}
      {currentTrack?.thumbnail && (
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-15 filter blur-3xl scale-125 transition-all duration-1000 pointer-events-none"
          style={{ backgroundImage: `url(${currentTrack.thumbnail})` }}
        />
      )}

      {/* FLOATING TOAST FEEDBACK NOTIFICATION */}
      {toast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 animate-bounce pointer-events-none">
          <div className={`px-4 py-2 rounded-full backdrop-blur-xl border shadow-2xl flex items-center space-x-2 text-xs font-semibold transition-all ${
            toast.type === 'success' 
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
              : toast.type === 'warning'
              ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
              : 'bg-indigo-950/80 border-indigo-500/50 text-indigo-200'
          }`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-2 sm:py-2.5 bg-[#11131c]/90 border-b border-white/10 backdrop-blur-md">
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <div className="p-1.5 rounded-lg bg-indigo-600/30 text-indigo-400 border border-indigo-500/30">
            <Icons.Discord />
          </div>
          <h1 className="font-bold text-xs sm:text-sm md:text-base tracking-wide text-white">
            JamBot Player Activity
          </h1>
        </div>

        {/* Local Dev User Simulator Switcher */}
        {isMockMode && (
          <div className="flex items-center space-x-2 bg-black/40 px-2.5 py-1 rounded-full border border-white/10 text-xs">
            <span className="font-medium text-gray-400 hidden xs:inline text-[10px] sm:text-xs">Simular usuario:</span>
            <div className="flex space-x-1">
              {MOCK_USERS.map((u, idx) => {
                const isSelected = user.username === u.username;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setUser(u);
                      showToast(`👤 Usuario cambiado a: ${u.username}`, 'info');
                    }}
                    className={`transition-all duration-150 active:scale-90 rounded-full p-0.5 border ${
                      isSelected ? 'border-indigo-400 scale-105 shadow-md shadow-indigo-500/30' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                    title={`Simular como ${u.username}`}
                  >
                    <img src={u.avatar} alt={u.username} className="w-4 h-4 sm:w-5 sm:h-5 rounded-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Main Content Workspace (Resizes smoothly for 720p & low-height viewports) */}
      <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-12 overflow-y-auto md:overflow-hidden min-h-0">
        
        {/* LEFT COLUMN: Cover, Info & Canvas Visualizer */}
        <section className="md:col-span-5 lg:col-span-4 bg-[#0e111a]/80 backdrop-blur-lg border-b md:border-b-0 md:border-r border-white/10 p-3 sm:p-5 flex flex-col items-center justify-center overflow-hidden min-h-0">
          
          {currentTrack ? (
            <div className="w-full flex flex-col items-center my-auto space-y-2 sm:space-y-4">
              {/* Artwork Container */}
              <div className="relative group/art compact-art-size w-[clamp(110px,21vh,220px)] aspect-square">
                <div className={`absolute -inset-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur-xl transition-all duration-700 ${!isPaused ? 'opacity-40 scale-105' : 'opacity-10 scale-95'}`} />
                <img
                  src={currentTrack.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80'}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover rounded-xl shadow-2xl relative z-10 border border-white/10 transition-transform duration-300 hover:scale-[1.02]"
                />
              </div>

              {/* Song Meta */}
              <div className="text-center w-full px-2 space-y-0.5">
                <h2 className="text-base sm:text-lg md:text-xl font-bold text-white tracking-tight line-clamp-1">
                  {currentTrack.title}
                </h2>
                <p className="text-xs sm:text-sm text-indigo-300 font-medium line-clamp-1">
                  {currentTrack.author}
                </p>
                {currentTrack.requestedBy && (
                  <div className="inline-flex items-center space-x-1.5 pt-0.5 text-[10px] sm:text-xs text-gray-400">
                    <span>Pedida por</span>
                    {currentTrack.requestedBy.avatar ? (
                      <img src={currentTrack.requestedBy.avatar} className="w-3.5 h-3.5 rounded-full" alt="" />
                    ) : (
                      <span>👤</span>
                    )}
                    <span className="font-semibold text-gray-300">{currentTrack.requestedBy.username}</span>
                  </div>
                )}
              </div>

              {/* Audio Spectrum Visualizer */}
              <div className="w-full max-w-[180px] sm:max-w-[220px]">
                <AudioVisualizer isPlaying={!isPaused} />
              </div>
            </div>
          ) : (
            <div className="my-auto text-center space-y-2 opacity-60">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Icons.Play />
              </div>
              <h3 className="text-sm sm:text-base font-semibold text-white">Listo para reproducir</h3>
              <p className="text-[11px] sm:text-xs text-gray-400">Busca una canción o pega un enlace para comenzar</p>
            </div>
          )}

        </section>

        {/* RIGHT COLUMN: Live Lyrics / Queue / Search */}
        <section className="md:col-span-7 lg:col-span-8 bg-[#0a0c12]/60 backdrop-blur-lg flex flex-col overflow-hidden min-h-0">
          
          {/* Top Panel Controls / Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 sm:px-6 py-2 sm:py-2.5 bg-[#11131c]/50">
            <div className="flex space-x-1 bg-black/40 p-1 rounded-xl border border-white/10 w-full sm:w-auto justify-around sm:justify-start">
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
                    className={`flex items-center space-x-1.5 sm:space-x-2 py-1.5 px-3 sm:px-4 rounded-lg font-medium text-xs transition-all duration-150 active:scale-95 ${
                      active
                        ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30'
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
          <div className="flex-1 overflow-y-auto p-3 sm:p-5 relative">
            
            {/* TAB: LYRICS (Alineado al principio para ver el texto desde arriba) */}
            {rightPanelTab === 'lyrics' && (
              <div className="h-full flex flex-col justify-start items-center max-w-2xl mx-auto py-2 sm:py-4 overflow-y-auto">
                {lyrics ? (
                  <div className="w-full bg-black/30 border border-white/5 rounded-2xl p-4 sm:p-6 shadow-inner">
                    <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm md:text-base font-medium leading-relaxed text-indigo-200 text-center drop-shadow-[0_0_12px_rgba(129,140,248,0.4)]">
                      {lyrics}
                    </pre>
                  </div>
                ) : (
                  <div className="my-auto text-gray-500 text-xs sm:text-sm italic">
                    Cargando o buscando letras sincronizadas...
                  </div>
                )}
              </div>
            )}

            {/* TAB: QUEUE (Con insignia especial para sugerencias del Bot) */}
            {rightPanelTab === 'queue' && (
              <div className="space-y-2 max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    A continuación en la cola
                  </p>
                  {isAutoplay && (
                    <span className="text-[10px] sm:text-[11px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 flex items-center gap-1 font-medium">
                      <Icons.Infinity active={true} /> Modo Infinito Activo
                    </span>
                  )}
                </div>
                {queue.length > 0 ? (
                  queue.map((track, idx) => {
                    const isBotSuggested = track.isAutoplay || track.requestedBy?.username?.includes('bot') || track.requestedBy?.username?.includes('Radio');
                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2 sm:p-2.5 transition-all duration-200 border rounded-xl hover:bg-white/5 text-gray-300 group ${
                          isBotSuggested
                            ? 'bg-purple-950/20 border-purple-500/20'
                            : 'bg-black/30 border-white/5'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 sm:space-x-3 overflow-hidden">
                          <span className="w-4 text-center font-bold text-xs text-indigo-400 flex-shrink-0">
                            {idx + 1}
                          </span>
                          <img 
                            src={track.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80'} 
                            alt="" 
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg object-cover flex-shrink-0 border border-white/10" 
                          />
                          <div className="truncate">
                            <p className="text-xs sm:text-sm font-semibold text-gray-200 truncate">
                              {track.title}
                            </p>
                            <div className="flex items-center space-x-2 text-[10px] sm:text-xs text-gray-400">
                              <span>{track.author}</span>
                              {track.requestedBy && (
                                <span className={`text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full border truncate max-w-[140px] sm:max-w-none ${
                                  isBotSuggested
                                    ? 'text-purple-300 bg-purple-500/20 border-purple-500/30 font-semibold'
                                    : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
                                }`}>
                                  {isBotSuggested ? '🤖 Sugerida por el bot' : `Pedido por ${track.requestedBy.username}`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemoveFromQueue(idx, track)}
                          className="p-1.5 text-gray-400 hover:text-rose-400 transition-all duration-150 active:scale-90 rounded-lg hover:bg-rose-500/10 flex-shrink-0"
                          title="Quitar de la cola"
                        >
                          <Icons.Trash />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-10 text-gray-500 text-xs sm:text-sm">
                    No hay canciones en la cola. Usa la pestaña de búsqueda para añadir algunas.
                  </div>
                )}
              </div>
            )}

            {/* TAB: SEARCH */}
            {rightPanelTab === 'search' && (
              <div className="space-y-3 max-w-3xl mx-auto">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePlaySong(undefined, undefined, searchQuery)}
                      placeholder="Buscar canción, artista o pegar URL..."
                      className="w-full bg-black/40 border border-white/15 rounded-xl py-2 sm:py-2.5 pl-8 sm:pl-9 pr-3 text-xs sm:text-sm text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 transition"
                    />
                    <div className="absolute left-2.5 top-2.5 sm:top-3 text-gray-400">
                      <Icons.Search />
                    </div>
                  </div>
                  <button
                    onClick={() => handlePlaySong(undefined, undefined, searchQuery)}
                    disabled={!searchQuery.trim()}
                    className="px-4 sm:px-5 py-2 sm:py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-600/20"
                  >
                    Reproducir
                  </button>
                </div>

                <div className="space-y-1 mt-3">
                  <div className="flex items-center justify-between my-2">
                    <p className="text-[11px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {searchResults.length > 0 ? 'Resultados de búsqueda' : 'Canciones recomendadas'}
                    </p>
                    {searchResults.length === 0 && (
                      <button
                        onClick={() => {
                          setRecommendedTracks(getRotatedRecommendations(5));
                          showToast('🔄 Recomendaciones actualizadas', 'info');
                        }}
                        className="text-[10px] sm:text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center space-x-1 transition-all active:scale-95 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-full border border-indigo-500/20"
                        title="Rotar lista de recomendaciones"
                      >
                        <span>🔄</span>
                        <span>Cambiar</span>
                      </button>
                    )}
                  </div>
                  {displayedSearchResults.map((track, idx) => {
                    const isAdding = addingTrackIndex === idx;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 sm:p-2.5 hover:bg-white/5 border-b border-white/5 transition rounded-xl"
                      >
                        <div className="flex items-center space-x-2.5 sm:space-x-3 overflow-hidden">
                          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex-shrink-0">
                            <Icons.MusicNote />
                          </div>
                          <div className="truncate">
                            <p className="text-xs sm:text-sm font-semibold text-gray-200 truncate">{track.title}</p>
                            <p className="text-[10px] sm:text-xs text-gray-400 truncate">{track.author}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handlePlaySong(track.url || track.title, idx, track.title)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-all duration-150 active:scale-90 flex-shrink-0 ${
                            isAdding
                              ? 'bg-emerald-600/90 text-white'
                              : 'bg-indigo-600/80 hover:bg-indigo-600 text-white'
                          }`}
                        >
                          {isAdding ? <Icons.Check /> : <Icons.ListPlus />}
                          <span className="hidden xs:inline">{isAdding ? '¡Añadida!' : 'Añadir a la cola'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

        </section>

      </div>

      {/* Bottom Integrated Controls Bar (Con botón de Modo Infinito Autoplay) */}
      <footer className="relative z-20 bg-[#0d0f17]/95 border-t border-white/10 px-4 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-3 sm:gap-4">
        
        {/* Left Track Info */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 w-1/3 max-w-[160px] sm:max-w-[260px]">
          {currentTrack?.thumbnail && (
            <img
              src={currentTrack.thumbnail}
              alt=""
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg object-cover flex-shrink-0 border border-white/10"
            />
          )}
          <div className="truncate">
            <h4 className="text-xs sm:text-sm font-bold text-white truncate">{currentTrack?.title || 'Sin canción'}</h4>
            <p className="text-[10px] sm:text-[11px] text-gray-400 truncate">{currentTrack?.author || 'Selecciona una canción'}</p>
          </div>
        </div>

        {/* Center Controls & NON-INTERACTIVE Time Scrubber */}
        <div className="flex flex-col items-center justify-center flex-1 max-w-xl mx-auto space-y-1">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <button
              onClick={toggleAutoplay}
              className={`p-1.5 sm:p-2.5 rounded-full border transition-all duration-150 active:scale-90 flex items-center justify-center ${
                isAutoplay
                  ? 'bg-indigo-600/30 border-indigo-400 text-indigo-300 shadow-md shadow-indigo-500/20 scale-105'
                  : 'bg-transparent border-white/10 text-gray-400 hover:text-white hover:border-white/30'
              }`}
              title={isAutoplay ? 'Modo Infinito Activado (Canciones similares automáticas)' : 'Activar Radio Autoplay (Modo Infinito)'}
            >
              <Icons.Infinity active={isAutoplay} />
            </button>
            <button
              onClick={togglePause}
              className="p-1.5 sm:p-2.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 active:scale-90 transition-all duration-150 shadow-lg shadow-indigo-600/30"
              title={isPaused ? 'Reanudar' : 'Pausar'}
            >
              {isPaused ? <Icons.Play /> : <Icons.Pause />}
            </button>
            <button 
              onClick={handleNextTrack} 
              className="text-gray-300 hover:text-white transition-all duration-150 active:scale-90 p-1 sm:p-2 rounded-full hover:bg-white/10"
              title="Saltar canción"
            >
              <Icons.SkipNext />
            </button>
          </div>

          {/* Scrubber Visual (NO INTERACTUABLE) */}
          <div className="w-full flex items-center space-x-2 text-[10px] sm:text-[11px] text-gray-400 font-mono">
            <span>{progress.current.label}</span>
            <div className="relative flex-1 flex items-center h-1.5 bg-gray-700/60 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress.progress))}%` }}
              />
            </div>
            <span>{progress.total.label}</span>
          </div>
        </div>

        {/* Right Spacer */}
        <div className="w-1/3 max-w-[160px] sm:max-w-[260px] hidden xs:block pointer-events-none" />

      </footer>
    </div>
  );
}
