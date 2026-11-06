import { describe, expect, it, vi } from 'vitest';
import { createSwaggerRequestInterceptor } from './request-interceptor';

describe('Swagger request interceptor', () => {
    it('uses same-origin credentials and adds the existing CSRF token to mutations', () => {
        const readToken = vi.fn(() => 'csrf-value');
        const intercept = createSwaggerRequestInterceptor('https://clinic.example', readToken);
        const request = intercept({ url: '/api/v1/tasks', method: 'POST', headers: { Accept: 'application/json' } });

        expect(request.url).toBe('https://clinic.example/api/v1/tasks');
        expect(request.credentials).toBe('same-origin');
        expect(request.headers).toEqual({ Accept: 'application/json', 'X-CSRF-TOKEN': 'csrf-value' });
        expect(readToken).toHaveBeenCalledOnce();
    });

    it('does not add CSRF to reads and rejects cross-origin requests', () => {
        const readToken = vi.fn(() => 'csrf-value');
        const intercept = createSwaggerRequestInterceptor('https://clinic.example', readToken);
        const request = intercept({ url: '/api/v1/tasks', method: 'GET' });

        expect(request.credentials).toBe('same-origin');
        expect(request.headers).toBeUndefined();
        expect(readToken).not.toHaveBeenCalled();
        expect(() => intercept({ url: 'https://other.example/api/v1/tasks', method: 'POST' })).toThrow(/only sends requests to this site/);
    });
});
