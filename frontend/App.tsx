import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, MessageSquare, Mic, Settings, Volume2, VolumeX, Play, Pause, Users, TrendingUp, Zap, Flame, LineChart } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { PERSONAS, SIMULATED_USERS, SIMULATED_CHAT_MESSAGES } from './constants';
import { PersonaId, GameState, ChatMessage, CommentaryEvent } from './types';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '', vertexai: true });

// Helper to get icon component
const getIcon = (iconName: string) => {
    switch (iconName) {
        case 'LineChart': return <LineChart className="w-5 h-5" />;
        case 'Zap': return <Zap className="w-5 h-5" />;
        case 'Flame': return <Flame className="w-5 h-5" />;
        default: return <Mic className="w-5 h-5" />;
    }
};

export default function App() {
    // --- State ---
    const [activePersona, setActivePersona] = useState<PersonaId>('hype');
    const [isMuted, setIsMuted] = useState(false);
    const [isGameActive, setIsGameActive] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    
    const [gameState, setGameState] = useState<GameState>({
        score: 145,
        wickets: 3,
        overs: 15,
        ballsInOver: 2,
        target: 210,
        requiredRunRate: 13.9,
        currentRunRate: 9.4,
        lastEvent: 'Single to deep mid-wicket'
    });

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [userChatInput, setUserChatInput] = useState('');
    const [commentaryHistory, setCommentaryHistory] = useState<CommentaryEvent[]>([]);
    const [currentAudio, setCurrentAudio] = useState<SpeechSynthesisUtterance | null>(null);

    // Refs for intervals and latest state access inside callbacks
    const gameIntervalRef = useRef<number | null>(null);
    const chatIntervalRef = useRef<number | null>(null);
    const commentaryIntervalRef = useRef<number | null>(null);
    const gameStateRef = useRef(gameState);
    const chatMessagesRef = useRef(chatMessages);
    const activePersonaRef = useRef(activePersona);

    // Keep refs updated
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
    useEffect(() => { chatMessagesRef.current = chatMessages; }, [chatMessages]);
    useEffect(() => { activePersonaRef.current = activePersona; }, [activePersona]);

    // --- Game Simulation Logic ---
    const simulateGameTick = useCallback(() => {
        setGameState(prev => {
            let newBalls = prev.ballsInOver + 1;
            let newOvers = prev.overs;
            if (newBalls >= 6) {
                newBalls = 0;
                newOvers += 1;
            }

            // Random event generation
            const rand = Math.random();
            let runsAdded = 0;
            let wicketAdded = 0;
            let eventDesc = '';

            if (rand < 0.1) {
                wicketAdded = 1;
                eventDesc = 'OUT! Caught at boundary.';
            } else if (rand < 0.3) {
                runsAdded = 4;
                eventDesc = 'FOUR! Smashed through covers.';
            } else if (rand < 0.4) {
                runsAdded = 6;
                eventDesc = 'SIX! Massive hit into the stands!';
            } else if (rand < 0.7) {
                runsAdded = 1;
                eventDesc = 'Single taken, rotating the strike.';
            } else if (rand < 0.8) {
                runsAdded = 2;
                eventDesc = 'Good running, they come back for two.';
            } else {
                eventDesc = 'Dot ball. Good tight bowling.';
            }

            const newScore = prev.score + runsAdded;
            const newWickets = prev.wickets + wicketAdded;
            const totalBalls = (newOvers * 6) + newBalls;
            const newCrr = totalBalls > 0 ? (newScore / totalBalls) * 6 : 0;
            
            const runsNeeded = prev.target - newScore;
            const ballsRemaining = 120 - totalBalls;
            const newRrr = ballsRemaining > 0 ? (runsNeeded / ballsRemaining) * 6 : 0;

            return {
                ...prev,
                score: newScore,
                wickets: newWickets,
                overs: newOvers,
                ballsInOver: newBalls,
                currentRunRate: Number(newCrr.toFixed(2)),
                requiredRunRate: Number(newRrr.toFixed(2)),
                lastEvent: eventDesc
            };
        });
    }, []);

    // --- Chat Simulation Logic ---
    const simulateChat = useCallback(() => {
        const randomMsg = SIMULATED_CHAT_MESSAGES[Math.floor(Math.random() * SIMULATED_CHAT_MESSAGES.length)];
        const randomUser = SIMULATED_USERS[Math.floor(Math.random() * SIMULATED_USERS.length)];
        
        const newMessage: ChatMessage = {
            id: Math.random().toString(36).substring(7),
            user: randomUser,
            text: randomMsg,
            timestamp: Date.now(),
            isSimulated: true
        };

        setChatMessages(prev => [...prev.slice(-49), newMessage]); // Keep last 50
    }, []);

    // --- AI Commentary Generation ---
    const generateCommentary = useCallback(async () => {
        if (!process.env.API_KEY) {
            console.error("API_KEY is missing.");
            return;
        }

        setIsGenerating(true);
        const currentState = gameStateRef.current;
        const recentChat = chatMessagesRef.current.slice(-5).map(m => `${m.user}: ${m.text}`).join(' | ');
        const persona = PERSONAS[activePersonaRef.current];

        const prompt = `
Current Game State:
- Score: ${currentState.score}/${currentState.wickets}
- Overs: ${currentState.overs}.${currentState.ballsInOver}
- Target: ${currentState.target}
- Current Run Rate: ${currentState.currentRunRate}
- Required Run Rate: ${currentState.requiredRunRate}
- Last Event: ${currentState.lastEvent}

Recent Fan Chat (React to this sentiment!):
${recentChat || 'No recent chat.'}

Generate your next commentary line based on the event and chat.
`;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    systemInstruction: persona.systemInstruction,
                    temperature: 0.7,
                }
            });

            const generatedText = response.text?.trim() || "Wow, what a moment!";
            
            const newCommentary: CommentaryEvent = {
                id: Math.random().toString(36).substring(7),
                text: generatedText,
                personaId: persona.id,
                timestamp: Date.now()
            };

            setCommentaryHistory(prev => [newCommentary, ...prev].slice(0, 10));
            playAudio(generatedText, persona.id);

        } catch (error) {
            console.error("Error generating commentary:", error);
        } finally {
            setIsGenerating(false);
        }
    }, []);

    // --- Text to Speech ---
    const playAudio = (text: string, personaId: PersonaId) => {
        if (isMuted) return;

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        
        // Try to find a suitable voice based on persona (very basic heuristic)
        const voices = window.speechSynthesis.getVoices();
        let selectedVoice = voices.find(v => v.lang.includes('en'));

        if (personaId === 'data') {
            // Try to find a more robotic/calm voice (often UK English sounds more formal)
            selectedVoice = voices.find(v => v.lang === 'en-GB') || selectedVoice;
            utterance.pitch = 0.9;
            utterance.rate = 0.95;
        } else if (personaId === 'hype') {
            // Try to find a louder/faster voice (US English often default)
            selectedVoice = voices.find(v => v.lang === 'en-US') || selectedVoice;
            utterance.pitch = 1.2;
            utterance.rate = 1.1;
        } else if (personaId === 'local') {
            // Try to find an Indian English voice
            selectedVoice = voices.find(v => v.lang === 'en-IN') || selectedVoice;
            utterance.pitch = 1.0;
            utterance.rate = 1.05;
        }

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        setCurrentAudio(utterance);
        window.speechSynthesis.speak(utterance);
    };

    // Handle voice loading (some browsers load them async)
    useEffect(() => {
        const loadVoices = () => { window.speechSynthesis.getVoices(); };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }, []);


    // --- Lifecycle & Intervals ---
    useEffect(() => {
        if (isGameActive) {
            // Game ticks every 8 seconds
            gameIntervalRef.current = window.setInterval(simulateGameTick, 8000);
            // Chat ticks randomly between 2-5 seconds
            chatIntervalRef.current = window.setInterval(simulateChat, 3000 + Math.random() * 2000);
            // Commentary generates every 15 seconds
            commentaryIntervalRef.current = window.setInterval(generateCommentary, 15000);
        } else {
            if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
            if (chatIntervalRef.current) clearInterval(chatIntervalRef.current);
            if (commentaryIntervalRef.current) clearInterval(commentaryIntervalRef.current);
        }

        return () => {
            if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
            if (chatIntervalRef.current) clearInterval(chatIntervalRef.current);
            if (commentaryIntervalRef.current) clearInterval(commentaryIntervalRef.current);
        };
    }, [isGameActive, simulateGameTick, simulateChat, generateCommentary]);

    // Initial commentary on load
    useEffect(() => {
        generateCommentary();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    // --- Handlers ---
    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!userChatInput.trim()) return;

        const newMessage: ChatMessage = {
            id: Math.random().toString(36).substring(7),
            user: 'You',
            text: userChatInput,
            timestamp: Date.now(),
            isSimulated: false
        };

        setChatMessages(prev => [...prev.slice(-49), newMessage]);
        setUserChatInput('');
        
        // Trigger an immediate commentary reaction if user types something significant
        if (Math.random() > 0.5) {
             setTimeout(generateCommentary, 2000);
        }
    };

    const toggleMute = () => {
        setIsMuted(!isMuted);
        if (!isMuted) {
            window.speechSynthesis.cancel();
        }
    };

    const activePersonaData = PERSONAS[activePersona];

    return (
        <div className="flex flex-col h-full bg-brand-900 text-zinc-100 font-sans">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 bg-brand-800 border-b border-zinc-800 shadow-md z-10">
                <div className="flex items-center gap-3">
                    <div className="relative flex h-4 w-4">
                      {isGameActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                      <span className={`relative inline-flex rounded-full h-4 w-4 ${isGameActive ? 'bg-red-500' : 'bg-zinc-500'}`}></span>
                    </div>
                    <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
                        The AI Comm-Box
                    </h1>
                </div>

                {/* Persona Selector */}
                <div className="flex bg-brand-900 rounded-lg p-1 border border-zinc-800">
                    {(Object.keys(PERSONAS) as PersonaId[]).map((pId) => {
                        const p = PERSONAS[pId];
                        const isActive = activePersona === pId;
                        return (
                            <button
                                key={pId}
                                onClick={() => {
                                    setActivePersona(pId);
                                    setTimeout(generateCommentary, 500); // Generate new line on switch
                                }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                                    isActive 
                                    ? `${p.bgClass} ${p.colorClass} shadow-sm` 
                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                                }`}
                            >
                                {getIcon(p.icon)}
                                <span className="hidden sm:inline">{p.name}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setIsGameActive(!isGameActive)}
                        className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                        title={isGameActive ? "Pause Simulation" : "Resume Simulation"}
                    >
                        {isGameActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                    <button 
                        onClick={toggleMute}
                        className={`p-2 rounded-full hover:bg-zinc-800 transition-colors ${isMuted ? 'text-red-400' : 'text-zinc-400 hover:text-white'}`}
                    >
                        {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex overflow-hidden">
                
                {/* Left Column: Game Stats */}
                <aside className="w-80 bg-brand-800 border-r border-zinc-800 flex flex-col">
                    <div className="p-6 border-b border-zinc-800">
                        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Activity className="w-4 h-4" /> Live Match Data
                        </h2>
                        
                        <div className="space-y-6">
                            {/* Score */}
                            <div>
                                <div className="text-5xl font-black tracking-tighter">
                                    {gameState.score}<span className="text-2xl text-zinc-500 font-medium">/{gameState.wickets}</span>
                                </div>
                                <div className="text-sm text-zinc-400 mt-1 font-medium">
                                    Overs: <span className="text-white">{gameState.overs}.{gameState.ballsInOver}</span>
                                </div>
                            </div>

                            {/* Target & Rates */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-brand-900 p-3 rounded-lg border border-zinc-800">
                                    <div className="text-xs text-zinc-500 mb-1">Target</div>
                                    <div className="text-xl font-bold">{gameState.target}</div>
                                </div>
                                <div className="bg-brand-900 p-3 rounded-lg border border-zinc-800">
                                    <div className="text-xs text-zinc-500 mb-1">Req. RR</div>
                                    <div className={`text-xl font-bold ${gameState.requiredRunRate > 12 ? 'text-red-400' : 'text-white'}`}>
                                        {gameState.requiredRunRate}
                                    </div>
                                </div>
                                <div className="bg-brand-900 p-3 rounded-lg border border-zinc-800 col-span-2">
                                    <div className="text-xs text-zinc-500 mb-1">Current RR</div>
                                    <div className="text-xl font-bold text-blue-400">{gameState.currentRunRate}</div>
                                </div>
                            </div>

                            {/* Last Event */}
                            <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-700/50">
                                <div className="text-xs text-zinc-400 mb-2">Last Delivery</div>
                                <div className="font-medium text-sm leading-snug">
                                    {gameState.lastEvent}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Persona Info */}
                    <div className="p-6 flex-1 bg-gradient-to-b from-transparent to-brand-900/50">
                        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Settings className="w-4 h-4" /> Active AI Persona
                        </h2>
                        <div className={`p-4 rounded-xl border ${activePersonaData.borderClass} ${activePersonaData.bgClass}`}>
                            <div className={`flex items-center gap-3 mb-2 ${activePersonaData.colorClass}`}>
                                {getIcon(activePersonaData.icon)}
                                <h3 className="font-bold">{activePersonaData.name}</h3>
                            </div>
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                {activePersonaData.description}
                            </p>
                        </div>
                    </div>
                </aside>

                {/* Center Column: Video Placeholder & Commentary */}
                <section className="flex-1 flex flex-col relative bg-brand-900">
                    {/* Simulated Video Area */}
                    <div className="h-3/5 relative bg-black border-b border-zinc-800 overflow-hidden group">
                        {/* Placeholder Image */}
                        <img 
                            src="https://picsum.photos/1200/800?grayscale&blur=2" 
                            alt="Stadium" 
                            className="w-full h-full object-cover opacity-30"
                        />
                        
                        {/* Overlay UI */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="w-24 h-24 rounded-full border-4 border-zinc-800 flex items-center justify-center bg-brand-900/80 backdrop-blur-sm mb-4">
                                <Play className="w-10 h-10 text-zinc-600 ml-1" />
                            </div>
                            <p className="text-zinc-500 font-medium tracking-widest uppercase text-sm">Live Feed Unavailable</p>
                        </div>

                        {/* Score Bug Overlay */}
                        <div className="absolute bottom-6 left-6 bg-brand-900/90 backdrop-blur-md border border-zinc-700 rounded-lg p-4 flex items-center gap-6 shadow-2xl">
                            <div>
                                <div className="text-xs text-zinc-400 font-bold tracking-wider mb-1">IND</div>
                                <div className="text-3xl font-black">{gameState.score}-{gameState.wickets}</div>
                            </div>
                            <div className="h-10 w-px bg-zinc-700"></div>
                            <div>
                                <div className="text-xs text-zinc-400 font-bold tracking-wider mb-1">OVERS</div>
                                <div className="text-xl font-bold">{gameState.overs}.{gameState.ballsInOver}</div>
                            </div>
                        </div>
                    </div>

                    {/* Commentary Box */}
                    <div className="flex-1 p-8 flex flex-col justify-end relative">
                        {/* Background glow based on persona */}
                        <div className={`absolute inset-0 opacity-5 bg-gradient-to-t from-${activePersonaData.colorClass.split('-')[1]}-500 to-transparent pointer-events-none`}></div>
                        
                        <div className="relative z-10 max-w-3xl mx-auto w-full">
                            {/* Audio Visualizer (Fake) */}
                            <div className="flex items-center gap-1 mb-6 h-8">
                                {isGenerating ? (
                                    <div className="flex items-center gap-2 text-zinc-400 text-sm font-medium">
                                        <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin"></div>
                                        AI is thinking...
                                    </div>
                                ) : (
                                    Array.from({ length: 20 }).map((_, i) => (
                                        <div 
                                            key={i} 
                                            className={`w-1.5 rounded-full ${activePersonaData.bgClass.replace('/10', '')} opacity-80`}
                                            style={{ 
                                                height: !isMuted && commentaryHistory.length > 0 ? `${Math.max(20, Math.random() * 100)}%` : '20%',
                                                animation: !isMuted && commentaryHistory.length > 0 ? `wave ${0.5 + Math.random()}s ease-in-out infinite` : 'none',
                                                animationDelay: `${i * 0.05}s`
                                            }}
                                        ></div>
                                    ))
                                )}
                            </div>

                            {/* Current Commentary Text */}
                            <div className="min-h-[120px]">
                                {commentaryHistory.length > 0 ? (
                                    <div className="animate-fade-in-up">
                                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3 border ${activePersonaData.borderClass} ${activePersonaData.bgClass} ${activePersonaData.colorClass}`}>
                                            {getIcon(activePersonaData.icon)}
                                            {activePersonaData.name}
                                        </div>
                                        <p className="text-3xl font-medium leading-tight text-white drop-shadow-md">
                                            "{commentaryHistory[0].text}"
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-xl text-zinc-600 italic">Waiting for the action to unfold...</p>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Right Column: Fan Chat */}
                <aside className="w-80 bg-brand-800 border-l border-zinc-800 flex flex-col">
                    <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-brand-900/50">
                        <h2 className="text-sm font-bold flex items-center gap-2">
                            <Users className="w-4 h-4 text-zinc-400" /> 
                            Live Fan Zone
                        </h2>
                        <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded font-bold animate-pulse">
                            LIVE
                        </span>
                    </div>

                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col-reverse">
                        {[...chatMessages].reverse().map((msg) => (
                            <div key={msg.id} className={`flex flex-col ${msg.user === 'You' ? 'items-end' : 'items-start'}`}>
                                <span className="text-[10px] text-zinc-500 font-medium mb-1 px-1">
                                    {msg.user}
                                </span>
                                <div className={`px-3 py-2 rounded-2xl text-sm max-w-[85%] ${
                                    msg.user === 'You' 
                                    ? 'bg-blue-600 text-white rounded-tr-sm' 
                                    : 'bg-zinc-800 text-zinc-200 rounded-tl-sm border border-zinc-700/50'
                                }`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Chat Input */}
                    <div className="p-4 bg-brand-900 border-t border-zinc-800">
                        <form onSubmit={handleSendMessage} className="relative">
                            <input
                                type="text"
                                value={userChatInput}
                                onChange={(e) => setUserChatInput(e.target.value)}
                                placeholder="Join the conversation..."
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-full py-2.5 pl-4 pr-10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all"
                            />
                            <button 
                                type="submit"
                                disabled={!userChatInput.trim()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-400 hover:text-white disabled:opacity-50 disabled:hover:text-zinc-400 transition-colors"
                            >
                                <MessageSquare className="w-4 h-4" />
                            </button>
                        </form>
                        <p className="text-[10px] text-zinc-500 text-center mt-2">
                            AI commentator reacts to chat sentiment.
                        </p>
                    </div>
                </aside>
            </main>
            
            {/* Global Styles for animations */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up {
                    animation: fadeInUp 0.4s ease-out forwards;
                }
            `}} />
        </div>
    );
}
