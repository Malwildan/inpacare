import openApi from '../../../../../contracts/openapi.json';
import { requireApiDocsSession } from './session';

export async function apiDocsSpec(fetcher: typeof fetch) {
    await requireApiDocsSession(fetcher);
    return {
        ...openApi,
        servers: [{ url: '/' }],
        components: {
            ...openApi.components,
            parameters: {
                ...openApi.components.parameters,
                Origin: {
                    ...openApi.components.parameters.Origin,
                    required: false,
                    description: 'Your browser supplies this header automatically for mutations.'
                }
            }
        }
    };
}
