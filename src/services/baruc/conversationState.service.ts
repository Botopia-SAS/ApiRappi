// src/services/baruc/conversationState.service.ts
import { IntentResponse } from './intentProcessor.service';

export interface ConversationState {
  currentIntent: IntentResponse;
  waitingFor?: string;
  lastQuestion?: string;
  attempts: number;
}

export class ConversationStateService {
  private states = new Map<string, ConversationState>();

  setConversationState(chatId: string, state: ConversationState): void {
    this.states.set(chatId, state);
  }

  getConversationState(chatId: string): ConversationState | null {
    return this.states.get(chatId) || null;
  }

  updateCurrentIntent(chatId: string, intent: IntentResponse): void {
    const state = this.states.get(chatId);
    if (state) {
      state.currentIntent = intent;
      state.attempts = 0;
    }
  }

  setWaitingFor(chatId: string, field: string, question: string): void {
    const state = this.states.get(chatId);
    if (state) {
      state.waitingFor = field;
      state.lastQuestion = question;
    }
  }

  clearWaitingFor(chatId: string): void {
    const state = this.states.get(chatId);
    if (state) {
      state.waitingFor = undefined;
      state.lastQuestion = undefined;
    }
  }

  incrementAttempts(chatId: string): void {
    const state = this.states.get(chatId);
    if (state) {
      state.attempts++;
    }
  }

  clearConversationState(chatId: string): void {
    this.states.delete(chatId);
  }

  hasConversationState(chatId: string): boolean {
    return this.states.has(chatId);
  }
}