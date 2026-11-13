'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export default function CookieBanner() {
  const [show, setShow] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const consent = localStorage.getItem('cookie-consent');
    if (!consent && mountedRef.current) {
      setShow(true);
    }
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const accept = () => {
    localStorage.setItem('cookie-consent', 'accepted');
    setShow(false);
  };

  const decline = () => {
    localStorage.setItem('cookie-consent', 'declined');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg animate-slide-up"
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
    >
      <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              We value your privacy
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              We use a single CSRF protection cookie to secure your session. We do not use tracking cookies,
              advertising cookies, or share your data with advertisers. See our{' '}
              <Link href="/privacy-policy" className="text-orange-600 dark:text-orange-400 hover:underline">
                Privacy Policy
              </Link>
              {' '}for details.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={decline}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Decline
            </button>
            <button
              onClick={accept}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}