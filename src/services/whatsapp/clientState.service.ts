// src/services/whatsapp/clientState.service.ts
import { Client } from 'whatsapp-web.js';

export class ClientStateService {
  private static instance: ClientStateService;
  private isReady: boolean = false;
  private isAuthenticated: boolean = false;
  private lastReadyTime: number = 0;
  private stabilizationTime: number = 5000; // ✅ Reducir a 5 segundos
  private readyCheckInterval: NodeJS.Timeout | null = null;
  private consecutiveReadyChecks: number = 0;
  private minConsecutiveChecks: number = 1;

  public static getInstance(): ClientStateService {
    if (!ClientStateService.instance) {
      ClientStateService.instance = new ClientStateService();
    }
    return ClientStateService.instance;
  }

  setClientReady(ready: boolean): void {
    const now = Date.now();
    
    if (ready) {
      this.consecutiveReadyChecks++;
      
      if (this.consecutiveReadyChecks >= this.minConsecutiveChecks) {
        this.isReady = true;
        this.lastReadyTime = now;
        this.clearReadyCheckInterval();
        console.log(`✅ Cliente WhatsApp estabilizado después de ${this.consecutiveReadyChecks} checks consecutivos`);
      } else {
        console.log(`🔄 Cliente ready ${this.consecutiveReadyChecks}/${this.minConsecutiveChecks} checks consecutivos`);
      }
    } else {
      this.isReady = false;
      this.consecutiveReadyChecks = 0;
      this.startReadyCheckInterval();
      console.log('❌ Cliente WhatsApp no está ready, reiniciando contadores');
    }
  }

  setClientAuthenticated(authenticated: boolean): void {
    this.isAuthenticated = authenticated;
    console.log(`🔐 Cliente autenticado: ${authenticated}`);
  }

  // ✅ OPTIMIZAR: Hacer más permisivo el check de ready
  isClientReady(): boolean {
    const now = Date.now();
    const timeSinceReady = now - this.lastReadyTime;
    
    // Si nunca se ha marcado como ready, no está listo
    if (!this.isReady) {
      return false;
    }
    
    // ✅ CAMBIO: Ser más permisivo con el tiempo
    // Solo re-verificar si ha pasado MUCHO tiempo (2 minutos)
    if (timeSinceReady > 120000) { // 2 minutos en lugar de 30 segundos
      console.log('⚠️ Mucho tiempo desde última confirmación, re-verificando estado...');
      this.refreshReadyStatus();
      return false;
    }
    
    // ✅ CAMBIO: No requerir tiempo de estabilización una vez que está ready
    return this.isReady && this.isAuthenticated;
  }

  // ✅ NUEVO: Método para refrescar el estado sin resetear completamente
  private refreshReadyStatus(): void {
    // No resetear completamente, solo actualizar timestamp
    this.lastReadyTime = Date.now();
    console.log('🔄 Estado refrescado');
  }

  // ✅ SIMPLIFICAR: waitForReady más directo
  async waitForReady(timeoutMs: number = 5000): Promise<boolean> {
    console.log(`⏳ Esperando que el cliente esté listo... (timeout: ${timeoutMs}ms)`);
    
    // Si ya está ready, return inmediatamente
    if (this.isClientReady()) {
      console.log('✅ Cliente ya está listo');
      return true;
    }
    
    const startTime = Date.now();
    const checkInterval = 500; // Check más frecuente
    
    return new Promise((resolve) => {
      const checkReady = () => {
        const elapsed = Date.now() - startTime;
        
        // ✅ CAMBIO: Check más simple
        if (this.isReady && this.isAuthenticated) {
          console.log(`✅ Cliente listo después de ${elapsed}ms`);
          this.lastReadyTime = Date.now(); // Actualizar timestamp
          resolve(true);
          return;
        }
        
        if (elapsed >= timeoutMs) {
          console.log(`⏰ Timeout alcanzado después de ${elapsed}ms`);
          resolve(false);
          return;
        }
        
        setTimeout(checkReady, checkInterval);
      };
      
      checkReady();
    });
  }

  private startReadyCheckInterval(): void {
    if (this.readyCheckInterval) {
      clearInterval(this.readyCheckInterval);
    }
    
    // ✅ CAMBIO: Interval menos frecuente para reducir spam
    this.readyCheckInterval = setInterval(() => {
      if (!this.isReady) {
        console.log('🔍 Verificando estado del cliente...');
      }
    }, 30000); // Cada 30 segundos en lugar de 5
  }

  private clearReadyCheckInterval(): void {
    if (this.readyCheckInterval) {
      clearInterval(this.readyCheckInterval);
      this.readyCheckInterval = null;
    }
  }

  getReadyStatus(): { isReady: boolean; isAuthenticated: boolean; timeSinceReady: number } {
    const now = Date.now();
    return {
      isReady: this.isReady,
      isAuthenticated: this.isAuthenticated,
      timeSinceReady: now - this.lastReadyTime
    };
  }

  reset(): void {
    this.isReady = false;
    this.isAuthenticated = false;
    this.lastReadyTime = 0;
    this.consecutiveReadyChecks = 0;
    this.clearReadyCheckInterval();
    console.log('🔄 Estado del cliente reseteado');
  }
}