import { useState, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

interface UseFacebookSdkReturn {
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  login: () => Promise<any>;
  getLoginStatus: () => Promise<any>;
}

export function useFacebookSdk(appId: string): UseFacebookSdkReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appId) return;
    if (window.FB) {
      setIsLoaded(true);
      return;
    }

    setIsLoading(true);

    window.fbAsyncInit = () => {
      window.FB.init({
        appId,
        cookie: true,
        xfbml: true,
        version: 'v18.0',
      });
      setIsLoaded(true);
      setIsLoading(false);
    };

    // Load SDK script
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;

    script.onerror = () => {
      setError('Failed to load Facebook SDK');
      setIsLoading(false);
    };

    // Timeout fallback
    const timeout = setTimeout(() => {
      if (!isLoaded) {
        setError('Facebook SDK loading timeout');
        setIsLoading(false);
      }
    }, 10000);

    document.body.appendChild(script);

    return () => {
      clearTimeout(timeout);
    };
  }, [appId]);

  const login = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!window.FB) {
        reject(new Error('Facebook SDK not loaded'));
        return;
      }
      window.FB.login(
        (response: any) => {
          if (response.authResponse) {
            resolve(response.authResponse);
          } else {
            reject(new Error('Facebook login cancelled'));
          }
        },
        {
          scope: 'pages_show_list,pages_manage_metadata,pages_messaging,instagram_basic,instagram_manage_messages,leads_retrieval',
        }
      );
    });
  }, []);

  const getLoginStatus = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!window.FB) {
        reject(new Error('Facebook SDK not loaded'));
        return;
      }
      window.FB.getLoginStatus((response: any) => {
        resolve(response);
      });
    });
  }, []);

  return { isLoaded, isLoading, error, login, getLoginStatus };
}

export default useFacebookSdk;
