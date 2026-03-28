import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSmartScrollReturn {
  scrollDirection: 'up' | 'down' | null;
  isScrolled: boolean;
  scrollY: number;
  isAtBottom: boolean;
}

export function useSmartScroll(threshold: number = 50): UseSmartScrollReturn {
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const lastScrollY = useRef(0);

  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;

    setScrollY(currentScrollY);
    setIsScrolled(currentScrollY > threshold);

    if (currentScrollY > lastScrollY.current) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }

    lastScrollY.current = currentScrollY;

    // Check if at bottom
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    setIsAtBottom(currentScrollY + windowHeight >= documentHeight - 50);
  }, [threshold]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return { scrollDirection, isScrolled, scrollY, isAtBottom };
}

export default useSmartScroll;
