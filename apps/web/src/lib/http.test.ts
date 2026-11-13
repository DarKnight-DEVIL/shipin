/**
 * Unit tests for the shared fetch-with-timeout helper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout } from './http';

describe('fetchWithTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the fetch response', async () => {
    const fetchMock = vi.fn().mockResolvedValue('ok-response' as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchWithTimeout('https://example.com');
    expect(result).toBe('ok-response');
    expect(fetchMock).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('passes through custom options', async () => {
    const fetchMock = vi.fn().mockResolvedValue('r' as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchWithTimeout('https://example.com', { method: 'POST', headers: { 'x': '1' } });
    expect(fetchMock).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ method: 'POST', headers: { 'x': '1' } }));
  });

  it('aborts the request after the timeout elapses', async () => {
    let capturedSignal: AbortSignal | null = null;
    let abortReject: (err: Error) => void;
    const fetchMock = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      const signal = opts.signal as AbortSignal;
      capturedSignal = signal;
      // Return a promise we can control. When the signal aborts, we'll reject manually.
      return new Promise<Response>((_resolve, reject) => {
        abortReject = reject;
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const pending = fetchWithTimeout('https://example.com', {}, 1000);
    await vi.advanceTimersByTimeAsync(1100);

    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal!.aborted).toBe(true);
    // Manually trigger the abort rejection since the timer fired.
    abortReject!(new Error('Aborted'));
    await expect(pending).rejects.toThrow('Aborted');
  });

  it('clears the timer when the request completes in time', async () => {
    const fetchMock = vi.fn().mockResolvedValue('fast' as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const clearSpy = vi.spyOn(global, 'clearTimeout');

    const result = await fetchWithTimeout('https://example.com', {}, 10_000);
    expect(result).toBe('fast');
    expect(clearSpy).toHaveBeenCalled();
  });
});