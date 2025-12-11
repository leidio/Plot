import { useState, useEffect } from 'react';

export const useTheme = () => {
  const getTheme = () => {
    // First check if user has explicitly set a theme preference
    const stored = localStorage.getItem('theme');
    if (stored) {
      return stored === 'dark';
    }
    
    // Then check HTML attribute (from DaisyUI)
    const htmlTheme = document.documentElement.getAttribute('data-theme');
    if (htmlTheme) {
      return htmlTheme === 'dark';
    }
    
    // Finally, check system preference
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    
    return false;
  };

  const [isDark, setIsDark] = useState(getTheme);

  useEffect(() => {
    // Apply theme class to root element (for Tailwind)
    // AND data-theme attribute (for DaisyUI)
    const root = document.documentElement;
    const currentDataTheme = root.getAttribute('data-theme');
    const expectedTheme = isDark ? 'dark' : 'light';
    
    // Only update if it's different to avoid unnecessary updates
    if (currentDataTheme !== expectedTheme) {
      if (isDark) {
        root.classList.add('dark');
        root.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
      } else {
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
      }
    }
  }, [isDark]);

  // Listen for theme changes from other components and system preferences
  useEffect(() => {
    const root = document.documentElement;
    
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          const currentTheme = getTheme();
          if (currentTheme !== isDark) {
            setIsDark(currentTheme);
          }
        }
      }
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    // Listen for storage events (if theme changes in another tab)
    const handleStorageChange = (e) => {
      if (e.key === 'theme') {
        const newTheme = getTheme();
        if (newTheme !== isDark) {
          setIsDark(newTheme);
        }
      }
    };

    // Listen for system preference changes (only if no explicit preference is set)
    let mediaQuery = null;
    let handleSystemThemeChange = null;
    if (typeof window !== 'undefined' && window.matchMedia && !localStorage.getItem('theme')) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      handleSystemThemeChange = (e) => {
        // Only update if user hasn't set an explicit preference
        if (!localStorage.getItem('theme')) {
          setIsDark(e.matches);
        }
      };
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    }

    window.addEventListener('storage', handleStorageChange);

    return () => {
      observer.disconnect();
      window.removeEventListener('storage', handleStorageChange);
      if (mediaQuery && handleSystemThemeChange) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      }
    };
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  return { isDark, toggleTheme };
};

