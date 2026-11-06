declare module 'swagger-ui-dist/swagger-ui-bundle.js' {
    const SwaggerUIBundle: (options: Record<string, unknown>) => { destroy(): void };
    export default SwaggerUIBundle;
}
