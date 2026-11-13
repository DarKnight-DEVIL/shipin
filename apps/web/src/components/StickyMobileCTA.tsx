'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function StickyMobileCTA() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!auth) return;
    try {
      return onAuthStateChanged(auth, (user) => setLoggedIn(Boolean(user)));
    } catch {
      return undefined;
    }
  }, []);

  const startHref = loggedIn ? '/dashboard' : '/login?next=/requests/new';

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.8);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <Link
      href={startHref}
      className="btn btn--primary fixed bottom-0 left-0 right-0 z-40 w-full py-4 text-center text-lg font-semibold rounded-none border-t border-orange-500 shadow-2xl md:hidden animate-slide-up"
      style={{ minHeight: '64px' }}
      aria-label="Start a new shipping request"
    >
      Start a new request
    </Link>
  );
}