import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            manifest: {
                name: 'Actik — Digital Certificates',
                short_name: 'Actik',
                description: 'Issue, hold, and verify digital certificates in Cambodia.',
                theme_color: '#1b3a2f',
                background_color: '#f6f3ec',
                display: 'standalone',
                start_url: '/',
                icons: [
                    { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            workbox: {
                // Cache the app shell so it loads offline. Verification + sharing still
                // need the network (Supabase, issuer-key resolution).
                globPatterns: ['**/*.{js,css,html,svg,png}'],
            },
        }),
    ],
});
