import { useEffect, useState, useRef } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { io, Socket } from 'socket.io-client';
import { 
  Music, Play, SkipForward, Search, ListMusic, Mic2, AlertCircle, 
  Pause, Trash2, X, Users, Wrench 
} from 'lucide-react';
import './App.css';

interface Track {
  title: string;
  author: string;
  url?: string;
  thumbnail?: string;
  requestedBy?: { username: string; avatar: string };
}

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || 'PON_TU_CLIENT_ID_AQUI';
const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

const MOCK_USERS = [
  { username: 'Rem (Tú)', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' },
  { username: 'Alex_DJ', avatar: 'https://cdn.discordapp.com/embed/avatars/1.png' },
  { username: 'Sara_Music', avatar: 'https://cdn.discordapp.com/embed/avatars/2.png' }
];

function App() {
  const [status, setStatus] = useState<string>('Conectando a Discord...');
  const [isMockMode, setIsMockMode] = useState<boolean>(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [guildId, setGuildId] = useState<string | null>(null);
  
  const [query, setQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<Track[]>([]);
  
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [user, setUser] = useState<{ username: string; avatar: string }>(MOCK_USERS[0]);

  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState({ 
    current: { label: '0:00', value: 0 }, 
    total: { label: '0:00', value: 0 }, 
    progress: 0 
  });

  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const currentQueryRef = useRef<string>('');

  // --- Cierre automático del buscador al hacer clic fuera o presionar Escape ---
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSuggestions([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    let newSocket: Socket | null = null;
    
    async function setupDiscord() {
      try {
        await discordSdk.ready();
        setStatus('✅ Conectado a Discord');
        setChannelId(discordSdk.channelId);
        setGuildId(discordSdk.guildId);

        const rlog = (msg: string) => {
          fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) }).catch(()=>null);
        };
        try {
          rlog("[Auth] Iniciando authorize con discordSdk...");
          const { code } = await discordSdk.commands.authorize({
            client_id: DISCORD_CLIENT_ID,
            response_type: "code",
            state: "",
            prompt: "none",
            scope: ["identify", "guilds"],
          });
          rlog(`[Auth] Código obtenido: ${code}`);
          
          rlog("[Auth] Solicitando token al backend en /api/token...");
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
        } catch (e: any) {
          rlog(`[Auth] Exception en authenticate: ${e.message || e}`);
        }
        
        newSocket = io();
        setupSocketListeners(newSocket, discordSdk.guildId);
      } catch (err) {
        // --- MODO DE PRUEBA LOCAL (FUERA DE DISCORD) ---
        console.log("No estamos dentro de un iframe de Discord. Activando Modo Prueba Local...");
        setIsMockMode(true);
        setStatus('🛠️ Modo de Prueba Local (Sin Discord)');
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

      sock.on('disconnect', () => setStatus('❌ Desconectado del Servidor'));

      sock.on('queue_update', (data: { current: Track | null, tracks: Track[] }) => {
        setCurrentTrack(data.current);
        setQueue(data.tracks);
      });

      sock.on('song_lyrics', (text: string | null) => setLyrics(text));
      
      sock.on('search_results', (results: Track[]) => {
        // Solo mostrar sugerencias si el texto actual en el input coincide y es largo suficiente
        if (currentQueryRef.current && currentQueryRef.current.trim().length > 2) {
          setSuggestions(results);
        } else {
          setSuggestions([]);
        }
      });
      
      sock.on('play_error', (data: { message: string }) => {
        setErrorMsg(data.message);
        setTimeout(() => setErrorMsg(null), 5000);
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
    setQuery(val);
    currentQueryRef.current = val;
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    
    if (val.trim().length > 2 && !val.startsWith('http')) {
      debounceTimeout.current = setTimeout(() => {
        socket?.emit('search_song', { query: val });
      }, 400); 
    } else {
      setSuggestions([]);
    }
  };

  const clearSearch = () => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    setQuery('');
    currentQueryRef.current = '';
    setSuggestions([]);
  };

  const playSong = (songUrl?: string) => {
    const url = songUrl || query;
    if (!url || !url.trim()) return;
    
    // Evitar que resultados pendientes del buscador abran la lista más tarde
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    
    if (!channelId || !guildId) {
      setErrorMsg("Debes unirte a un canal de voz de Discord para usar el bot.");
      setTimeout(() => setErrorMsg(null), 5000);
      return;
    }

    if (socket) {
      socket.emit('play_song', { query: url, channelId, guildId, user });
      clearSearch();
    }
  };

  const skipSong = () => {
    if (socket && guildId) {
      socket.emit('skip_song', { guildId });
    }
  };

  const togglePause = () => {
    if (socket && guildId) {
      // Usamos set_pause idempotente para evitar colisiones entre múltiples usuarios
      socket.emit('set_pause', { guildId, paused: !isPaused });
    }
  };

  const removeSongFromQueue = (index: number, song: Track) => {
    if (socket && guildId) {
      socket.emit('remove_song', {
        guildId,
        index,
        title: song.title,
        url: song.url
      });
    }
  };

  return (
    <div style={{ 
      padding: '30px 20px 60px', 
      fontFamily: 'Inter, system-ui, sans-serif', 
      background: currentTrack?.thumbnail ? 'transparent' : '#121212', 
      minHeight: '100vh', 
      color: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      position: 'relative',
      overflowX: 'hidden'
    }}>
      
      {currentTrack?.thumbnail && (
        <div className="background-blur" style={{ backgroundImage: `url(${currentTrack.thumbnail})` }} />
      )}

      {/* BARRA SUPERIOR MODO PRUEBA LOCAL (FUERA DE DISCORD) */}
      {isMockMode && (
        <div style={{
          width: '100%',
          maxWidth: '900px',
          background: 'rgba(29, 185, 84, 0.15)',
          border: '1px solid rgba(29, 185, 84, 0.4)',
          borderRadius: '16px',
          padding: '12px 20px',
          marginBottom: '25px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Wrench size={20} color="#1db954" />
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1db954' }}>
                Modo de Prueba Local (Sin Discord)
              </div>
              <div style={{ fontSize: '12px', color: '#b3b3b3' }}>
                Puedes probar multijugador cambiando de usuario o en múltiples pestañas
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={16} color="#b3b3b3" />
            <span style={{ fontSize: '12px', color: '#b3b3b3' }}>Simular usuario:</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {MOCK_USERS.map((u, i) => {
                const isSelected = user.username === u.username;
                return (
                  <button
                    key={i}
                    onClick={() => setUser(u)}
                    style={{
                      background: isSelected ? '#1db954' : '#282828',
                      color: isSelected ? '#000' : '#fff',
                      border: 'none',
                      borderRadius: '50px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {u.username}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', background: '#da373c', padding: '15px 25px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 100, animation: 'fadeIn 0.3s' }}>
          <AlertCircle size={24} /> {errorMsg}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
        <Music size={36} color="#1db954" />
        <h1 style={{ fontSize: '32px', fontWeight: '800', margin: '0', color: '#ffffff', letterSpacing: '-0.5px' }}>
          JamBot <span style={{ color: '#1db954' }}>Player</span>
        </h1>
      </div>

      {/* Estado de conexión */}
      <div style={{
        fontSize: '13px',
        color: status.includes('✅') || status.includes('🛠️') ? '#1db954' : '#ffaa00',
        background: 'rgba(255,255,255,0.06)',
        padding: '5px 14px',
        borderRadius: '50px',
        marginBottom: '25px',
        border: '1px solid rgba(255,255,255,0.08)'
      }}>
        {status}
      </div>
      
      {/* BUSCADOR DE CANCIONES (con soporte para clic fuera, Escape y botón limpiar) */}
      <div 
        ref={searchContainerRef}
        style={{ position: 'relative', width: '100%', maxWidth: '650px', margin: '0 auto 40px', zIndex: 50 }}
      >
        <div style={{ 
          display: 'flex', 
          background: 'rgba(36, 36, 36, 0.95)', 
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '50px', 
          padding: '6px 6px 6px 20px', 
          alignItems: 'center', 
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.3s'
        }}>
          <Search size={20} color="#1db954" />
          <input 
            type="text" 
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="¿Qué quieres escuchar hoy? (Nombre o Enlace YouTube)"
            style={{ flex: 1, padding: '12px 15px', background: 'transparent', border: 'none', color: 'white', fontSize: '16px', outline: 'none' }}
            onKeyDown={(e) => e.key === 'Enter' && playSong()}
          />
          {query && (
            <button
              onClick={clearSearch}
              title="Limpiar búsqueda"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#b3b3b3',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                marginRight: '6px',
                borderRadius: '50%'
              }}
            >
              <X size={18} />
            </button>
          )}
          <button 
            onClick={() => playSong()} 
            disabled={!query.trim()} 
            style={{ 
              background: '#1db954', color: '#000000', border: 'none', borderRadius: '50px', 
              padding: '12px 28px', cursor: !query.trim() ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px',
              opacity: (!query.trim()) ? 0.5 : 1,
              transition: 'all 0.2s',
              boxShadow: !query.trim() ? 'none' : '0 4px 15px rgba(29, 185, 84, 0.4)'
            }}>
            <Play size={18} fill="black" /> Play
          </button>
        </div>
        
        {/* LISTA DE SUGERENCIAS */}
        {suggestions.length > 0 && (
          <ul style={{ 
            position: 'absolute', 
            top: '65px', 
            left: '10px', 
            right: '10px', 
            background: 'rgba(32, 32, 32, 0.98)', 
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '16px', 
            padding: '8px 0', 
            margin: '0', 
            listStyle: 'none', 
            textAlign: 'left', 
            zIndex: 100, 
            boxShadow: '0 16px 40px rgba(0,0,0,0.8)',
            backdropFilter: 'blur(20px)',
            maxHeight: '320px',
            overflowY: 'auto'
          }}>
            {suggestions.map((song, i) => (
              <li 
                key={i} 
                onClick={() => playSong(song.url)} 
                style={{ 
                  padding: '12px 20px', 
                  borderBottom: i !== suggestions.length -1 ? '1px solid rgba(255,255,255,0.06)' : 'none', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(29, 185, 84, 0.15)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div style={{ color: '#fff', fontSize: '15px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {song.title}
                  </div>
                  <div style={{ color: '#b3b3b3', fontSize: '13px', marginTop: '3px' }}>
                    {song.author}
                  </div>
                </div>
                <div style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: '#1db954',
                  padding: '6px 14px',
                  borderRadius: '50px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0
                }}>
                  <Play size={12} fill="#1db954" /> Reproducir
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* CONTENEDOR PRINCIPAL DEL REPRODUCTOR */}
      {currentTrack ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', justifyContent: 'center', width: '100%', maxWidth: '950px' }}>
          
          {/* TARJETA DEL REPRODUCTOR */}
          <div style={{ 
            background: 'rgba(28, 28, 28, 0.85)', 
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(16px)',
            padding: '30px', 
            borderRadius: '24px', 
            flex: '1', 
            minWidth: '320px', 
            maxWidth: '420px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)' 
          }}>
            
            <div style={{ 
              width: '230px', 
              height: '230px', 
              borderRadius: '50%', 
              backgroundImage: currentTrack?.thumbnail ? `url(${currentTrack.thumbnail})` : 'linear-gradient(135deg, #333, #111)', 
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              border: '6px solid #1db954', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginBottom: '25px', 
              animation: isPaused ? 'none' : 'spin 8s linear infinite', 
              boxShadow: '0 12px 35px rgba(0,0,0,0.6)' 
            }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#121212', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #1db954' }}>
                 <Music size={22} color="#1db954" />
              </div>
            </div>
            
            <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '800' }}>{currentTrack.title}</h2>
            <p style={{ margin: '0 0 15px 0', color: '#b3b3b3', fontSize: '16px' }}>{currentTrack.author}</p>
            
            {currentTrack.requestedBy && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.08)', padding: '6px 16px', borderRadius: '50px', marginBottom: '25px' }}>
                {currentTrack.requestedBy.avatar ? (
                  <img src={currentTrack.requestedBy.avatar} alt="avatar" style={{ width: '22px', height: '22px', borderRadius: '50%' }} />
                ) : (
                  <span style={{ fontSize: '12px' }}>👤</span>
                )}
                <span style={{ fontSize: '13px', color: '#fff' }}>Pedido por <strong style={{ color: '#1db954' }}>{currentTrack.requestedBy.username}</strong></span>
              </div>
            )}

            {/* BARRA DE PROGRESO */}
            <div style={{ width: '100%', marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ width: '100%', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Math.max(0, progress.progress))}%`, height: '100%', background: '#1db954', transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#b3b3b3', fontWeight: 'bold' }}>
                <span>{progress.current.label}</span>
                <span>{progress.total.label}</span>
              </div>
            </div>

            {/* CONTROLES */}
            <div style={{ display: 'flex', gap: '15px' }}>
              <button 
                onClick={togglePause} 
                style={{ 
                  background: '#fff', color: '#000', border: 'none', padding: '14px 28px', borderRadius: '50px', 
                  cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', 
                  transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(255,255,255,0.2)' 
                }}>
                {isPaused ? <Play size={20} fill="#000" /> : <Pause size={20} fill="#000" />} {isPaused ? 'Reanudar' : 'Pausar'}
              </button>
              <button 
                onClick={skipSong} 
                style={{ 
                  background: 'transparent', color: '#fff', border: '2px solid #b3b3b3', padding: '14px 28px', borderRadius: '50px', 
                  cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', 
                  transition: 'all 0.2s' 
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#b3b3b3'; }}
              >
                <SkipForward size={20} /> Saltar
              </button>
            </div>
          </div>

          {/* TARJETA DE COLA Y LETRAS */}
          <div style={{ flex: '1', minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* COLA DE REPRODUCCIÓN (con botón para borrar de la lista) */}
            <div style={{ 
              background: 'rgba(28, 28, 28, 0.85)', 
              border: '1px solid rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(16px)',
              borderRadius: '24px', 
              padding: '25px', 
              flex: queue.length > 0 ? '1' : '0' 
            }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '18px' }}>
                <ListMusic size={20} color="#1db954" /> A continuación ({queue.length})
              </h3>
              {queue.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {queue.slice(0, 10).map((t, i) => (
                    <div 
                      key={i} 
                      style={{ 
                        display: 'flex', 
                        gap: '15px', 
                        alignItems: 'center', 
                        background: 'rgba(36, 36, 36, 0.7)', 
                        padding: '10px 15px', 
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.04)',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(45, 45, 45, 0.9)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(36, 36, 36, 0.7)'; }}
                    >
                      <span style={{ color: '#1db954', fontWeight: 'bold', fontSize: '14px', width: '18px' }}>{i + 1}</span>
                      <div style={{ overflow: 'hidden', flex: 1 }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '14px', fontWeight: '600' }}>{t.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '3px' }}>
                          <span style={{ color: '#b3b3b3', fontSize: '12px' }}>{t.author}</span>
                          {t.requestedBy && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(29, 185, 84, 0.15)', border: '1px solid rgba(29, 185, 84, 0.3)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', color: '#1db954' }}>
                              {t.requestedBy.avatar ? (
                                <img src={t.requestedBy.avatar} alt="avatar" style={{ width: '14px', height: '14px', borderRadius: '50%' }} />
                              ) : (
                                <span style={{ fontSize: '10px' }}>👤</span>
                              )}
                              <span>Pedido por <strong>{t.requestedBy.username}</strong></span>
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Botón Borrar de la Lista (sincronizado para múltiples usuarios) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSongFromQueue(i, t);
                        }}
                        title="Eliminar de la cola"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#888',
                          cursor: 'pointer',
                          padding: '8px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#ff5555';
                          e.currentTarget.style.background = 'rgba(255, 85, 85, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#888';
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  {queue.length > 10 && (
                    <p style={{ fontSize: '13px', color: '#b3b3b3', textAlign: 'center', margin: '5px 0 0' }}>
                      + {queue.length - 10} canciones más en la cola
                    </p>
                  )}
                </div>
              ) : (
                <p style={{ color: '#b3b3b3', fontSize: '14px', margin: 0 }}>No hay canciones en cola.</p>
              )}
            </div>

            {/* LETRAS */}
            {lyrics && (
              <div style={{ 
                background: 'rgba(28, 28, 28, 0.85)', 
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(16px)',
                borderRadius: '24px', 
                padding: '25px', 
                maxHeight: '380px', 
                overflowY: 'auto' 
              }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '18px', position: 'sticky', top: '-25px', background: '#1c1c1c', paddingBottom: '10px', zIndex: 5 }}>
                  <Mic2 size={20} color="#1db954" /> Letra Oficial
                </h3>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '16px', fontWeight: 500, textAlign: 'center', color: '#b3b3b3', lineHeight: '1.8', margin: 0 }}>
                  {lyrics}
                </pre>
              </div>
            )}
          </div>

        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#b3b3b3', opacity: 0.7, margin: '60px 0' }}>
          <Music size={72} style={{ marginBottom: '20px', color: '#1db954' }} />
          <h2 style={{ margin: '0 0 8px 0', fontWeight: '700', fontSize: '26px', color: '#fff' }}>Listo para la Jam</h2>
          <p style={{ fontSize: '16px', color: '#aaa' }}>Busca tu canción favorita o pega un link para comenzar.</p>
        </div>
      )}

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #555; }
      `}</style>
    </div>
  );
}

export default App;
