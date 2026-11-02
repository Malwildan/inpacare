require("reflect-metadata");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { APP_GUARD } = require("@nestjs/core");
const { getMetadataStorage } = require("class-validator");
const {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  HTTP_CODE_METADATA,
} = require("@nestjs/common/constants");
const { AppModule } = require("../../dist/app.module");
const { SessionGuard } = require("../../dist/presentation/http/guards/session.guard");

const contract = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../../../contracts/openapi.json"),
    "utf8",
  ),
);
const verbs = {
  0: "get",
  1: "post",
  2: "put",
  3: "delete",
  4: "patch",
  5: "options",
  6: "head",
  7: "all",
};
const verbNames = Object.fromEntries(
  Object.entries(verbs).map(([n, v]) => [v, n.toUpperCase()]),
);
const toOpenApiPath = (route) => route.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
const joinPath = (...parts) =>
  `/${parts.filter(Boolean).join("/")}`
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";

function controllersIn(moduleClass, seen = new Set()) {
  if (seen.has(moduleClass)) return [];
  seen.add(moduleClass);
  const controllers =
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, moduleClass) || [];
  const imports =
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, moduleClass) || [];
  const children = imports.flatMap((entry) => {
    const child = entry?.module || entry;
    return typeof child === "function" ? controllersIn(child, seen) : [];
  });
  return [...controllers, ...children];
}

function registeredRoutes() {
  const routes = [];
  for (const controller of controllersIn(AppModule)) {
    const base = Reflect.getMetadata(PATH_METADATA, controller) || "";
    for (const methodName of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[methodName];
      if (typeof handler !== "function") continue;
      const routePath = Reflect.getMetadata(PATH_METADATA, handler);
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      if (routePath === undefined || method === undefined) continue;
      const localPath = joinPath(
        base,
        Array.isArray(routePath) ? routePath[0] : routePath,
      );
      const isHealth = localPath === "/health";
      const fullPath = isHealth ? localPath : joinPath("/api/v1", localPath);
      const roles =
        Reflect.getMetadata("roles", handler) ??
        Reflect.getMetadata("roles", controller) ??
        [];
      const publicRoute =
        Reflect.getMetadata("public", handler) === true ||
        Reflect.getMetadata("public", controller) === true;
      const explicitStatus = Reflect.getMetadata(HTTP_CODE_METADATA, handler);
      const defaultStatus = method === 1 ? 201 : 200;
      routes.push({
        controller,
        methodName,
        handler,
        method: verbs[method],
        path: toOpenApiPath(fullPath),
        status: explicitStatus ?? defaultStatus,
        roles,
        publicRoute,
      });
    }
  }
  return routes;
}

function resolveSchema(schema) {
  while (schema?.$ref)
    schema = contract.components.schemas[schema.$ref.split("/").at(-1)];
  return schema;
}

function dtoValidationShape(dto) {
  return getMetadataStorage().getTargetValidationMetadatas(
    dto,
    dto.name,
    false,
    false,
  );
}

test("OpenAPI paths, methods, success codes, DTO properties, and guards match compiled Nest metadata", () => {
  const routes = registeredRoutes();
  const expected = new Map();
  for (const route of routes) {
    const key = `${route.method.toUpperCase()} ${route.path}`;
    assert.equal(expected.has(key), false, `duplicate Nest route ${key}`);
    expected.set(key, route);
    const operation = contract.paths[route.path]?.[route.method];
    assert.ok(operation, `OpenAPI is missing ${key}`);
    const success = Object.keys(operation.responses).filter((status) =>
      /^2\d\d$/.test(status),
    );
    assert.deepEqual(
      success,
      [String(route.status)],
      `${key} success status drift`,
    );
    assert.deepEqual(
      operation["x-controller-roles"] ?? [],
      route.roles,
      `${key} role metadata drift`,
    );
    if (route.publicRoute)
      assert.deepEqual(
        operation.security ?? [],
        [],
        `${key} must remain public`,
      );
    else
      assert.ok(
        operation.security?.some((set) => Object.hasOwn(set, "SessionCookie")),
        `${key} must require a session`,
      );
    if (
      !["get", "head", "options"].includes(route.method) &&
      !route.publicRoute
    ) {
      assert.ok(
        operation.security?.some((set) => Object.hasOwn(set, "CSRFToken")),
        `${key} must require CSRF`,
      );
      const hasOrigin = (operation.parameters || []).some(
        (parameter) =>
          parameter.$ref === "#/components/parameters/Origin" ||
          parameter.name === "Origin",
      );
      assert.ok(hasOrigin, `${key} must require Origin`);
    }

    const params =
      Reflect.getMetadata(
        "design:paramtypes",
        route.controller.prototype,
        route.methodName,
      ) || [];
    const requestSchema = resolveSchema(
      operation.requestBody?.content?.["application/json"]?.schema,
    );
    const dtoParams = params.filter(
      (parameter) =>
        typeof parameter === "function" &&
        dtoValidationShape(parameter).length > 0,
    );
    if (requestSchema && dtoParams.length) {
      const dto = dtoParams.at(-1);
      const validations = dtoValidationShape(dto);
      const properties = [
        ...new Set(validations.map((item) => item.propertyName)),
      ].sort();
      assert.deepEqual(
        Object.keys(requestSchema.properties || {}).sort(),
        properties,
        `${key} request DTO property drift (${dto.name})`,
      );
      const optional = new Set(
        validations
          .filter((item) => item.type === "conditionalValidation")
          .map((item) => item.propertyName),
      );
      const required = properties
        .filter((property) => !optional.has(property))
        .sort();
      assert.deepEqual(
        [...(requestSchema.required || [])].sort(),
        required,
        `${key} request DTO required-field drift (${dto.name}; contract=${JSON.stringify(requestSchema.required)})`,
      );
    }
  }

  const documented = new Set();
  for (const [routePath, operations] of Object.entries(contract.paths)) {
    for (const method of Object.keys(operations))
      documented.add(`${method.toUpperCase()} ${routePath}`);
  }
  assert.deepEqual(
    [...documented].sort(),
    [...expected.keys()].sort(),
    "OpenAPI contains a route not registered by Nest",
  );

  const providers =
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) || [];
  assert.ok(
    providers.some(
      (provider) =>
        provider?.provide === APP_GUARD && provider.useClass === SessionGuard,
    ),
    "SessionGuard must be globally registered",
  );
});
