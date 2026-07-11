// Worker + Durable Object bindings. Extended as tasks add the registry
// (D1/KV), Access config, etc.
export interface Env {
  TENANT: DurableObjectNamespace;
}
