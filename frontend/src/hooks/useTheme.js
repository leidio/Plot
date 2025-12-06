import { useState, useEffect } from 'react';

export const useTheme = () => {
  const getTheme = () => {
    const htmlTheme = document.documentElement.getAttribute('data-theme');
    if (htmlTheme) {
      return htmlTheme === 'dark';
    }
    const stored = localStorage.getItem('theme');
    if (stored) {
      return stored === 'dark';
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

  // Listen for theme changes from other components
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

    window.addEventListener('storage', handleStorageChange);

    return () => {
      observer.disconnect();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  return { isDark, toggleTheme };
};

