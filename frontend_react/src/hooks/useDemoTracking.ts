import { useEffect, useRef, useCallback } from 'react';
import api from '../api/axios';

export function useDemoTracking() {
  const leadIdRef = useRef<number | null>(null);
  const scrollTracked = useRef(new Set<number>());

  const initSession = useCallback(async () => {
    try {
      // Get or generate visitor ID
      let visitorId = localStorage.getItem('DENTALOGIC_VISITOR_ID');
      if (!visitorId) {
        visitorId = `visitor_${Math.random().toString(36).substring(2, 10)}`;
        localStorage.setItem('DENTALOGIC_VISITOR_ID', visitorId);
      }

      // 1. Recover standard utm params or referer
      const urlParams = new URLSearchParams(window.location.search);
      const sourceAd = urlParams.get('utm_source') || urlParams.get('source') || document.referrer || 'direct';
      
      const { data } = await api.post('/tracking/session', {
        phone_number: visitorId,
        source_ad: sourceAd
      });
      
      leadIdRef.current = data.lead_id;
      
      // Track page view automatically
      trackEvent('page_view', { path: window.location.pathname });
    } catch (err) {
      console.error('Failed to init demo session', err);
    }
  }, []);

  useEffect(() => {
    if (!leadIdRef.current) {
      initSession();
    }
  }, [initSession]);

  const trackEvent = useCallback(async (eventType: string, eventData: any = {}) => {
    if (!leadIdRef.current) return;
    try {
      await api.post('/tracking/event', {
        lead_id: leadIdRef.current,
        event_type: eventType,
        event_data: eventData
      });
    } catch (err) {
      console.error('Failed to track event', err);
    }
  }, []);

  // Scroll depth tracking
  useEffect(() => {
    const handleScroll = () => {
      const scrollPercent = Math.round(
        (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
      );

      if (scrollPercent >= 50 && !scrollTracked.current.has(50)) {
        scrollTracked.current.add(50);
        trackEvent('scroll_depth_50');
      }

      if (scrollPercent >= 90 && !scrollTracked.current.has(90)) {
        scrollTracked.current.add(90);
        trackEvent('scroll_depth_90');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [trackEvent]);

  return { trackEvent };
}
