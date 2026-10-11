import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.tsx';
import { AuthProvider } from './auth/AuthContext.tsx';
import { PlayerProvider } from './components/PlayerBar.tsx';
import { RoomProvider } from './components/RoomProvider.tsx';
import { ToastProvider } from './components/ToastProvider.tsx';
import { UploadProvider } from './components/UploadProvider.tsx';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            {/* Outside the player, which follows the joined room's state. */}
            <RoomProvider>
              <PlayerProvider>
                <UploadProvider>
                  <App />
                </UploadProvider>
              </PlayerProvider>
            </RoomProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
