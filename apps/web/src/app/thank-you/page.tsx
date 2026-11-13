import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Thank You',
  description: 'Your request has been submitted successfully. We will review it and get back to you shortly.',
};

export default function ThankYouPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-orange-100 dark:bg-orange-900/30 mb-6">
            <svg className="w-10 h-10 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Thank you!</h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Your shipping request has been submitted successfully.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">What happens next?</h3>
          <ul className="space-y-3 text-left text-gray-600 dark:text-gray-300">
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>We&rsquo;ll review your request and send a quote within 1 business day.</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>You&rsquo;ll receive an email with the quote and payment options.</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>After approval, we&rsquo;ll buy, inspect, and forward your items.</span>
            </li>
          </ul>
        </div>

        <div className="space-y-4">
          <Link
            href="/dashboard"
            className="btn btn--primary w-full py-3"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/requests/new"
            className="btn btn--ghost w-full py-3"
          >
            Submit another request
          </Link>
        </div>

        <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
          Questions? <Link href="/support" className="text-orange-600 dark:text-orange-400 hover:underline">Contact Support</Link>
        </p>
      </div>
    </main>
  );
}