import React, { useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, GeoJsonLayer } from '@deck.gl/layers';
import { Map } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

// GeoServer WFS endpoints
const FLORIDA_TRACTS_WFS = 'https://geoserver.nexavision.tech/geoserver/nexavision/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=nexavision:florida_tracts_demographics&outputFormat=application%2Fjson';
const FORBES_WFS = 'https://geoserver.nexavision.tech/geoserver/nexavision/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=nexavision:forbes_400&outputFormat=application%2Fjson';
const CONGRESSIONAL_WFS = 'https://geoserver.nexavision.tech/geoserver/nexavision/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=nexavision:congressional_districts&outputFormat=application%2Fjson';
const POIS_WFS = 'https://geoserver.nexavision.tech/geoserver/nexavision/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=nexavision:florida_pois&outputFormat=application%2Fjson';
const GLOBAL_COUNTRIES_WFS = 'https://geoserver.nexavision.tech/geoserver/nexavision/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=nexavision:global_countries_10m&outputFormat=application%2Fjson';

const INITIAL_VIEW_STATE = {
  longitude: -81.5,
  latitude: 27.5,
  zoom: 5.5,
  pitch: 30,
  bearing: 0
};

// Vibe: "simple earth green vibe" - Organic, calm colors
const COLORS = {
  BORDER: [143, 188, 143, 150], // DarkSeaGreen
  CONFLICT: [255, 165, 0], // Orange pulse (less aggressive than neon red)
  POIS: [173, 216, 230, 255], // LightBlue for civic buildings
  FORBES: [255, 215, 0, 200], // Gold for wealth
};

// CSS Injection for HUD & Animations
const injectedStyles = `
  @keyframes pulse {
    0% { transform: scale(1); opacity: 0.8; box-shadow: 0 0 10px #ff1414; }
    50% { transform: scale(1.5); opacity: 0.3; box-shadow: 0 0 30px #ff1414; }
    100% { transform: scale(1); opacity: 0.8; box-shadow: 0 0 10px #ff1414; }
  }

  .null-hud-button {
    background: transparent;
    border: none;
    color: #8fbc8f;
    font-family: monospace;
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    transition: color 0.2s;
  }
  .null-hud-button:hover {
    color: #aaffaa;
  }
  
  .null-panel {
    position: absolute;
    top: 0;
    left: 0;
    height: 100vh;
    width: 350px;
    background: rgba(10, 20, 15, 0.85);
    backdrop-filter: blur(10px);
    border-right: 1px solid rgba(143, 188, 143, 0.3);
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 20;
    color: #8fbc8f;
    font-family: monospace;
    padding: 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .null-panel.open {
    transform: translateX(0);
  }
  
  .osint-panel {
    position: absolute;
    top: 0;
    right: 0;
    height: 100vh;
    width: 400px;
    background: rgba(10, 20, 15, 0.95);
    backdrop-filter: blur(10px);
    border-left: 1px solid rgba(143, 188, 143, 0.4);
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 20;
    color: #8fbc8f;
    font-family: monospace;
    padding: 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  .osint-panel.open {
    transform: translateX(0);
  }
  
  .osint-input {
    background: transparent;
    border: 1px solid rgba(143, 188, 143, 0.5);
    color: #8fbc8f;
    padding: 10px;
    width: 100%;
    font-family: monospace;
    margin-bottom: 10px;
    box-sizing: border-box;
  }
  
  .osint-btn {
    background: rgba(143, 188, 143, 0.2);
    border: 1px solid #8fbc8f;
    color: #8fbc8f;
    padding: 8px 15px;
    cursor: pointer;
    font-family: monospace;
    transition: all 0.2s;
  }
  .osint-btn:hover {
    background: rgba(143, 188, 143, 0.4);
  }

  .hud-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 15px;
    font-size: 1rem;
    border-bottom: 1px solid rgba(143, 188, 143, 0.1);
    padding-bottom: 10px;
  }

  .seed-panel {
    position: absolute;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(10, 20, 15, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 215, 0, 0.5);
    border-radius: 4px;
    padding: 15px;
    z-index: 20;
    color: #8fbc8f;
    font-family: monospace;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 300px;
    box-shadow: 0 0 15px rgba(255, 215, 0, 0.2);
  }
  
  .seed-input {
    background: rgba(0,0,0,0.5);
    border: 1px solid rgba(255, 215, 0, 0.5);
    color: #ffd700;
    padding: 8px;
    font-family: monospace;
    margin: 10px 0;
    width: 100%;
    text-align: center;
    box-sizing: border-box;
  }
  
  .seed-input:focus {
    outline: none;
    border-color: #ffd700;
    box-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
  }
  
  .seed-btn {
    background: rgba(255, 215, 0, 0.1);
    border: 1px solid #ffd700;
    color: #ffd700;
    padding: 8px 20px;
    cursor: pointer;
    font-family: monospace;
    transition: all 0.2s;
    width: 100%;
  }
  
  .seed-btn:hover {
    background: rgba(255, 215, 0, 0.3);
  }

  .hud-label {
    opacity: 0.6;
  }
`;

export default function App() {
  const [hoverInfo, setHoverInfo] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [floridaData, setFloridaData] = useState(null);
  const [forbesData, setForbesData] = useState(null);
  const [congressData, setCongressData] = useState(null);
  const [poisData, setPoisData] = useState(null);
  const [globalData, setGlobalData] = useState(null);
  
  // OSINT & Feed Mixer State
  const [osintOpen, setOsintOpen] = useState(false);
  const [feedQueue, setFeedQueue] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [osintUrl, setOsintUrl] = useState('https://tigerweb.geo.census.gov/ArcGIS/rest/services/TIGERweb/tigerWMS_Current/MapServer');
  const [osintMetadata, setOsintMetadata] = useState(null);
  const [osintLayers, setOsintLayers] = useState([]);
  const [selectedOsintLayer, setSelectedOsintLayer] = useState(null);
  const [osintData, setOsintData] = useState(null);
  const [osintLoading, setOsintLoading] = useState(false);
  
  // Fetch pending events from API when Feed Mixer opens
  useEffect(() => {
    if (osintOpen) {
      setFeedLoading(true);
      fetch('http://localhost:3001/api/queue/pending')
        .then(res => res.json())
        .then(data => {
           if (Array.isArray(data)) setFeedQueue(data);
           setFeedLoading(false);
        })
        .catch(err => {
           console.error("Failed to fetch queue", err);
           setFeedLoading(false);
        });
    }
  }, [osintOpen]);
  
  // HUD toggles
  const [showForbes, setShowForbes] = useState(true);
  const [showCongress, setShowCongress] = useState(false);
  const [showPois, setShowPois] = useState(true);
  const [showFlorida, setShowFlorida] = useState(true);
  const [showGlobal, setShowGlobal] = useState(true);

  // Settings State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  // Fetch settings on mount
  useEffect(() => {
    fetch('http://localhost:3001/api/user/settings?user_id=default_user')
      .then(res => res.json())
      .then(data => {
        if (data.youtube_api_key) {
          setYoutubeApiKey(data.youtube_api_key);
        }
      })
      .catch(err => console.error('Failed to fetch settings:', err));
  }, []);

  const saveSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'default_user', youtube_api_key: youtubeApiKey })
      });
      if (res.ok) {
        setSettingsMessage('Settings saved successfully!');
        setTimeout(() => setSettingsMessage(''), 3000);
      } else {
        setSettingsMessage('ERROR: Failed to save settings.');
      }
    } catch (err) {
      setSettingsMessage('ERROR: ' + err.message);
    }
    setSettingsLoading(false);
  };

  const [seedCik, setSeedCik] = useState('');
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedMessage, setSeedMessage] = useState('');

  
  const [time, setTime] = useState(0);


  const handleSeedInject = async () => {
    if (!seedCik) return;
    setSeedLoading(true);
    setSeedMessage('Injecting CIK to pipeline...');
    
    // In a real implementation, this would hit a backend endpoint
    // that adds the CIK to the monitored_people table and triggers the DAG.
    // For now, we simulate the network request and update the UI.
    setTimeout(() => {
      setSeedMessage('SEED ACQUIRED. PIPELINE TRIGGERED.');
      setSeedCik('');
      setTimeout(() => setSeedMessage(''), 4000);
      setSeedLoading(false);
    }, 1500);
  };

  // Fetch GeoServer data manually to pass credentials (for Authentik)
  useEffect(() => {
    const fetchWFS = async (url, setter) => {
      try {
        const response = await fetch(url, { credentials: 'include' });
        if (response.ok) {
          const json = await response.json();
          setter(json);
        }
      } catch (err) {
        console.error("Failed to fetch WFS:", err);
      }
    };
    fetchWFS(FLORIDA_TRACTS_WFS, setFloridaData);
    fetchWFS(FORBES_WFS, setForbesData);
    fetchWFS(CONGRESSIONAL_WFS, setCongressData);
    fetchWFS(POIS_WFS, setPoisData);
    fetchWFS(GLOBAL_COUNTRIES_WFS, setGlobalData);
  }, []);

  // OSINT Fetch Metadata
  const fetchOsintMetadata = async () => {
    if (!osintUrl) return;
    setOsintLoading(true);
    try {
      const url = new URL(osintUrl);
      url.searchParams.set('f', 'json');
      const res = await fetch(url.toString());
      const data = await res.json();
      setOsintMetadata({
        description: data.description,
        copyright: data.copyrightText,
        mapName: data.mapName
      });
      setOsintLayers(data.layers || []);
    } catch (err) {
      console.error("OSINT Metadata Fetch Failed", err);
    }
    setOsintLoading(false);
  };

  // OSINT Fetch Layer Data
  const loadOsintLayer = async (layerId) => {
    setSelectedOsintLayer(layerId);
    setOsintLoading(true);
    try {
      // Query endpoint to get GeoJSON preview (first 500 records)
      const url = `${osintUrl}/${layerId}/query?where=1=1&outFields=*&f=geojson&resultRecordCount=500`;
      const res = await fetch(url);
      const data = await res.json();
      setOsintData(data);
    } catch (err) {
      console.error("OSINT Layer Fetch Failed", err);
    }
    setOsintLoading(false);
  };

  // Animation loop for throbbing dots
  useEffect(() => {
    let animationId;
    const animate = () => {
      setTime(Date.now() / 1000); // Time in seconds
      animationId = requestAnimationFrame(animate);
    };
    animate();
    
    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.innerHTML = injectedStyles;
    document.head.appendChild(styleEl);

    return () => {
      cancelAnimationFrame(animationId);
      document.head.removeChild(styleEl);
    };
  }, []);

  // "earth pains zones"
  const TARGET_ZONES = [
    { name: "Gaza Strip", coordinates: [34.4668, 31.5017], type: "CONFLICT_ZONE" },
    { name: "Myanmar", coordinates: [95.9560, 21.9162], type: "CONFLICT_ZONE" },
    { name: "Sudan", coordinates: [30.2176, 12.8628], type: "CONFLICT_ZONE" },
    { name: "Ukraine", coordinates: [31.1656, 48.3794], type: "CONFLICT_ZONE" },
  ];

  // Calculate throbbing radius based on time (sin wave)
  const throb = (Math.sin(time * 3) + 1) / 2; // 0 to 1

  const layers = [
    osintData && new GeoJsonLayer({
      id: 'osint-preview-layer',
      data: osintData,
      stroked: true,
      filled: true,
      lineWidthMinPixels: 2,
      getLineColor: [255, 0, 255, 200], // Magenta for OSINT recon
      getFillColor: [255, 0, 255, 50],
      pickable: true,
      onHover: info => setHoverInfo(info)
    }),
    showGlobal && new GeoJsonLayer({
      id: 'global-countries-layer',
      data: globalData,
      stroked: true,
      filled: true,
      lineWidthMinPixels: 1,
      getLineColor: COLORS.BORDER,
      getFillColor: d => {
        const gdp = d.properties.gdp_md_est || 0;
        // Normalize GDP somewhat arbitrarily for color scaling (cap at 20M)
        const normalized = Math.min(gdp / 20000000, 1);
        return [30 + (normalized * 20), 80 + (normalized * 50), 60 + (normalized * 30), 150]; 
      },
      pickable: true,
      onHover: info => setHoverInfo(info)
    }),
    showCongress && new GeoJsonLayer({
      id: 'congressional-layer',
      data: congressData,
      stroked: true,
      filled: false,
      lineWidthMinPixels: 1.5,
      getLineColor: [0, 150, 255, 100], // subtle blue neon
      pickable: true,
      onHover: info => setHoverInfo(info)
    }),
    showFlorida && new GeoJsonLayer({
      id: 'florida-tracts-layer',
      data: floridaData,
      stroked: true,
      filled: true,
      lineWidthMinPixels: 1,
      getLineColor: COLORS.BORDER,
      getFillColor: d => {
        const income = d.properties.median_income || 0;
        const normalized = Math.min(income / 120000, 1);
        // Soft organic greens: #2E8B57 (SeaGreen) gradient
        return [46, 139 - (normalized * 50), 87, 180]; 
      },
      pickable: true,
      onHover: info => setHoverInfo(info)
    }),
    showFlorida && new GeoJsonLayer({
      id: 'conflict-hotspots-layer',
      data: floridaData,
      stroked: false,
      filled: true,
      getFillColor: d => {
        const conflict = d.properties.conflict_index || 0;
        if (conflict < 95) return [0, 0, 0, 0];
        return [COLORS.CONFLICT[0], COLORS.CONFLICT[1] + (throb * 50), COLORS.CONFLICT[2], 150 + (throb * 100)];
      },
      updateTriggers: {
        getFillColor: [time]
      }
    }),
    showPois && new ScatterplotLayer({
      id: 'pois-layer',
      data: poisData?.features || [],
      getPosition: d => d.geometry.coordinates,
      getFillColor: COLORS.POIS,
      getRadius: 1000,
      radiusMinPixels: 3,
      pickable: true,
      onHover: info => setHoverInfo(info)
    }),
    showForbes && new ScatterplotLayer({
      id: 'forbes-layer',
      data: forbesData?.features || [],
      getPosition: d => d.geometry.coordinates,
      getFillColor: [COLORS.FORBES[0], COLORS.FORBES[1], COLORS.FORBES[2], 150 + (throb * 105)],
      getRadius: 8000,
      radiusMinPixels: 6,
      radiusMaxPixels: 20,
      pickable: true,
      updateTriggers: {
        getFillColor: [time]
      },
      onHover: info => setHoverInfo(info)
    })
  ].filter(Boolean);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
      >
        <Map mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" />
      </DeckGL>

      {/* Earth Button (Bottom Left) */}
      <div style={{ position: 'absolute', bottom: '30px', left: '30px', zIndex: 30 }}>
        <button 
          className="null-hud-button" 
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span>earth</span>
          <span style={{ marginLeft: '10px', fontSize: '1.2em' }}>≡</span>
        </button>
      </div>

      {/* OSINT / FEED MIXER Button (Bottom Right) */}
      <div style={{ position: 'absolute', bottom: '30px', right: '30px', zIndex: 30 }}>
        <button 
          className="null-hud-button" 
          onClick={() => setOsintOpen(!osintOpen)}
        >
          <span style={{ marginRight: '10px', fontSize: '1.2em' }}>⌖</span>
          <span>feed_mixer</span>
        </button>
      </div>

      {/* Settings Button (Top Right) */}
      <div style={{ position: 'absolute', top: '30px', right: '30px', zIndex: 30 }}>
        <button 
          className="null-hud-button" 
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <span style={{ marginRight: '10px', fontSize: '1.2em' }}>⚙</span>
          <span>settings</span>
        </button>
      </div>

      {/* Settings Panel */}
      {settingsOpen && (
        <div className="seed-panel" style={{ top: '80px', bottom: 'auto', right: '30px', left: 'auto', transform: 'none' }}>
          <h3 style={{ margin: '0 0 5px 0', color: '#ffd700', letterSpacing: '2px', fontSize: '1rem' }}>USER SETTINGS</h3>
          <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.7 }}>Manage your API Keys & Session State</p>
          
          <div style={{ width: '100%', marginTop: '15px' }}>
            <label style={{ fontSize: '0.75rem', color: '#8fbc8f' }}>YouTube Data API v3 Key:</label>
            <input 
              className="seed-input" 
              type="password"
              value={youtubeApiKey}
              onChange={(e) => setYoutubeApiKey(e.target.value)}
              placeholder="AIzaSy..."
            />
          </div>
          
          <button 
            className="seed-btn" 
            onClick={saveSettings}
            disabled={settingsLoading}
            style={{ marginTop: '10px' }}
          >
            {settingsLoading ? 'SAVING...' : 'SAVE SETTINGS'}
          </button>
          
          {settingsMessage && (
            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: settingsMessage.includes('ERROR') ? '#ff4444' : '#00ff00' }}>
              {settingsMessage}
            </div>
          )}
        </div>
      )}


      {/* Target Seed Injection Panel */}
      <div className="seed-panel">
        <h3 style={{ margin: '0 0 5px 0', color: '#ffd700', letterSpacing: '2px', fontSize: '1rem' }}>TARGET INJECTION</h3>
        <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.7 }}>Enter SEC CIK to begin entity tracking</p>
        
        <input 
          className="seed-input" 
          value={seedCik}
          onChange={(e) => setSeedCik(e.target.value)}
          placeholder="e.g. 0001018724"
        />
        
        <button 
          className="seed-btn" 
          onClick={handleSeedInject}
          disabled={seedLoading}
        >
          {seedLoading ? 'PROCESSING...' : 'INITIALIZE TRACE'}
        </button>
        
        {seedMessage && (
          <div style={{ marginTop: '10px', fontSize: '0.75rem', color: seedMessage.includes('ERROR') ? '#ff4444' : '#00ff00' }}>
            {seedMessage}
          </div>
        )}
      </div>

      {/* Sliding HUD Menu */}
      <div className={`null-panel ${menuOpen ? 'open' : ''}`}>
        <h1 style={{ margin: '0 0 30px 0', fontSize: '2rem', fontWeight: 'normal', letterSpacing: '2px' }}>NEXA ATLAS</h1>
        
        <div className="hud-row">
          <span className="hud-label"><span style={{color: '#ffd700'}}>τ</span> Global Wealth (GDP)</span>
          <button style={{background:'transparent', color: showGlobal ? '#8fbc8f' : '#555', border:'1px solid', cursor:'pointer'}} onClick={() => setShowGlobal(!showGlobal)}>{showGlobal ? 'ON' : 'OFF'}</button>
        </div>
        <div className="hud-row">
          <span className="hud-label"><span style={{color: '#ffd700'}}>👤</span> Forbes 400 Layer</span>
          <button style={{background:'transparent', color: showForbes ? '#8fbc8f' : '#555', border:'1px solid', cursor:'pointer'}} onClick={() => setShowForbes(!showForbes)}>{showForbes ? 'ON' : 'OFF'}</button>
        </div>
        <div className="hud-row">
          <span className="hud-label"><span style={{color: '#ffd700'}}>⌖</span> Civic POIs (Townhalls)</span>
          <button style={{background:'transparent', color: showPois ? '#8fbc8f' : '#555', border:'1px solid', cursor:'pointer'}} onClick={() => setShowPois(!showPois)}>{showPois ? 'ON' : 'OFF'}</button>
        </div>
        <div className="hud-row">
          <span className="hud-label"><span style={{color: '#ffd700'}}>⌖</span> Congressional Districts</span>
          <button style={{background:'transparent', color: showCongress ? '#8fbc8f' : '#555', border:'1px solid', cursor:'pointer'}} onClick={() => setShowCongress(!showCongress)}>{showCongress ? 'ON' : 'OFF'}</button>
        </div>
        <div className="hud-row">
          <span className="hud-label"><span style={{color: '#ffd700'}}>τ</span> Florida Demographics</span>
          <button style={{background:'transparent', color: showFlorida ? '#8fbc8f' : '#555', border:'1px solid', cursor:'pointer'}} onClick={() => setShowFlorida(!showFlorida)}>{showFlorida ? 'ON' : 'OFF'}</button>
        </div>
        
        <div style={{ marginTop: 'auto', opacity: 0.5, fontSize: '0.8rem' }}>
          v2.0.0-rc2 // Eco Intelligence
        </div>
      </div>

      {/* Sliding FEED MIXER / OSINT Panel */}
      <div className={`osint-panel ${osintOpen ? 'open' : ''}`}>
        <button 
          onClick={() => setOsintOpen(false)}
          style={{
            position: 'absolute', top: '10px', right: '10px', background: 'transparent',
            border: 'none', color: '#ff4444', fontSize: '1.5rem', cursor: 'pointer'
          }}
        >
          ×
        </button>
        <h2 style={{ marginTop: 0, borderBottom: '1px solid', paddingBottom: '10px' }}>FEED MIXER & RECON</h2>
        
        {/* Human Analyst Review Queue */}
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#ffb347' }}>ANALYST REVIEW QUEUE</h3>
          {feedLoading ? (
            <div style={{ opacity: 0.7 }}>Loading pending events...</div>
          ) : feedQueue.length === 0 ? (
            <div style={{ opacity: 0.5, fontStyle: 'italic' }}>Queue is empty.</div>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid rgba(143,188,143,0.3)', padding: '10px', background: 'rgba(0,0,0,0.5)' }}>
              {feedQueue.map(item => (
                <div key={item.id} style={{ marginBottom: '15px', borderBottom: '1px dashed rgba(255,255,255,0.2)', paddingBottom: '10px' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{item.raw_title}</div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.8, margin: '5px 0' }}>
                    <span style={{ color: '#ffb347' }}>Subject:</span> {item.extracted_subject} <br/>
                    <span style={{ color: '#ffb347' }}>Predicate:</span> {item.extracted_predicate}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <a href={item.source_url} target="_blank" rel="noreferrer" style={{ color: '#8fbc8f', fontSize: '0.75rem' }}>[Source]</a>
                    <button className="osint-btn" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>Approve</button>
                    <button className="osint-btn" style={{ fontSize: '0.7rem', padding: '2px 8px', borderColor: '#ff4444', color: '#ff4444' }}>Discard</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <h3 style={{ margin: '0 0 10px 0' }}>OSINT ENDPOINT INTERROGATOR</h3>
        <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>Paste any ArcGIS REST Endpoint to dynamically preview and analyze spatial metadata linkages.</p>
        
        <input 
          className="osint-input" 
          value={osintUrl} 
          onChange={(e) => setOsintUrl(e.target.value)}
          placeholder="https://.../MapServer"
        />
        <button className="osint-btn" onClick={fetchOsintMetadata}>
          {osintLoading ? 'SCANNING...' : 'INTERROGATE ENDPOINT'}
        </button>

        {osintMetadata && (
          <div style={{ marginTop: '20px', fontSize: '0.9rem', background: 'rgba(0,0,0,0.3)', padding: '10px' }}>
            <strong style={{color: '#fff'}}>{osintMetadata.mapName}</strong>
            <p style={{ margin: '10px 0' }}>{osintMetadata.description?.substring(0, 150)}...</p>
            <div style={{ fontSize: '0.7rem', color: '#ffb347' }}>
              <strong>SOURCE (CYA):</strong> {osintMetadata.copyright || 'No copyright explicitly provided by source.'}
            </div>
          </div>
        )}

        {osintLayers.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <h3>AVAILABLE LAYERS</h3>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {osintLayers.map(l => (
                <div 
                  key={l.id} 
                  style={{ 
                    padding: '8px', 
                    cursor: 'pointer', 
                    borderBottom: '1px solid rgba(143,188,143,0.2)',
                    background: selectedOsintLayer === l.id ? 'rgba(143,188,143,0.2)' : 'transparent'
                  }}
                  onClick={() => loadOsintLayer(l.id)}
                >
                  <span style={{opacity: 0.5, marginRight: '10px'}}>#{l.id}</span>
                  {l.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Map Tooltip */}
      {hoverInfo.object && hoverInfo.object.properties && (
        <div style={{
          position: 'absolute',
          zIndex: 1,
          pointerEvents: 'none',
          left: hoverInfo.x + 15,
          top: hoverInfo.y - 15,
          color: '#8fbc8f',
          fontFamily: 'monospace',
          fontSize: '1rem',
          background: 'rgba(10, 20, 15, 0.95)',
          padding: '10px',
          border: '1px solid #8fbc8f',
          borderRadius: '4px'
        }}>
          {hoverInfo.object.properties.net_worth && (
            <>
              <strong>{hoverInfo.object.properties.name}</strong><br/>
              Rank: #{hoverInfo.object.properties.rank}<br/>
              Worth: ${hoverInfo.object.properties.net_worth / 1000000000}B<br/>
              Industry: {hoverInfo.object.properties.industry}
            </>
          )}
          {hoverInfo.object.properties.admin && (
            <>
              <strong>{hoverInfo.object.properties.admin}</strong><br/>
              Continent: {hoverInfo.object.properties.continent}<br/>
              Est. GDP: ${Math.round(hoverInfo.object.properties.gdp_md_est / 1000)}B<br/>
              Est. Pop: {(hoverInfo.object.properties.pop_est / 1000000).toFixed(1)}M
            </>
          )}
          {hoverInfo.object.properties.tract_name && (
            <>
              <strong>{hoverInfo.object.properties.tract_name}</strong><br/>
              Pop: {hoverInfo.object.properties.total_population}<br/>
              Income: ${hoverInfo.object.properties.median_income}<br/>
              Conflict Index: {Math.round(hoverInfo.object.properties.conflict_index)}
            </>
          )}
          {hoverInfo.object.properties.cd118fp && (
            <>
              <strong>Congressional District {hoverInfo.object.properties.cd118fp}</strong><br/>
              State FIPS: {hoverInfo.object.properties.statefp}
            </>
          )}
          {hoverInfo.object.properties.name && !hoverInfo.object.properties.net_worth && !hoverInfo.object.properties.tract_name && (
            <>
              <strong>{hoverInfo.object.properties.name}</strong><br/>
              {hoverInfo.object.properties.city && `City: ${hoverInfo.object.properties.city}`}
            </>
          )}
          
          {/* Dynamic OSINT Recon Tooltip Dump */}
          {hoverInfo.layer && hoverInfo.layer.id === 'osint-preview-layer' && (
            <div style={{ maxWidth: '300px', wordWrap: 'break-word' }}>
              <strong style={{color: '#fff', borderBottom: '1px solid', display: 'block', marginBottom: '5px'}}>
                RAW OSINT RECORD
              </strong>
              {Object.entries(hoverInfo.object.properties).slice(0, 15).map(([key, val]) => (
                <div key={key} style={{ fontSize: '0.8rem', margin: '2px 0' }}>
                  <span style={{ opacity: 0.6 }}>{key}:</span> {String(val)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
