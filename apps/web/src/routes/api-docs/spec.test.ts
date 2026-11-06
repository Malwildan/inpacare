import { describe, expect, it } from 'vitest';
import contract from '../../../../../contracts/openapi.json';
import { apiDocsSpec } from './spec';

describe('API docs specification', () => {
    it('reuses the contract with a relative same-origin server URL', async () => {
        const spec = await apiDocsSpec(async () => Response.json({ user: { id: 'user-1' } }));
        expect(spec.paths).toEqual(contract.paths);
        expect(spec.servers).toEqual([{ url: '/' }]);
        expect(spec.components.parameters.Origin.required).toBe(false);
        expect(contract.components.parameters.Origin.required).toBe(true);
    });

    it('does not expose the specification to anonymous sessions', async () => {
        await expect(apiDocsSpec(async () => new Response(null, { status: 401 })))
            .rejects.toMatchObject({ status: 401 });
    });
});
