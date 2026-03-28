/**
 * Runtime Environment Helper
 *
 * Reads environment variables from:
 * 1. window.__ENV__ (injected at runtime by docker-entrypoint.sh in production)
 * 2. import.meta.env (injected at build time by Vite in development)
 */

interface RuntimeEnv {
    VITE_API_URL?: string;
    VITE_API_BASE_URL?: string;
    VITE_BFF_URL?: string;
    VITE_WS_URL?: string;
    VITE_ADMIN_TOKEN?: string;
    VITE_APP_NAME?: string;
    VITE_DEFAULT_TENANT_ID?: string;
    VITE_FACEBOOK_APP_ID?: string;
    VITE_META_CONFIG_ID?: string;
    VITE_META_EMBEDDED_SIGNUP?: string;
}

declare global {
    interface Window {
        __ENV__?: RuntimeEnv;
    }
}

export function getEnv(key: keyof RuntimeEnv): string {
    // 1. Runtime injection (Docker/EasyPanel)
    const runtimeVal = window.__ENV__?.[key];
    if (runtimeVal && runtimeVal !== 'RUNTIME_REPLACE' && !runtimeVal.startsWith('__VITE_')) {
        return runtimeVal;
    }

    // 2. Vite build-time injection (local dev)
    const viteVal = (import.meta.env as Record<string, string>)?.[key];

    if (key === 'VITE_ADMIN_TOKEN') {
        if (runtimeVal === 'RUNTIME_REPLACE') console.error('Detected RUNTIME_REPLACE in window.__ENV__.VITE_ADMIN_TOKEN');
        if (viteVal === 'RUNTIME_REPLACE') console.error('Detected RUNTIME_REPLACE in import.meta.env.VITE_ADMIN_TOKEN');
    }

    if (viteVal && viteVal !== 'RUNTIME_REPLACE' && !viteVal.startsWith('__VITE_')) {
        return viteVal;
    }

    return '';
}
