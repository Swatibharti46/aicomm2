export type PersonaId = 'data' | 'hype' | 'local';

export interface Persona {
    id: PersonaId;
    name: string;
    description: string;
    colorClass: string;
    bgClass: string;
    borderClass: string;
    systemInstruction: string;
    icon: string;
}

export interface GameState {
    score: number;
    wickets: number;
    overs: number;
    ballsInOver: number;
    target: number;
    requiredRunRate: number;
    currentRunRate: number;
    lastEvent: string;
}

export interface ChatMessage {
    id: string;
    user: string;
    text: string;
    timestamp: number;
    isSimulated: boolean;
}

export interface CommentaryEvent {
    id: string;
    text: string;
    personaId: PersonaId;
    timestamp: number;
}
