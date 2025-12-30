'use client';

import { useState } from 'react';

type Tab = 'story' | 'tech' | 'architecture';

export default function DuetWindow() {
  const [activeTab, setActiveTab] = useState<Tab>('story');

  return (
    <div className="h-full flex flex-col text-[var(--window-text)]">
      {/* Header */}
      <div className="p-3 border-b border-[var(--button-shadow)]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded flex items-center justify-center text-white text-xl bg-[#E31837]">
            <svg viewBox="0 0 48 48" className="w-8 h-8">
              <circle cx="18" cy="24" r="8" fill="#fff" opacity="0.9" />
              <circle cx="30" cy="24" r="8" fill="#fff" opacity="0.9" />
              <path d="M18 20v8M30 20v8" stroke="#E31837" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold m-0">Duet</h1>
            <p className="text-sm m-0 italic text-[#E31837]">Stay connected without the interruption</p>
          </div>
          <span className="text-xs px-2 py-1 text-white bg-[#E31837]">
            MVP
          </span>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="retro-tabs pt-1 bg-[var(--button-face)]">
        <button
          className={`retro-tab ${activeTab === 'story' ? 'active' : ''}`}
          onClick={() => setActiveTab('story')}
        >
          The Story
        </button>
        <button
          className={`retro-tab ${activeTab === 'tech' ? 'active' : ''}`}
          onClick={() => setActiveTab('tech')}
        >
          Tech Stack
        </button>
        <button
          className={`retro-tab ${activeTab === 'architecture' ? 'active' : ''}`}
          onClick={() => setActiveTab('architecture')}
        >
          Architecture
        </button>
      </div>

      {/* Content */}
      <div className="retro-tab-content flex-1 overflow-auto p-3">
        {activeTab === 'story' && <StoryTab />}
        {activeTab === 'tech' && <TechTab />}
        {activeTab === 'architecture' && <ArchitectureTab />}
      </div>
    </div>
  );
}

function StoryTab() {
  return (
    <div className="space-y-4">
      {/* The Setting */}
      <div className="group-box">
        <span className="group-box-label">The Setting</span>
        <div className="text-xs leading-relaxed space-y-3">
          <p className="flex items-start gap-2">
            <span className="text-lg">🎤</span>
            <span>
              <strong>New York City, December 2025.</strong> I was in town to speak at <strong>Agentforce World Tour</strong> - two sessions on AI agents and the future of advertising. My wife Dani joined me so we could turn the work trip into a holiday adventure.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-lg">🎄</span>
            <span>
              We also attended the <strong>Salesforce Holiday Party</strong> on the Ohana Floor at Salesforce Tower Bryant Park - an incredible venue with sweeping views of the city lit up for the holidays.
            </span>
          </p>
        </div>
      </div>

      {/* The Inspiration */}
      <div className="group-box">
        <span className="group-box-label">The Inspiration</span>
        <div className="text-xs leading-relaxed space-y-3">
          <p className="flex items-start gap-2">
            <span className="text-lg">🚶</span>
            <span>
              Between sessions and events, Dani and I did what we love most - walking the streets of Manhattan, taking in the lights, the energy, the beautiful chaos of holiday NYC.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-lg">🎧</span>
            <span>
              We both had our headphones in - Dani with her AirPods, me with my Bose. She was vibing to Christmas music. I was catching up on a podcast. But in the wild hustle and bustle, staying within earshot - let alone actually communicating - was nearly impossible.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-lg">💡</span>
            <span>
              That&apos;s when it hit me: why should we have to choose between enjoying our own audio and staying connected? What if there was a way to overlay ambient voice communication on top of whatever we&apos;re already listening to?
            </span>
          </p>
        </div>
      </div>

      {/* The Build */}
      <div className="group-box">
        <span className="group-box-label">From Problem to Prototype</span>
        <div className="text-xs leading-relaxed space-y-3">
          <p className="flex items-start gap-2">
            <span className="text-lg">⚡</span>
            <span>
              <strong>Enter, Duet.</strong> Right there, during our NYC trip, I started vibe coding with Claude Code. Within hours, I had a working proof of concept - something that would have taken months (or years) before generative and agentic AI.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-lg">📱</span>
            <span>
              The biggest challenge? Dani uses iPhone. I use Android. Cross-platform audio apps with real-time voice, proper audio ducking, and background operation are notoriously difficult. But with Claude as my coding partner, we cracked it.
            </span>
          </p>
        </div>
      </div>

      {/* Photo Gallery */}
      <div className="group-box">
        <span className="group-box-label">Memories from the Trip</span>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <img
              src="/images/af-wt-ny-dec-25-speaking.png"
              alt="Tony speaking at Agentforce World Tour NYC"
              className="w-full h-36 object-cover rounded border border-[var(--button-shadow)]"
            />
            <div className="text-[9px] text-center mt-1 text-gray-500">Agentforce World Tour</div>
          </div>
          <div>
            <img
              src="/images/sf-holiday-25.jpg"
              alt="Salesforce Holiday Party"
              className="w-full h-36 object-cover rounded border border-[var(--button-shadow)]"
            />
            <div className="text-[9px] text-center mt-1 text-gray-500">SF Holiday Party</div>
          </div>
          <div>
            <img
              src="/images/bryant-park-25.jpg"
              alt="Tony and Dani at Bryant Park"
              className="w-full h-36 object-cover rounded border border-[var(--button-shadow)]"
            />
            <div className="text-[9px] text-center mt-1 text-gray-500">Bryant Park with Dani</div>
          </div>
        </div>
      </div>

      {/* What It Does */}
      <div className="group-box">
        <span className="group-box-label">What Duet Does</span>
        <div className="text-xs leading-relaxed">
          <p className="mb-2">
            An <strong>always-on voice communication app</strong> that overlays partner audio onto whatever you&apos;re already listening to - music, podcasts, audiobooks. No push-to-talk, no interruptions.
          </p>
          <ul className="pl-4 space-y-1 m-0">
            <li>🔊 Intelligent audio ducking - your music fades when they speak</li>
            <li>🎤 Voice activity detection - only transmits when talking</li>
            <li>📲 Cross-platform - iPhone to Android, seamlessly</li>
            <li>🔇 Mute/deafen controls for privacy</li>
            <li>🔋 Background operation - works even when screen is off</li>
          </ul>
        </div>
      </div>

      {/* Target Use Case */}
      <div className="group-box">
        <span className="group-box-label">Perfect For</span>
        <div className="text-xs flex flex-wrap gap-2">
          <span className="px-2 py-1 bg-[#E3183720] border border-[#E31837]">🏙️ City Exploration</span>
          <span className="px-2 py-1 bg-[#E3183720] border border-[#E31837]">🎢 Theme Parks</span>
          <span className="px-2 py-1 bg-[#E3183720] border border-[#E31837]">🎵 Concerts</span>
          <span className="px-2 py-1 bg-[#E3183720] border border-[#E31837]">🏃 Running Together</span>
          <span className="px-2 py-1 bg-[#E3183720] border border-[#E31837]">🛒 Shopping</span>
        </div>
      </div>
    </div>
  );
}

function TechTab() {
  const techStack = [
    { layer: 'Framework', tech: 'React Native + Expo' },
    { layer: 'State', tech: 'Zustand' },
    { layer: 'Real-time', tech: 'WebRTC (react-native-webrtc)' },
    { layer: 'Signaling', tech: 'Firebase Realtime Database' },
    { layer: 'Auth', tech: 'Firebase Anonymous Auth' },
    { layer: 'Native Audio', tech: 'Custom Swift/Kotlin modules' },
  ];

  const capabilities = [
    { feature: 'Mute Self', impl: 'Stops mic processing in native module' },
    { feature: 'Deafen', impl: 'Skips partner audio playback' },
    { feature: 'Audio Ducking', impl: 'Dynamic audio session switching' },
    { feature: 'Background Audio', impl: 'Wake locks / Background modes' },
    { feature: 'Media Controls', impl: 'System media integration' },
  ];

  return (
    <div className="space-y-4">
      {/* Tech Stack Table */}
      <div className="group-box">
        <span className="group-box-label">Technology Stack</span>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[var(--button-face)]">
              <th className="text-left p-2 border border-[var(--button-shadow)]">Layer</th>
              <th className="text-left p-2 border border-[var(--button-shadow)]">Technology</th>
            </tr>
          </thead>
          <tbody>
            {techStack.map((row) => (
              <tr key={row.layer}>
                <td className="p-2 border border-[var(--button-shadow)] font-bold">{row.layer}</td>
                <td className="p-2 border border-[var(--button-shadow)]">{row.tech}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Key Capabilities */}
      <div className="group-box">
        <span className="group-box-label">Key Capabilities</span>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[var(--button-face)]">
              <th className="text-left p-2 border border-[var(--button-shadow)]">Feature</th>
              <th className="text-left p-2 border border-[var(--button-shadow)]">Implementation</th>
            </tr>
          </thead>
          <tbody>
            {capabilities.map((row) => (
              <tr key={row.feature}>
                <td className="p-2 border border-[var(--button-shadow)] font-bold">{row.feature}</td>
                <td className="p-2 border border-[var(--button-shadow)]">{row.impl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Platform Specifics */}
      <div className="group-box">
        <span className="group-box-label">Platform-Specific Implementations</span>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="font-bold mb-1">🍎 iOS (Swift)</div>
            <ul className="pl-4 m-0 space-y-1">
              <li>AVAudioEngine for capture/playback</li>
              <li>AVAudioSession with mixWithOthers</li>
              <li>Dynamic ducking via duckOthers</li>
              <li>Session activation on room join</li>
            </ul>
          </div>
          <div>
            <div className="font-bold mb-1">🤖 Android (Kotlin)</div>
            <ul className="pl-4 m-0 space-y-1">
              <li>AudioRecord + echo cancellation</li>
              <li>AudioTrack for playback</li>
              <li>AUDIOFOCUS_GAIN for ducking</li>
              <li>MODE_IN_COMMUNICATION</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Current Limitations */}
      <div className="group-box">
        <span className="group-box-label">Current Limitations (MVP)</span>
        <ul className="text-xs pl-4 m-0 space-y-1">
          <li><strong>Android ducking:</strong> Relies on other apps respecting audio focus</li>
          <li><strong>No TURN server:</strong> P2P only - may fail behind strict NATs</li>
          <li><strong>Two-person only:</strong> MVP supports couples mode (6-person planned)</li>
          <li><strong>No E2E encryption:</strong> Planned but not yet implemented</li>
        </ul>
      </div>
    </div>
  );
}

function ArchitectureTab() {
  return (
    <div className="space-y-4">
      {/* Audio Pipeline */}
      <div className="group-box">
        <span className="group-box-label">Audio Pipeline</span>
        <div className="text-xs font-mono bg-black text-green-400 p-3 rounded overflow-x-auto">
          <div className="whitespace-nowrap">
            <div className="text-cyan-400 mb-2">// Outbound (Your Voice)</div>
            <div>Microphone → Native Module (VAD) → Base64 Encode → WebRTC Data Channel → Partner</div>
            <div className="text-cyan-400 my-2">// Inbound (Partner Voice)</div>
            <div>Partner → Data Channel → Native Module → Audio Ducking → Playback</div>
          </div>
        </div>
      </div>

      {/* Dual Audio Path */}
      <div className="group-box">
        <span className="group-box-label">Dual Audio Path Design</span>
        <div className="text-xs space-y-2">
          <div className="flex items-start gap-2">
            <span className="px-2 py-1 bg-[#E3183720] border border-[#E31837] font-bold whitespace-nowrap">WebRTC Tracks</span>
            <span>Used for connection negotiation only (muted)</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-2 py-1 bg-[#00A3AD20] border border-[#00A3AD] font-bold whitespace-nowrap">Data Channel</span>
            <span>Actual audio transmission (base64 PCM @ 48kHz mono)</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-2 py-1 bg-[#FFB81C20] border border-[#FFB81C] font-bold whitespace-nowrap">Native Modules</span>
            <span>Handle capture, VAD, ducking, and playback</span>
          </div>
        </div>
      </div>

      {/* Voice Activity Detection */}
      <div className="group-box">
        <span className="group-box-label">Voice Activity Detection (VAD)</span>
        <ul className="text-xs pl-4 m-0 space-y-1">
          <li>RMS-based detection in native code</li>
          <li>Configurable threshold (0.001 - 0.1)</li>
          <li>Only transmits when speaking (bandwidth optimization)</li>
        </ul>
      </div>

      {/* Audio Session Flow */}
      <div className="group-box">
        <span className="group-box-label">Audio Session Flow</span>
        <div className="text-xs font-mono bg-black text-green-400 p-3 rounded">
          <pre className="m-0 whitespace-pre-wrap">{`App Open → setupAudioSession()
         → Category set, NOT activated
         → Music keeps playing ✓

Join Room → startAudioEngine()
          → Session activated
          → Ducking enabled when partner speaks

Leave Room → stopAudioEngine()
           → Session deactivated
           → Other apps notified to resume`}</pre>
        </div>
      </div>

      {/* File Structure */}
      <div className="group-box">
        <span className="group-box-label">Key File Structure</span>
        <div className="text-xs font-mono bg-black text-green-400 p-3 rounded overflow-x-auto">
          <pre className="m-0">{`├── App.tsx                    # Main UI + room management
├── plugins/withDuetAudio.js   # Expo config plugin
│   ├── DuetAudioManager.swift
│   ├── DuetAudioManager.kt
│   └── DuetAudioPackage.kt
├── src/
│   ├── native/DuetAudio.ts    # JS bridge
│   ├── hooks/useDuetStore.ts  # Zustand state
│   └── services/
│       ├── WebRTCService.ts   # P2P connection
│       └── SignalingService.ts`}</pre>
        </div>
      </div>

      {/* Integration Points */}
      <div className="group-box">
        <span className="group-box-label">Integration Points</span>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[var(--button-face)]">
              <th className="text-left p-2 border border-[var(--button-shadow)]">Service</th>
              <th className="text-left p-2 border border-[var(--button-shadow)]">Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border border-[var(--button-shadow)] font-bold">Firebase RTDB</td>
              <td className="p-2 border border-[var(--button-shadow)]">Signaling (offer/answer/ICE exchange)</td>
            </tr>
            <tr>
              <td className="p-2 border border-[var(--button-shadow)] font-bold">Firebase Auth</td>
              <td className="p-2 border border-[var(--button-shadow)]">Anonymous user identification</td>
            </tr>
            <tr>
              <td className="p-2 border border-[var(--button-shadow)] font-bold">Google STUN</td>
              <td className="p-2 border border-[var(--button-shadow)]">NAT traversal for P2P connection</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
