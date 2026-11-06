type SwaggerRequest = {
    url: string;
    method?: string;
    credentials?: RequestCredentials;
    headers?: Record<string, string>;
};

export function createSwaggerRequestInterceptor(origin: string, readCsrfToken: () => string | undefined) {
    return (request: SwaggerRequest) => {
        const url = new URL(request.url, origin);
        if (url.origin !== origin) throw new Error('Swagger UI only sends requests to this site.');

        request.url = url.href;
        request.credentials = 'same-origin';
        if (request.method && !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) {
            const token = readCsrfToken();
            if (token) request.headers = { ...request.headers, 'X-CSRF-TOKEN': token };
        }
        return request;
    };
}
