import { useEffect, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { io, Socket } from 'socket.io-client';
import { Music, Play, SkipForward, Search, ListMusic, Mic2 } from 'lucide-react';
import './App.css';

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || 'PON_TU_CLIENT_ID_AQUI';
const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

function App() {
  const [status, setStatus] = useState<string>('Conectando a Discord...');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [guildId, setGuildId] = useState<string | null>(null);
  const [query, setQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  
  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [queue, setQueue] = useState<any[]>([]);
  const [lyrics, setLyrics] = useState<string | null>(null);

  useEffect(() => {
    async function setupDiscord() {
      try {
        await discordSdk.ready();
        setStatus('✅ Conectado al Cliente');
        setChannelId(discordSdk.channelId);
        setGuildId(discordSdk.guildId);
        
        const newSocket = io(); 
        
        newSocket.on('connect', () => {
          setStatus('✅ Conectado');
          if (discordSdk.guildId) {
            newSocket.emit('get_queue', { guildId: discordSdk.guildId });
          }
        });
        newSocket.on('disconnect', () => setStatus('❌ Desconectado'));

        newSocket.on('queue_update', (data) => {
          setCurrentTrack(data.current);
          setQueue(data.tracks);
        });

        newSocket.on('song_lyrics', (text) => setLyrics(text));
        newSocket.on('search_results', (results) => setSuggestions(results));
        setSocket(newSocket);
      } catch (err) {
        setStatus('⚠️ Fuera de Discord');
      }
    }
    setupDiscord();
  }, []);

  const playSong = (songUrl?: string) => {
    const url = songUrl || query;
    if (url && socket && channelId && guildId) {
      socket.emit('play_song', { query: url, channelId, guildId });
      setQuery('');
      setSuggestions([]);
    }
  };

  const skipSong = () => {
    if (socket && guildId) {
      socket.emit('skip_song', { guildId });
    }
  };

  return (
    <div style={{ 
      padding: '30px', 
      fontFamily: 'Inter, system-ui, sans-serif', 
      background: '#121212', 
      minHeight: '100vh', 
      color: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '28px', fontWeight: '800', margin: '0 0 30px 0', color: '#1db954' }}>
        <Music size={32} /> JamBot Player
      </h1>
      
      {/* Buscador de Canciones */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '600px', margin: '0 auto 40px' }}>
        <div style={{ display: 'flex', background: '#242424', borderRadius: '50px', padding: '5px 5px 5px 20px', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
          <Search size={20} color="#b3b3b3" />
          <input 
            type="text" 
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.length > 2 && !e.target.value.startsWith('http')) {
                socket?.emit('search_song', { query: e.target.value });
              } else {
                setSuggestions([]);
              }
            }}
            placeholder="¿Qué quieres escuchar hoy? (Nombre o Enlace)"
            style={{ flex: 1, padding: '12px 15px', background: 'transparent', border: 'none', color: 'white', fontSize: '16px', outline: 'none' }}
          />
          <button 
            onClick={() => playSong()} 
            disabled={!query || !channelId} 
            style={{ 
              background: '#1db954', color: 'black', border: 'none', borderRadius: '50px', 
              padding: '12px 25px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px'
            }}>
            <Play size={18} fill="black" /> Play
          </button>
        </div>
        
        {/* Sugerencias de Búsqueda */}
        {suggestions.length > 0 && (
          <ul style={{ position: 'absolute', top: '65px', left: '20px', right: '20px', background: '#282828', borderRadius: '12px', padding: '10px 0', margin: '0', listStyle: 'none', textAlign: 'left', zIndex: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
            {suggestions.map((song, i) => (
              <li key={i} onClick={() => playSong(song.url)} style={{ padding: '12px 20px', borderBottom: i !== suggestions.length -1 ? '1px solid #333' : 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
                <strong style={{ color: '#fff', fontSize: '15px', marginBottom: '4px' }}>{song.title}</strong>
                <span style={{ color: '#b3b3b3', fontSize: '13px' }}>{song.author}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Contenedor Principal del Reproductor */}
      {currentTrack ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', justifyContent: 'center', width: '100%', maxWidth: '900px' }}>
          
          {/* Tarjeta del Reproductor */}
          <div style={{ background: 'linear-gradient(145deg, #242424, #181818)', padding: '30px', borderRadius: '24px', flex: '1', minWidth: '300px', maxWidth: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            
            {/* Disco de Vinilo CSS animado */}
            <div style={{ width: '220px', height: '220px', borderRadius: '50%', background: 'linear-gradient(135deg, #333, #111)', border: '8px solid #1db954', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '25px', animation: 'spin 8s linear infinite', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#1db954', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <Music size={30} color="#121212" />
              </div>
            </div>
            
            <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '800' }}>{currentTrack.title}</h2>
            <p style={{ margin: '0 0 25px 0', color: '#b3b3b3', fontSize: '16px' }}>{currentTrack.author}</p>
            
            <button onClick={skipSong} style={{ background: 'transparent', color: '#fff', border: '2px solid #b3b3b3', padding: '12px 30px', borderRadius: '50px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.borderColor = '#1db954'} onMouseOut={(e) => e.currentTarget.style.borderColor = '#b3b3b3'}>
              <SkipForward size={20} /> Saltar
            </button>
          </div>

          {/* Tarjeta de Letras / Cola */}
          <div style={{ flex: '1', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Cola de Reproducción */}
            <div style={{ background: '#181818', borderRadius: '24px', padding: '25px', flex: queue.length > 0 ? '1' : '0' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '18px' }}>
                <ListMusic size={20} color="#1db954" /> A continuación
              </h3>
              {queue.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {queue.slice(0, 4).map((t, i) => (
                    <div key={i} style={{ display: 'flex', gap: '15px', alignItems: 'center', background: '#242424', padding: '10px 15px', borderRadius: '12px' }}>
                      <span style={{ color: '#1db954', fontWeight: 'bold', fontSize: '14px' }}>{i + 1}</span>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '14px', fontWeight: '600' }}>{t.title}</div>
                        <div style={{ color: '#b3b3b3', fontSize: '12px' }}>{t.author}</div>
                      </div>
                    </div>
                  ))}
                  {queue.length > 4 && <p style={{ fontSize: '13px', color: '#b3b3b3', textAlign: 'center', margin: '5px 0 0' }}>+ {queue.length - 4} canciones en la cola</p>}
                </div>
              ) : (
                <p style={{ color: '#b3b3b3', fontSize: '14px', margin: 0 }}>No hay canciones en cola.</p>
              )}
            </div>

            {/* Letras */}
            {lyrics && (
              <div style={{ background: '#181818', borderRadius: '24px', padding: '25px', maxHeight: '400px', overflowY: 'auto' }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '18px', position: 'sticky', top: '-25px', background: '#181818', paddingBottom: '10px' }}>
                  <Mic2 size={20} color="#1db954" /> Letra Oficial
                </h3>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '15px', color: '#b3b3b3', lineHeight: '1.8', margin: 0 }}>
                  {lyrics}
                </pre>
              </div>
            )}
          </div>

        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#b3b3b3', opacity: 0.6 }}>
          <Music size={64} style={{ marginBottom: '20px' }} />
          <h2 style={{ margin: 0, fontWeight: 'normal' }}>Listo para la Jam</h2>
          <p>Busca tu canción favorita para comenzar.</p>
        </div>
      )}
      
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        /* Scrollbar styling for lyrics */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #555; }
      `}</style>
    </div>
  );
}

export default App;
